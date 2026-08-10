"use client";

import { useEffect, useRef, useState } from "react";
import customHistory from "./custom-history.json";
import historyData from "./history-data.json";
import { parseRatePrefill } from "./rate-prefill";
import { cityKey, clean, isSpotGtaPickup, zoneFor } from "./rate-matching";
import {
  cclsQuebecRates,
  cclsQuebecZones,
  customerProfiles,
  destinationSuggestions,
  ftlLtlFuelDestinations,
  ftlZones,
  montrealCard,
  montrealExterior,
  montrealLocal,
  ontarioZones,
  palletLaneCards,
  rateCards,
  spotOntarioZones,
  straightTruckMax5Ton,
  vessiReturnLaneCards,
  type CustomerId,
  type FuelMode,
  type RateCard,
  type ServiceChoice,
  type ServiceMode,
  type WarehouseId,
} from "./rate-data";

type HistoryRecord = {
  date: string;
  customer: string;
  origin: string;
  destination: string;
  skids: number | null;
  service: string;
  price: number;
  kind: string;
};

type AccessorialKey =
  | "tailgate"
  | "inside"
  | "appointment"
  | "returns"
  | "dunnage"
  | "driverAssist";
type OriginMode = "warehouse" | "custom";

type RateResolution = {
  base: number;
  note: string;
  card: RateCard;
  fuelMode: FuelMode;
  accessorialRates?: Record<AccessorialKey, number>;
  includedAccessorialIds?: AccessorialKey[];
};

type FuelSchedule = {
  ltl: number;
  tl: number;
  effective: string;
  status: "checking" | "live" | "saved";
};

const allHistory = [
  ...(historyData as HistoryRecord[]),
  ...(customHistory as HistoryRecord[]),
];
const pickupSuggestions = Array.from(
  new Set([
    ...destinationSuggestions,
    ...(customHistory as HistoryRecord[]).map((record) => record.origin),
  ]),
).sort((a, b) => a.localeCompare(b));

const APPS_FSC_URL = "https://www.appsexpress.com/express/fuel_surcharge";
const APPS_FSC_READER_URL =
  "https://r.jina.ai/http://www.appsexpress.com/express/fuel_surcharge";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const defaultAccessorials: Record<AccessorialKey, number> = {
  tailgate: 45,
  inside: 45,
  appointment: 25,
  returns: 45,
  dunnage: 45,
  driverAssist: 80,
};

function rateIndex(pallets: number, max: number) {
  const count = Math.max(1, pallets || 1);
  if (count >= max) return max - 1;
  return Math.min(count - 1, max - 1);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round5(value: number) {
  return Math.round(value / 5) * 5;
}

function historyOriginKey(origin: string) {
  const key = cityKey(origin);
  if (
    ["montreal", "dorval", "lachine", "saint-laurent", "brossard", "laval"].includes(
      key,
    )
  ) {
    return "montreal";
  }
  return key;
}

function serviceMode(choice: ServiceChoice): ServiceMode {
  return choice;
}

function serviceLabel(service: ServiceMode) {
  if (service === "straight") return "Straight Truck";
  return service.toUpperCase();
}

function fuelServiceMode(
  destination: string,
  service: ServiceMode,
): "ltl" | "ftl" {
  if (service === "straight") return "ltl";
  if (
    service === "ftl" &&
    ftlLtlFuelDestinations.has(cityKey(destination))
  ) {
    return "ltl";
  }
  return service;
}

function parseAppsFuel(text: string) {
  const plain = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
  const match = plain.match(
    /(\d{2}-[A-Za-z]{3}-\d{2})\s*(?:\||\s)\s*(\d{1,2})\s*(?:\||\s)\s*(\d{1,3}(?:\.\d+)?)\s*(?:\||\s)\s*(\d{1,3}(?:\.\d+)?)/,
  );
  if (!match) throw new Error("Current APPS row was not found");
  const months: Record<string, string> = {
    Jan: "January",
    Feb: "February",
    Mar: "March",
    Apr: "April",
    May: "May",
    Jun: "June",
    Jul: "July",
    Aug: "August",
    Sep: "September",
    Oct: "October",
    Nov: "November",
    Dec: "December",
  };
  const [, date, , ltl, tl] = match;
  const dateParts = date.match(/^(\d{2})-([A-Za-z]{3})-(\d{2})$/);
  const effective = dateParts
    ? `${months[dateParts[2]] ?? dateParts[2]} ${Number(dateParts[1])}, 20${dateParts[3]}`
    : date;
  return { ltl: Number(ltl), tl: Number(tl), effective };
}

function resolveCustomerRate(
  warehouse: WarehouseId,
  customer: CustomerId,
  destinationInput: string,
  pallets: number,
  service: ServiceMode,
): RateResolution | null {
  const destination = cityKey(destinationInput);
  const card = rateCards[customer];
  const palletTable = palletLaneCards[customer];

  if (
    customer === "wheels18" &&
    (warehouse !== "mississauga" || service !== "ltl" || pallets > 7)
  ) {
    return null;
  }

  if (
    warehouse === "mississauga" &&
    customer === "spot" &&
    service === "straight"
  ) {
    const zone = zoneFor(destination, spotOntarioZones);
    if (zone && straightTruckMax5Ton[zone - 1] !== undefined) {
      return {
        base: straightTruckMax5Ton[zone - 1],
        note: `Spot Straight Truck - Max 5 Ton Zone ${zone}`,
        card,
        fuelMode: "add",
      };
    }
    return null;
  }

  if (
    warehouse === "mississauga" &&
    service === "ltl" &&
    palletTable?.[destination]
  ) {
    const values = palletTable[destination];
    return {
      base: values[rateIndex(pallets, values.length)],
      note: `${card.label} exact destination pallet table`,
      card,
      fuelMode: card.fuelMode,
    };
  }

  if (customer === "ccls" && service === "ltl") {
    if (warehouse === "montreal") {
      const zone = zoneFor(destination, cclsQuebecZones);
      if (zone) {
        const values = cclsQuebecRates[zone];
        return {
          base: values[rateIndex(pallets, values.length)],
          note: `CCLS Quebec store-delivery Zone ${zone} from Dorval`,
          card,
          fuelMode: "add",
          accessorialRates: {
            tailgate: 45,
            inside: 55,
            appointment: 30,
            returns: 45,
            dunnage: 45,
            driverAssist: 80,
          },
        };
      }
    } else {
      const zone = zoneFor(destination, ontarioZones);
      const regional =
        zone && zone <= 2
          ? [43, 33.6, 50.4, 67.2, 79.5, 95.4, 111.3, 127.2, 143.1, 133, 146.3, 159.6]
          : zone && zone <= 4
            ? [46.44, 36.2, 54.3, 72.4, 86, 103.2, 120.4, 137.6, 154.8, 144, 158.4, 172.8]
            : null;
      if (regional) {
        return {
          base: regional[rateIndex(pallets, regional.length)],
          note: `CCLS / Uniqlo supplies ${zone && zone <= 2 ? "GTA" : "Southern Ontario"} pallet table`,
          card,
          fuelMode: "add",
        };
      }
    }
  }

  if (customer === "muji" && service === "ltl") {
    const zone = zoneFor(destination, ontarioZones);
    const values = zone ? card.ltl?.[zone] : undefined;
    if (zone && values) {
      return {
        base: values[rateIndex(pallets, values.length)],
        note: `Muji 2026 LTL Zone ${zone}`,
        card,
        fuelMode: "included",
      };
    }
  }

  if (customer === "vessi" && service === "ltl") {
    const zone = zoneFor(destination, ontarioZones);
    if (warehouse === "mississauga" && zone === 1) {
      return {
        base: 54 + (Math.max(1, pallets) - 1) * 18 + 35 + 35,
        note:
          "Vessi GTA pallet rate with contracted appointment and inside delivery",
        card,
        fuelMode: "add",
        includedAccessorialIds: ["appointment", "inside"],
      };
    }
  }

  if (warehouse === "mississauga") {
    const zone =
      service === "ftl"
        ? zoneFor(destination, ftlZones)
        : customer === "spot"
          ? zoneFor(destination, spotOntarioZones)
        : zoneFor(destination, ontarioZones);

    if (service === "ltl" && customer === "canada") {
      if (
        ["brampton", "mississauga", "north york"].includes(destination) &&
        card.local
      ) {
        return {
          base: card.local[rateIndex(pallets, card.local.length)],
          note: "Canada Cartage local pallet lane",
          card,
          fuelMode: "add",
        };
      }
      if (destination === "halton hills" && card.halton) {
        return {
          base: card.halton[rateIndex(pallets, card.halton.length)],
          note: "Canada Cartage Halton Hills pallet lane",
          card,
          fuelMode: "add",
        };
      }
    }

    if (
      service === "ltl" &&
      customer === "obibox" &&
      zone === 1 &&
      pallets <= 5 &&
      card.gta
    ) {
      return {
        base: card.gta[rateIndex(pallets, card.gta.length)],
        note: "Obibox ex-GTA to GTA pallet rate",
        card,
        fuelMode: "add",
      };
    }

    if (service === "ltl" && zone && card.ltl?.[zone]) {
      const values = card.ltl[zone];
      return {
        base: values[rateIndex(pallets, values.length)],
        note: `${card.label} Ontario LTL Zone ${zone}`,
        card,
        fuelMode: card.fuelMode,
      };
    }

    if (service === "ftl" && zone && card.ftl?.[zone - 1] !== undefined) {
      return {
        base: card.ftl[zone - 1],
        note: `${card.label} FTL Zone ${zone}`,
        card,
        fuelMode: card.fuelMode,
      };
    }

    if (
      customer === "spot" &&
      service === "ltl" &&
      destination === "montreal local"
    ) {
      return {
        base: montrealCard.local[rateIndex(pallets, montrealCard.local.length)],
        note: "Generic MTL LTL Rates - Local Zones - Rate per pallet",
        card,
        fuelMode: "add",
      };
    }

    if (
      customer === "spot" &&
      service === "ltl" &&
      destination === "montreal exterior"
    ) {
      return {
        base:
          montrealCard.exterior[
            rateIndex(pallets, montrealCard.exterior.length)
          ],
        note: "Generic MTL LTL Rates - Exterior Zones - Rate per pallet",
        card,
        fuelMode: "add",
      };
    }

    if (
      customer === "spot" &&
      service === "ltl" &&
      ["montreal", "dorval", "lachine", "saint-laurent", "brossard", "laval"].includes(
        destination,
      )
    ) {
      return {
        base: montrealCard.local[rateIndex(pallets, montrealCard.local.length)],
        note: "Spot Montreal local-zone LTL",
        card,
        fuelMode: "add",
      };
    }
    return null;
  }

  if (
    customer === "spot" &&
    service === "ltl" &&
    destination === "montreal local"
  ) {
    return {
      base: montrealCard.local[rateIndex(pallets, montrealCard.local.length)],
      note: "Generic MTL LTL Rates - Local Zones - Rate per pallet",
      card,
      fuelMode: "add",
    };
  }

  if (
    customer === "spot" &&
    service === "ltl" &&
    destination === "montreal exterior"
  ) {
    return {
      base:
        montrealCard.exterior[rateIndex(pallets, montrealCard.exterior.length)],
      note: "Generic MTL LTL Rates - Exterior Zones - Rate per pallet",
      card,
      fuelMode: "add",
    };
  }

  const ontarioZone = zoneFor(destination, ontarioZones);
  if (
    customer === "spot" &&
    service === "ltl" &&
    ontarioZone &&
    ontarioZone <= 3
  ) {
    return {
      base: montrealCard.local[
        rateIndex(pallets, montrealCard.local.length)
      ],
      note: "Spot Montreal-to-GTA pallet table",
      card,
      fuelMode: "add",
    };
  }

  if (
    customer === "spot" &&
    service === "ltl" &&
    montrealLocal.some((city) => clean(city) === clean(destination))
  ) {
    return {
      base: montrealCard.local[rateIndex(pallets, montrealCard.local.length)],
      note: "Spot Montreal local-zone LTL",
      card,
      fuelMode: "add",
    };
  }

  if (
    customer === "spot" &&
    service === "ltl" &&
    montrealExterior.some((city) => clean(city) === clean(destination))
  ) {
    return {
      base:
        montrealCard.exterior[rateIndex(pallets, montrealCard.exterior.length)],
      note: "Spot Montreal exterior-zone LTL",
      card,
      fuelMode: "add",
    };
  }

  if (customer === "spot" && service === "ftl") {
    const zone = zoneFor(destination, ftlZones);
    if (zone && card.ftl?.[zone - 1] !== undefined) {
      return {
        base: card.ftl[zone - 1],
        note: `Spot generic FTL Zone ${zone}`,
        card,
        fuelMode: "add",
      };
    }
  }

  if (
    customer === "nippon" &&
    service === "ltl" &&
    montrealLocal.some((city) => clean(city) === clean(destination))
  ) {
    return {
      base: montrealCard.local[rateIndex(pallets, montrealCard.local.length)],
      note: "Nippon Montreal local-zone LTL",
      card,
      fuelMode: "included",
    };
  }

  if (
    customer === "nippon" &&
    service === "ltl" &&
    montrealExterior.some((city) => clean(city) === clean(destination))
  ) {
    return {
      base:
        montrealCard.exterior[rateIndex(pallets, montrealCard.exterior.length)],
      note: "Nippon Montreal exterior-zone LTL",
      card,
      fuelMode: "included",
    };
  }

  if (
    customer === "gobolt" &&
    service === "ltl" &&
    ontarioZone &&
    ontarioZone <= 4
  ) {
    return {
      base: montrealCard.gta[rateIndex(pallets, montrealCard.gta.length)],
      note: "GoBolt YUL2 / Montreal to GTA LTL card",
      card,
      fuelMode: "included",
    };
  }

  if (customer === "gobolt" && service === "ltl" && destination === "ottawa") {
    return {
      base: montrealCard.ottawa[rateIndex(pallets, montrealCard.ottawa.length)],
      note: "GoBolt YUL2 / Montreal to Ottawa LTL card",
      card,
      fuelMode: "included",
    };
  }

  if (
    customer === "gobolt" &&
    service === "ftl" &&
    ontarioZone &&
    ontarioZone <= 4
  ) {
    return {
      base: montrealCard.gtaFtl,
      note: "GoBolt YUL2 / Montreal to GTA FTL card",
      card,
      fuelMode: "included",
    };
  }

  if (customer === "gobolt" && service === "ftl" && destination === "ottawa") {
    return {
      base: montrealCard.ottawaFtl,
      note: "GoBolt YUL2 / Montreal to Ottawa FTL card",
      card,
      fuelMode: "included",
    };
  }

  return null;
}

function resolveCustomPickupRate(
  customer: CustomerId,
  pickupInput: string,
  destinationInput: string,
  pallets: number,
  service: ServiceMode,
): RateResolution | null {
  const pickup = cityKey(pickupInput);
  const destination = cityKey(destinationInput);

  if (
    customer === "vessi" &&
    service === "ltl" &&
    destination === "mississauga" &&
    vessiReturnLaneCards[pickup]
  ) {
    const values = vessiReturnLaneCards[pickup];
    return {
      base: values[rateIndex(pallets, values.length)],
      note: `Vessi return pallet table from ${pickupInput.trim()} to Mississauga`,
      card: rateCards.vessi,
      fuelMode: "included",
    };
  }

  return null;
}

export function RateCalculator() {
  const [originMode, setOriginMode] = useState<OriginMode>("warehouse");
  const [warehouse, setWarehouse] = useState<WarehouseId>("mississauga");
  const [pickupCity, setPickupCity] = useState("");
  const [destination, setDestination] = useState("");
  const [customer, setCustomer] = useState<CustomerId>("spot");
  const [pallets, setPallets] = useState(0);
  const [service, setService] = useState<ServiceChoice>("ltl");
  const [tailgate, setTailgate] = useState(false);
  const [inside, setInside] = useState(false);
  const [appointment, setAppointment] = useState(false);
  const [returns, setReturns] = useState(false);
  const [dunnage, setDunnage] = useState(false);
  const [driverAssist, setDriverAssist] = useState(false);
  const [helpers, setHelpers] = useState(0);
  const [market, setMarket] = useState(10);
  const [fscOverride, setFscOverride] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [fuel, setFuel] = useState<FuelSchedule>({
    ltl: 35.4,
    tl: 83.2,
    effective: "July 27, 2026",
    status: "checking",
  });
  const resultRef = useRef<HTMLElement>(null);

  const activeProfile =
    customerProfiles.find((profile) => profile.id === customer) ??
    customerProfiles[0];
  const mode = serviceMode(service);
  const fuelService = fuelServiceMode(destination, mode);
  const card = rateCards[customer];
  const automaticFsc =
    card.preferredFsc ?? (fuelService === "ftl" ? fuel.tl : fuel.ltl);
  const fsc = fscOverride ?? automaticFsc;
  const originReady =
    originMode === "warehouse" || Boolean(pickupCity.trim());
  const loadReady = pallets > 0 || mode !== "ltl";
  const pickupKey = cityKey(pickupCity);
  let effectiveWarehouse: WarehouseId | null = null;
  if (originMode === "warehouse") {
    effectiveWarehouse = warehouse;
  } else if (
    pickupKey === "mississauga" ||
    (customer === "spot" && isSpotGtaPickup(pickupCity))
  ) {
    effectiveWarehouse = "mississauga";
  } else if (
    ["montreal", "dorval", "lachine", "saint-laurent"].includes(pickupKey)
  ) {
    effectiveWarehouse = "montreal";
  }

  const refreshFuel = async () => {
    setFuel((current) => ({ ...current, status: "checking" }));
    let loaded = false;
    for (const url of [APPS_FSC_READER_URL, APPS_FSC_URL]) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const live = parseAppsFuel(await response.text());
        setFuel({ ...live, status: "live" });
        loaded = true;
        break;
      } catch {
        // Try the next source, then retain the saved schedule.
      } finally {
        window.clearTimeout(timeout);
      }
    }
    if (!loaded) {
      setFuel((current) => ({ ...current, status: "saved" }));
    }
  };

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refreshFuel(), 0);
    return () => window.clearTimeout(refreshTimer);
  }, []);

  useEffect(() => {
    const prefillTimer = window.setTimeout(() => {
      const prefill = parseRatePrefill(
        window.location.search,
        customerProfiles.map((profile) => profile.id),
      );
      if (!prefill) return;

      if (prefill.pickup) {
        setOriginMode("custom");
        setPickupCity(prefill.pickup);
      } else if (prefill.warehouse) {
        setOriginMode("warehouse");
        setWarehouse(prefill.warehouse);
      }

      if (prefill.destination) setDestination(prefill.destination);
      if (prefill.customer) setCustomer(prefill.customer as CustomerId);
      if (prefill.service) setService(prefill.service);
      if (prefill.pallets !== null) setPallets(prefill.pallets);
      if (prefill.helpers !== null) setHelpers(prefill.helpers);
      if (prefill.market !== null) setMarket(prefill.market);

      setTailgate(prefill.tailgate);
      setInside(prefill.inside);
      setAppointment(prefill.appointment);
      setReturns(prefill.returns);
      setDunnage(prefill.dunnage);
      setDriverAssist(prefill.driverAssist);
    }, 0);

    return () => window.clearTimeout(prefillTimer);
  }, []);

  const matches = (() => {
    if (!destination || !originReady || !loadReady) return [];
    const destinationKey = cityKey(destination);
    const pickupKey = cityKey(pickupCity);
    const selectedCustomer = clean(activeProfile.label);
    return allHistory
      .filter((record) => {
        const sameLane =
          (originMode === "warehouse"
            ? historyOriginKey(record.origin) === warehouse
            : cityKey(record.origin) === pickupKey) &&
          cityKey(record.destination) === destinationKey;
        if (!sameLane) return false;
        if (customer === "spot") return true;
        const recordCustomer = clean(record.customer);
        return (
          recordCustomer.includes(selectedCustomer) ||
          selectedCustomer.includes(recordCustomer)
        );
      })
      .map((record) => {
        const skidDistance = record.skids
          ? Math.abs(record.skids - pallets)
          : 20;
        const servicePenalty =
          mode === "ftl"
            ? record.service === "FTL"
              ? 0
              : 8
            : record.service === "FTL"
              ? 8
              : 0;
        return { record, score: skidDistance + servicePenalty };
      })
      .sort(
        (a, b) =>
          a.score - b.score || b.record.date.localeCompare(a.record.date),
      )
      .slice(0, 8);
  })();

  const quote = (() => {
    const rate =
      destination && originReady && loadReady
        ? effectiveWarehouse
          ? resolveCustomerRate(
              effectiveWarehouse,
              customer,
              destination,
              pallets,
              mode,
            )
          : resolveCustomPickupRate(
              customer,
              pickupCity,
              destination,
              pallets,
              mode,
            )
        : null;
    const historyMedian = median(
      matches.slice(0, 5).map((match) => match.record.price),
    );
    if (!destination || !originReady || !loadReady) {
      return {
        rate: null,
        historyMedian,
        accessorials: 0,
        helperCharge: 0,
        fuelCharge: 0,
        tariffTotal: null,
        suggested: null,
        low: null,
        high: null,
      };
    }

    const selectedAccessorials: Array<[AccessorialKey, boolean]> = [
      ["tailgate", tailgate],
      ["inside", inside],
      ["appointment", appointment],
      ["returns", returns],
      ["dunnage", dunnage],
      ["driverAssist", driverAssist],
    ];
    const included = new Set(rate?.includedAccessorialIds ?? []);
    const accessorialRates = rate?.accessorialRates ?? defaultAccessorials;
    const accessorials = selectedAccessorials.reduce(
      (sum, [key, selected]) =>
        sum + (selected && !included.has(key) ? accessorialRates[key] : 0),
      0,
    );
    const helperCharge = helpers * 150;
    if (!rate) {
      const historicalTotal =
        historyMedian === null
          ? null
          : historyMedian + accessorials + helperCharge;
      const suggested =
        historicalTotal === null
          ? null
          : round5(historicalTotal * (1 + market / 100));
      return {
        rate: null,
        historyMedian,
        accessorials,
        helperCharge,
        fuelCharge: 0,
        tariffTotal: null,
        suggested,
        low: suggested === null ? null : round5(suggested * 0.97),
        high: suggested === null ? null : round5(suggested * 1.08),
      };
    }

    const fuelCharge =
      rate.fuelMode === "included" ? 0 : rate.base * (fsc / 100);
    const tariffTotal =
      rate.base + fuelCharge + accessorials + helperCharge;
    const suggested = round5(tariffTotal * (1 + market / 100));
    return {
      rate,
      historyMedian,
      accessorials,
      helperCharge,
      fuelCharge,
      tariffTotal,
      suggested,
      low: round5(suggested * 0.97),
      high: round5(suggested * 1.08),
    };
  })();

  const warehouseLabel =
    warehouse === "mississauga"
      ? "Mississauga warehouse"
      : "Montreal warehouse";
  const originLabel =
    originMode === "warehouse"
      ? warehouseLabel
      : pickupCity.trim() || "enter a pickup";
  const quoteLine =
    !loadReady
      ? "Pallet count is required before preparing a customer quote."
      : quote.suggested === null
        ? `Please obtain a live rate for ${originLabel} to ${destination || "the selected destination"}.`
        : `It would cost ${currency.format(quote.suggested)}.`;

  const reset = () => {
    setOriginMode("warehouse");
    setWarehouse("mississauga");
    setPickupCity("");
    setDestination("");
    setCustomer("spot");
    setPallets(0);
    setService("ltl");
    setTailgate(false);
    setInside(false);
    setAppointment(false);
    setReturns(false);
    setDunnage(false);
    setDriverAssist(false);
    setHelpers(0);
    setMarket(10);
    setFscOverride(null);
  };

  const showResults = () => {
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copyQuote = async () => {
    try {
      await navigator.clipboard.writeText(quoteLine);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <circle cx="10" cy="33" r="3.5" />
              <path d="M14 33h5.5l9-12H38" />
              <path d="m32 15 6 6-6 6" />
            </svg>
          </span>
          <div>
            <strong>Rate Calculator</strong>
            <span>Built by Anmol Sahni</span>
          </div>
        </div>
        <div className={`fuel-pill ${fuel.status}`}>
          <span className="fuel-dot" aria-hidden="true" />
          <div>
            <strong>
              APPS {fuel.ltl}% LTL / {fuel.tl}% TL
            </strong>
            <span>
              {fuel.status === "live"
                ? `Live · ${fuel.effective}`
                : fuel.status === "checking"
                  ? "Refreshing current fuel"
                  : `Saved · ${fuel.effective}`}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => void refreshFuel()}
            aria-label="Refresh fuel surcharge"
            title="Refresh fuel surcharge"
            disabled={fuel.status === "checking"}
          >
            ↻
          </button>
        </div>
      </header>

      <main className="dashboard">
        <aside className="quote-tool" aria-label="Quote inputs">
          <div className="tool-heading">
            <div>
              <span className="eyebrow">New quote</span>
              <h1>Build a pallet rate</h1>
            </div>
            <button className="text-button" type="button" onClick={reset}>
              Reset
            </button>
          </div>

          <div className="form-stack">
            <label className="field">
              <span>Pricing agreement</span>
              <select
                value={customer}
                onChange={(event) => {
                  setCustomer(event.target.value as CustomerId);
                  setFscOverride(null);
                }}
              >
                {customerProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
              <small>{activeProfile.hint}</small>
            </label>

            <fieldset className="field">
              <legend>Pickup origin</legend>
              <div className="segmented-control two-options">
                <button
                  type="button"
                  className={originMode === "warehouse" ? "active" : ""}
                  aria-pressed={originMode === "warehouse"}
                  onClick={() => setOriginMode("warehouse")}
                >
                  Warehouse
                </button>
                <button
                  type="button"
                  className={originMode === "custom" ? "active" : ""}
                  aria-pressed={originMode === "custom"}
                  onClick={() => setOriginMode("custom")}
                >
                  Other pickup
                </button>
              </div>
            </fieldset>

            <div className="form-grid">
              {originMode === "warehouse" ? (
                <label className="field">
                  <span>Warehouse</span>
                  <select
                    value={warehouse}
                    onChange={(event) =>
                      setWarehouse(event.target.value as WarehouseId)
                    }
                  >
                    <option value="mississauga">Mississauga</option>
                    <option value="montreal">Montreal</option>
                  </select>
                </label>
              ) : (
                <label className="field">
                  <span>Pickup city</span>
                  <input
                    type="text"
                    list="pickup-list"
                    placeholder="City, province"
                    value={pickupCity}
                    onChange={(event) => {
                      setPickupCity(event.target.value);
                      setFscOverride(null);
                    }}
                  />
                  <datalist id="pickup-list">
                    {pickupSuggestions.map((city) => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>
                </label>
              )}

              <label className="field">
                <span>Skids / pallets</span>
                <div className="stepper">
                  <button
                    type="button"
                    onClick={() => setPallets((value) => Math.max(0, value - 1))}
                    aria-label="Remove one pallet"
                    title="Remove one pallet"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={pallets}
                    onChange={(event) =>
                      setPallets(
                        Math.max(0, Math.min(12, Number(event.target.value) || 0)),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setPallets((value) => Math.min(12, value + 1))}
                    aria-label="Add one pallet"
                    title="Add one pallet"
                  >
                    +
                  </button>
                </div>
              </label>
            </div>

            <label className="field">
              <span>Destination</span>
              <input
                type="text"
                list="destination-list"
                placeholder="City, province"
                value={destination}
                onChange={(event) => {
                  setDestination(event.target.value);
                  setFscOverride(null);
                }}
              />
              <datalist id="destination-list">
                {destinationSuggestions.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </label>

            <fieldset className="field">
              <legend>Service</legend>
              <div className="segmented-control">
                {(["ltl", "straight", "ftl"] as ServiceChoice[]).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className={service === choice ? "active" : ""}
                    aria-pressed={service === choice}
                    onClick={() => {
                      setService(choice);
                      setFscOverride(null);
                    }}
                  >
                    {serviceLabel(choice)}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="field">
              <legend>Accessorials</legend>
              <div className="check-grid">
                <label>
                  <input
                    type="checkbox"
                    checked={tailgate}
                    onChange={(event) => setTailgate(event.target.checked)}
                  />
                  <span>Tailgate</span>
                  <small>+$45</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={inside}
                    onChange={(event) => setInside(event.target.checked)}
                  />
                  <span>Inside</span>
                  <small>+$45</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={appointment}
                    onChange={(event) => setAppointment(event.target.checked)}
                  />
                  <span>Appointment</span>
                  <small>+$25</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={returns}
                    onChange={(event) => setReturns(event.target.checked)}
                  />
                  <span>Pallet return</span>
                  <small>+$45</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={dunnage}
                    onChange={(event) => setDunnage(event.target.checked)}
                  />
                  <span>Dunnage removal</span>
                  <small>+$45</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={driverAssist}
                    onChange={(event) => setDriverAssist(event.target.checked)}
                  />
                  <span>Driver assist</span>
                  <small>+$80</small>
                </label>
              </div>
            </fieldset>

            <div className="form-grid">
              <label className="field">
                <span>Additional helpers</span>
                <div className="stepper">
                  <button
                    type="button"
                    onClick={() => setHelpers((value) => Math.max(0, value - 1))}
                    aria-label="Remove one helper"
                    title="Remove one helper"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={helpers}
                    onChange={(event) =>
                      setHelpers(
                        Math.max(0, Math.min(6, Number(event.target.value) || 0)),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setHelpers((value) => Math.min(6, value + 1))}
                    aria-label="Add one helper"
                    title="Add one helper"
                  >
                    +
                  </button>
                </div>
                <small>$150 per person</small>
              </label>

              <label className="field">
                <span>FSC override</span>
                <input
                  className="compact-number"
                  type="number"
                  min={0}
                  max={120}
                  step={0.1}
                  value={Number(fsc.toFixed(1))}
                  onChange={(event) =>
                    setFscOverride(
                      Math.max(0, Math.min(120, Number(event.target.value) || 0)),
                    )
                  }
                />
                <small>
                  {mode === "ftl" && fuelService === "ltl"
                    ? "FTL tariff · LTL fuel exception"
                    : `APPS ${fuelService.toUpperCase()} fuel`}
                </small>
              </label>
            </div>

            <fieldset className="field market-field">
              <legend>Market adjustment</legend>
              <div className="segmented-control market-options">
                {[10, 20, 30].map((adjustment) => (
                  <button
                    key={adjustment}
                    type="button"
                    className={market === adjustment ? "active" : ""}
                    aria-pressed={market === adjustment}
                    onClick={() => setMarket(adjustment)}
                  >
                    {adjustment}%
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              className="primary-button"
              type="button"
              onClick={showResults}
              disabled={!destination || !originReady || !loadReady}
            >
              Calculate rate
            </button>
          </div>
        </aside>

        <section className="result-workspace" ref={resultRef} aria-live="polite">
          <div className="result-heading">
            <div>
              <span className="eyebrow">Selected lane</span>
              <h2>
                {originLabel} <span>to</span>{" "}
                {destination || "enter a destination"}
              </h2>
              <p>
                {activeProfile.label} · {pallets} skid
                {pallets === 1 ? "" : "s"} · {serviceLabel(mode)}
              </p>
            </div>
            <span
              className={`status-badge ${quote.rate ? "active" : "attention"}`}
            >
              {quote.rate
                ? "Active tariff"
                : !loadReady
                  ? "Set pallet count"
                  : destination && originReady
                    ? quote.historyMedian === null
                      ? "Manual quote"
                      : "Historical lane"
                    : "Waiting for lane"}
            </span>
          </div>

          <div className="route-summary" aria-label="Quote summary">
            <div>
              <span>Origin</span>
              <strong>{originLabel}</strong>
            </div>
            <div>
              <span>Destination</span>
              <strong>{destination || "Not selected"}</strong>
            </div>
            <div>
              <span>Load</span>
              <strong>
                {pallets} pallet{pallets === 1 ? "" : "s"}
              </strong>
            </div>
            <div>
              <span>Service</span>
              <strong>{serviceLabel(mode)}</strong>
            </div>
          </div>

          <div className="metric-row">
            <article className="metric-card primary-metric">
              <span>Rate card total</span>
              <strong>
                {quote.tariffTotal === null
                  ? !loadReady
                    ? "—"
                    : destination
                      ? "No tariff"
                      : "—"
                  : currency.format(round5(quote.tariffTotal))}
              </strong>
              <small>
                {quote.rate?.fuelMode === "included"
                  ? "Contract fuel treatment included"
                  : quote.rate
                    ? `${fsc.toFixed(1)}% APPS ${fuelService.toUpperCase()} fuel included`
                    : !loadReady
                      ? "No load entered"
                      : "Waiting for an exact pallet tariff"}
              </small>
            </article>

            <article className="metric-card">
              <span>Previous exact lane</span>
              <strong>
                {quote.historyMedian === null
                  ? "No exact quote"
                  : currency.format(round5(quote.historyMedian))}
              </strong>
              <small>
                {matches.length
                  ? `${matches.length} previous match${matches.length === 1 ? "" : "es"}`
                  : "No exact origin-to-destination match"}
              </small>
            </article>

            <article className="metric-card suggested-metric">
              <span>Suggested quote today</span>
              <strong>
                {quote.suggested === null
                  ? "—"
                  : currency.format(quote.suggested)}
              </strong>
              <small>{market >= 0 ? `+${market}%` : `${market}%`} market adjustment</small>
            </article>
          </div>

          <div className="result-details">
            <section className="rate-basis">
              <div className="section-title">
                <h3>Rate basis</h3>
                {quote.rate && (
                  <span>
                    Effective {quote.rate.card.effective}
                  </span>
                )}
              </div>
              <p className="basis-copy">
                {quote.rate
                  ? `${quote.rate.note}. Source: ${quote.rate.card.sourceLabel}.`
                  : !loadReady
                    ? "No load entered. Rates begin at one pallet."
                    : destination && originReady
                      ? quote.historyMedian === null
                        ? "No exact customer pallet tariff or sent-email lane was found. Obtain a live rate before quoting."
                        : "No formal tariff was found. The suggested quote is anchored to exact sent-email lane history, plus the selected adjustment and charges."
                      : "Choose a pickup origin and destination to locate the applicable pallet tariff."}
              </p>

              <dl className="breakdown">
                <div>
                  <dt>Base tariff</dt>
                  <dd>
                    {quote.rate ? currency.format(quote.rate.base) : "—"}
                  </dd>
                </div>
                <div>
                  <dt>
                    Fuel
                    {quote.rate?.fuelMode === "included"
                      ? " · included"
                      : ` · APPS ${fuelService.toUpperCase()} ${fsc.toFixed(1)}%`}
                  </dt>
                  <dd>{currency.format(quote.fuelCharge)}</dd>
                </div>
                <div>
                  <dt>Accessorials</dt>
                  <dd>{currency.format(quote.accessorials)}</dd>
                </div>
                <div>
                  <dt>Helpers · {helpers} × $150</dt>
                  <dd>{currency.format(quote.helperCharge)}</dd>
                </div>
                <div>
                  <dt>Market adjustment</dt>
                  <dd>
                    {quote.tariffTotal === null || quote.suggested === null
                      ? "—"
                      : currency.format(
                          quote.suggested - round5(quote.tariffTotal),
                        )}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="quote-range">
              <span className="eyebrow">Working range</span>
              <strong>
                {quote.low === null || quote.high === null
                  ? "—"
                  : `${currency.format(quote.low)} – ${currency.format(quote.high)}`}
              </strong>
              <p>Range around today&apos;s suggested quote.</p>
            </section>
          </div>

          <section className="customer-quote">
            <div>
              <span className="eyebrow">Customer-ready line</span>
              <p>{quoteLine}</p>
            </div>
            <button type="button" onClick={() => void copyQuote()}>
              {copied ? "Copied" : "Copy quote"}
            </button>
          </section>

          <details className="evidence">
            <summary>
              <span>Rate evidence and data notes</span>
              <small>History is hidden by default</small>
            </summary>
            <div className="evidence-body">
              <p>
                Exact sent-email history is used only for the previous-lane
                median. Nearby cities and different origins are excluded.
              </p>
              <div className="evidence-stats">
                <span>
                  <strong>2,428</strong>
                  sent candidates reviewed
                </span>
                <span>
                  <strong>{allHistory.length}</strong>
                  normalized lane rows
                </span>
                <span>
                  <strong>38 + 8</strong>
                  rate cards and PDFs reviewed
                </span>
              </div>
              <a href={APPS_FSC_URL} target="_blank" rel="noreferrer">
                Verify the APPS fuel schedule
              </a>
            </div>
          </details>

          <footer className="product-footer">
            <div>
              <strong>Rate Calculator</strong>
              <span>Professional pallet freight pricing</span>
            </div>
          </footer>
        </section>
      </main>

      <div className="mobile-action" aria-label="Mobile quote action">
        <div>
          <span>Suggested</span>
          <strong>
            {quote.suggested === null ? "—" : currency.format(quote.suggested)}
          </strong>
        </div>
        <button
          type="button"
          onClick={showResults}
          disabled={!destination || !originReady || !loadReady}
        >
          View quote
        </button>
      </div>
    </div>
  );
}
