"use client";

import { useEffect, useRef, useState } from "react";
import customHistory from "./custom-history.json";
import historyData from "./history-data.json";
import {
  estimatePalletSpots,
  formatEstimateNumber,
} from "./pallet-spots";
import { parseRatePrefill } from "./rate-prefill";
import {
  cityKey,
  clean,
  isMontrealLocalPostalCode,
  isQuebecCityPostalCode,
  isSpotGtaPickup,
  postalCodeFsa,
  zoneFor,
} from "./rate-matching";
import {
  cityAliases,
  cclsGtaDestinations,
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
  postalCodeSuggestions,
  rateCards,
  spotOntarioZones,
  straightTruckMax5Ton,
  uniqloCalgaryRates,
  uniqloStoreDeliveryRates,
  uniqloStoreDeliveryZones,
  wheels18OntarioZones,
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

type WorkspaceMode = "quote" | "bulk" | "spots" | "history";

const workspaceModes: Array<{ id: WorkspaceMode; label: string }> = [
  { id: "quote", label: "Quote" },
  { id: "bulk", label: "Bulk" },
  { id: "spots", label: "Pallet spots" },
  { id: "history", label: "History" },
];

type ConfidenceLevel = "high" | "medium" | "review" | "manual" | "waiting";

type QuoteConfidence = {
  level: ConfidenceLevel;
  label: string;
  detail: string;
};

type HistoryMatch = {
  record: HistoryRecord;
  score: number;
};

type CitySuggestion = {
  value: string;
  label: string;
};

type SelectedAccessorials = Record<AccessorialKey, boolean>;

type CalculatedQuote = {
  rate: RateResolution | null;
  matches: HistoryMatch[];
  historyMedian: number | null;
  accessorials: number;
  helperCharge: number;
  fuelCharge: number;
  tariffTotal: number | null;
  suggested: number | null;
  low: number | null;
  high: number | null;
  confidence: QuoteConfidence;
};

type BulkQuoteInput = {
  line: number;
  load: string;
  store: string;
  destination: string;
  pallets: number;
  raw: string;
};

type BulkQuoteResult = BulkQuoteInput & {
  quote: CalculatedQuote;
  normalizedDestination: string;
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

const uniqloAccessorials: Record<AccessorialKey, number> = {
  ...defaultAccessorials,
  appointment: 0,
};

function rateIndex(pallets: number, max: number) {
  const count = Math.max(1, Math.ceil(pallets || 1));
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
  const rawDestination = clean(destinationInput);
  const destination = cityKey(destinationInput);
  const postalMontrealLocal = isMontrealLocalPostalCode(destinationInput);
  const postalQuebecCity = isQuebecCityPostalCode(destinationInput);
  const card = rateCards[customer];
  const palletTable = palletLaneCards[customer];

  if (
    customer === "wheels18" &&
    (warehouse !== "mississauga" || service !== "ltl" || pallets > 11)
  ) {
    return null;
  }

  if (customer === "uniqlo" && warehouse === "mississauga") {
    const calgaryDestination =
      rawDestination.includes("calgary") &&
      !rawDestination.includes("edmonton");

    if (service === "ltl" && calgaryDestination) {
      if (pallets > uniqloCalgaryRates.length) return null;
      return {
        base: uniqloCalgaryRates[rateIndex(pallets, uniqloCalgaryRates.length)],
        note: "Uniqlo Toronto DC to Calgary pallet rate",
        card,
        fuelMode: "add",
        accessorialRates: uniqloAccessorials,
      };
    }

    const zone = zoneFor(destination, uniqloStoreDeliveryZones);
    if (service === "ltl" && zone && pallets <= 34) {
      const values = uniqloStoreDeliveryRates[zone];
      const palletCount = Math.max(1, Math.ceil(pallets));
      const base =
        zone <= 3 && palletCount > values.length
          ? Math.floor((palletCount - 1) / values.length) *
              values[values.length - 1] +
            values[(palletCount - 1) % values.length]
          : values[palletCount - 1];
      return {
        base,
        note: `Uniqlo one-store delivery Zone ${zone} from Toronto DC`,
        card,
        fuelMode: "add",
        accessorialRates: uniqloAccessorials,
      };
    }

    if (service === "ftl" && calgaryDestination) {
      return {
        base: 5010,
        note: "Uniqlo Toronto DC to Calgary FTL rate",
        card,
        fuelMode: "add",
        accessorialRates: uniqloAccessorials,
      };
    }

    if (
      service === "ftl" &&
      zone &&
      zone >= 4 &&
      pallets > 0 &&
      pallets <= 34
    ) {
      const finalDelivery =
        uniqloStoreDeliveryRates[zone][Math.ceil(pallets) - 1];
      return {
        base: 850 + finalDelivery,
        note: `Uniqlo FTL linehaul plus Zone ${zone} final delivery`,
        card,
        fuelMode: "add",
        accessorialRates: uniqloAccessorials,
      };
    }

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
    if (customer === "wheels18" && pallets > 7) return null;

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
      const supplyLane = cclsGtaDestinations.includes(destination)
        ? "gta"
        : destination === "montreal local" || montrealLocal.includes(destination)
          ? "montreal"
          : null;
      if (supplyLane) {
        const values = palletLaneCards.ccls?.[supplyLane];
        if (!values) return null;
        return {
          base: values[rateIndex(pallets, values.length)],
          note: `CCLS / Uniqlo supplies ${supplyLane === "gta" ? "GTA local" : "Montreal"} pallet table`,
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
          : customer === "wheels18"
            ? zoneFor(destination, wheels18OntarioZones)
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
        note:
          customer === "wheels18"
            ? `${card.label} GTA 5 Ton LTL Zone ${zone}`
            : `${card.label} Ontario LTL Zone ${zone}`,
        card,
        fuelMode: customer === "wheels18" ? "add" : card.fuelMode,
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
      (destination === "montreal local" || postalMontrealLocal)
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
      (destination === "montreal exterior" || postalQuebecCity)
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
    (destination === "montreal local" || postalMontrealLocal)
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
    (destination === "montreal exterior" || postalQuebecCity)
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
    (postalMontrealLocal ||
      montrealLocal.some((city) => clean(city) === clean(destination)))
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
    (postalQuebecCity ||
      montrealExterior.some((city) => clean(city) === clean(destination)))
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
    (postalMontrealLocal ||
      montrealLocal.some((city) => clean(city) === clean(destination)))
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
    (postalQuebecCity ||
      montrealExterior.some((city) => clean(city) === clean(destination)))
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

function cityDisplayName(value: unknown) {
  const key = cityKey(value);
  const special: Record<string, string> = {
    "nova scotia": "Nova Scotia",
    "calgary edmonton": "Calgary-Edmonton",
    "quebec city": "Quebec City",
    "saint-laurent": "Saint-Laurent",
    "saint-bruno": "Saint-Bruno",
    "trois-rivieres": "Trois-Rivieres",
    "riviere-du-loup": "Riviere-du-Loup",
    "niagara-on-the-lake": "Niagara-on-the-Lake",
    "montreal local": "Montreal Local",
    "montreal exterior": "Montreal Exterior",
  };
  if (special[key]) return special[key];
  return key
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const citySearchTerms = Array.from(
  new Set([
    ...destinationSuggestions,
    ...Object.keys(cityAliases),
    ...Object.values(cityAliases),
    ...Object.values(spotOntarioZones).flat(),
    ...Object.values(ontarioZones).flat(),
    ...Object.values(ftlZones).flat(),
    ...montrealLocal,
    ...montrealExterior,
    ...Object.values(palletLaneCards).flatMap((card) => Object.keys(card)),
  ]),
)
  .map((term) => ({
    search: clean(term),
    key: cityKey(term),
  }))
  .filter((term) => term.search.length >= 3)
  .sort((a, b) => b.search.length - a.search.length);

const citySuggestionCandidates = Array.from(
  new Map(
    citySearchTerms.map((term) => [
      term.key,
      {
        search: clean(term.key),
        value: cityDisplayName(term.key),
      },
    ]),
  ).values(),
).filter((term) => term.search.length >= 4);

function cityFromText(value: string) {
  const raw = clean(value);
  if (!raw) return "";
  const exact = cityKey(value);
  if (exact && exact !== raw) return exact;
  const match = citySearchTerms.find(
    (term) => raw === term.search || raw.includes(term.search),
  );
  return match?.key ?? exact;
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
    }
    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function cityCleanupSuggestion(value: string): CitySuggestion | null {
  const raw = clean(value);
  if (raw.length < 4) return null;
  const resolved = cityKey(value);
  if (resolved !== raw) return null;
  if (citySuggestionCandidates.some((candidate) => candidate.search === raw)) {
    return null;
  }

  const ranked = citySuggestionCandidates
    .map((candidate) => ({
      ...candidate,
      distance: editDistance(raw, candidate.search),
    }))
    .sort((a, b) => a.distance - b.distance || a.search.length - b.search.length);
  const best = ranked[0];
  if (!best) return null;

  const maxDistance = raw.length <= 6 ? 1 : 2;
  if (best.distance > maxDistance) return null;

  return {
    value: best.value,
    label: best.value,
  };
}

function effectiveWarehouseFor(
  originMode: OriginMode,
  warehouse: WarehouseId,
  pickupCity: string,
  customer: CustomerId,
) {
  const pickupKey = cityKey(pickupCity);
  if (originMode === "warehouse") return warehouse;
  if (
    pickupKey === "mississauga" ||
    (customer === "spot" && isSpotGtaPickup(pickupCity))
  ) {
    return "mississauga";
  }
  if (
    isMontrealLocalPostalCode(pickupCity) ||
    ["montreal", "dorval", "lachine", "saint-laurent"].includes(pickupKey)
  ) {
    return "montreal";
  }
  return null;
}

function findHistoryMatches(
  originMode: OriginMode,
  warehouse: WarehouseId,
  pickupCity: string,
  customer: CustomerId,
  activeProfileLabel: string,
  destination: string,
  pallets: number,
  mode: ServiceMode,
): HistoryMatch[] {
  if (!destination) return [];
  const destinationKey = cityKey(destination);
  const pickupKey = cityKey(pickupCity);
  const selectedCustomer = clean(activeProfileLabel);
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
      const skidDistance = record.skids ? Math.abs(record.skids - pallets) : 20;
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
      (a, b) => a.score - b.score || b.record.date.localeCompare(a.record.date),
    )
    .slice(0, 8);
}

function confidenceFor(
  rate: RateResolution | null,
  matches: HistoryMatch[],
  historyMedian: number | null,
  destination: string,
  originReady: boolean,
  loadReady: boolean,
): QuoteConfidence {
  if (!destination || !originReady || !loadReady) {
    return {
      level: "waiting",
      label: "Waiting",
      detail: "Lane or load is incomplete",
    };
  }
  if (rate) {
    return {
      level: "high",
      label: "Tariff match",
      detail:
        historyMedian === null
          ? "Rate card match"
          : "Rate card match with exact lane history",
    };
  }
  if (historyMedian !== null && matches.length >= 3) {
    return {
      level: "medium",
      label: "History match",
      detail: "Multiple exact sent-email lane matches",
    };
  }
  if (historyMedian !== null) {
    return {
      level: "review",
      label: "Review lane",
      detail: "Exact history only, no formal tariff",
    };
  }
  return {
    level: "manual",
    label: "Manual quote",
    detail: "No tariff or exact lane history",
  };
}

function calculateQuote(input: {
  originMode: OriginMode;
  warehouse: WarehouseId;
  pickupCity: string;
  customer: CustomerId;
  activeProfileLabel: string;
  destination: string;
  pallets: number;
  mode: ServiceMode;
  selectedAccessorials: SelectedAccessorials;
  helpers: number;
  market: number;
  fsc: number;
}): CalculatedQuote {
  const originReady =
    input.originMode === "warehouse" || Boolean(input.pickupCity.trim());
  const loadReady = input.pallets > 0 || input.mode !== "ltl";
  const effectiveWarehouse = effectiveWarehouseFor(
    input.originMode,
    input.warehouse,
    input.pickupCity,
    input.customer,
  );
  const matches =
    input.destination && originReady && loadReady
      ? findHistoryMatches(
          input.originMode,
          input.warehouse,
          input.pickupCity,
          input.customer,
          input.activeProfileLabel,
          input.destination,
          input.pallets,
          input.mode,
        )
      : [];
  const rate =
    input.destination && originReady && loadReady
      ? effectiveWarehouse
        ? resolveCustomerRate(
            effectiveWarehouse,
            input.customer,
            input.destination,
            input.pallets,
            input.mode,
          )
        : resolveCustomPickupRate(
            input.customer,
            input.pickupCity,
            input.destination,
            input.pallets,
            input.mode,
          )
      : null;
  const historyMedian = median(
    matches.slice(0, 5).map((match) => match.record.price),
  );
  const included = new Set(rate?.includedAccessorialIds ?? []);
  const accessorialRates = rate?.accessorialRates ?? defaultAccessorials;
  const accessorials = (
    Object.entries(input.selectedAccessorials) as Array<[AccessorialKey, boolean]>
  ).reduce(
    (sum, [key, selected]) =>
      sum + (selected && !included.has(key) ? accessorialRates[key] : 0),
    0,
  );
  const helperCharge = input.helpers * 150;
  const confidence = confidenceFor(
    rate,
    matches,
    historyMedian,
    input.destination,
    originReady,
    loadReady,
  );

  if (!input.destination || !originReady || !loadReady) {
    return {
      rate: null,
      matches,
      historyMedian,
      accessorials: 0,
      helperCharge: 0,
      fuelCharge: 0,
      tariffTotal: null,
      suggested: null,
      low: null,
      high: null,
      confidence,
    };
  }

  if (!rate) {
    const historicalTotal =
      historyMedian === null ? null : historyMedian + accessorials + helperCharge;
    const suggested =
      historicalTotal === null
        ? null
        : round5(historicalTotal * (1 + input.market / 100));
    return {
      rate: null,
      matches,
      historyMedian,
      accessorials,
      helperCharge,
      fuelCharge: 0,
      tariffTotal: null,
      suggested,
      low: suggested === null ? null : round5(suggested * 0.97),
      high: suggested === null ? null : round5(suggested * 1.08),
      confidence,
    };
  }

  const fuelCharge = rate.fuelMode === "included" ? 0 : rate.base * (input.fsc / 100);
  const tariffTotal = rate.base + fuelCharge + accessorials + helperCharge;
  const suggested = round5(tariffTotal * (1 + input.market / 100));
  return {
    rate,
    matches,
    historyMedian,
    accessorials,
    helperCharge,
    fuelCharge,
    tariffTotal,
    suggested,
    low: round5(suggested * 0.97),
    high: round5(suggested * 1.08),
    confidence,
  };
}

function splitBulkLine(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (trimmed.includes("|")) return trimmed.split("|").map((cell) => cell.trim());
  if (trimmed.includes("\t")) return trimmed.split("\t").map((cell) => cell.trim());
  return trimmed.split(/\s{2,}/).map((cell) => cell.trim());
}

function looksLikeHeader(cells: string[]) {
  const joined = clean(cells.join(" "));
  return (
    joined.includes("destination") ||
    joined.includes("load size") ||
    joined.includes("pallet") ||
    joined.includes("skid")
  ) && (joined.includes("load") || joined.includes("store"));
}

function headerIndex(cells: string[], patterns: RegExp[]) {
  return cells.findIndex((cell) =>
    patterns.some((pattern) => pattern.test(clean(cell))),
  );
}

function globalPalletOverride(input: string) {
  const match = input.match(
    /\b(?:each|all|every)\b.{0,40}?(\d+(?:\.\d+)?)\s*(?:pallets?|skids?|spots?)\b/i,
  );
  return match ? Number(match[1]) : null;
}

function clampBulkPallets(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.5, Math.min(60, Math.round(value * 2) / 2));
}

function parsePalletCount(text: string, fallback: number, forced: number | null) {
  if (forced !== null) return clampBulkPallets(forced);
  const estimate = estimatePalletSpots(text);
  if (estimate) return clampBulkPallets(estimate.palletSpots);
  return clampBulkPallets(fallback || 1);
}

function parseDelimitedBulkRows(input: string, fallbackPallets: number) {
  const forced = globalPalletOverride(input);
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\|?\s*-{2,}/.test(line));
  let header: string[] | null = null;
  const rows: BulkQuoteInput[] = [];

  lines.forEach((line, index) => {
    const cells = splitBulkLine(line);
    if (cells.length < 2) return;
    if (looksLikeHeader(cells)) {
      header = cells;
      return;
    }
    if (!header) return;

    const loadIndex = headerIndex(header, [/^load\b/, /^order\b/, /^po\b/]);
    const storeIndex = headerIndex(header, [/^store\b/, /customer/, /consignee/]);
    const destinationIndex = headerIndex(header, [/destination/, /^dest\b/, /delivery/]);
    const palletIndex = headerIndex(header, [/pallet/, /skid/, /spot/, /^space$/]);
    const load = loadIndex >= 0 ? cells[loadIndex] ?? "" : "";
    const store = storeIndex >= 0 ? cells[storeIndex] ?? "" : "";
    const destinationText =
      destinationIndex >= 0 ? cells[destinationIndex] ?? "" : cells.join(" ");
    const destination = cityFromText(destinationText || cells.join(" "));
    if (!destination) return;
    const palletText =
      palletIndex >= 0 ? cells[palletIndex] ?? cells.join(" ") : cells.join(" ");
    rows.push({
      line: index + 1,
      load,
      store,
      destination,
      pallets: parsePalletCount(palletText, fallbackPallets, forced),
      raw: line,
    });
  });

  return rows;
}

function parseVerticalBulkRows(input: string, fallbackPallets: number) {
  const forced = globalPalletOverride(input);
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^\|?\s*-{2,}/.test(line) &&
        !/^(load|store|destination|load size|rate)$/i.test(line),
    );
  const rows: BulkQuoteInput[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const loadMatch = lines[index].match(/\b\d{6,}\b/);
    if (!loadMatch) continue;
    const store = lines[index + 1] ?? "";
    const destinationText = lines[index + 2] ?? "";
    const loadSize = lines[index + 3] ?? "";
    const destination = cityFromText(destinationText || store);
    if (!destination) continue;
    rows.push({
      line: index + 1,
      load: loadMatch[0],
      store,
      destination,
      pallets: parsePalletCount(loadSize, fallbackPallets, forced),
      raw: [lines[index], store, destinationText, loadSize].join(" "),
    });
    index += 3;
  }

  return rows;
}

function parseLineBulkRows(input: string, fallbackPallets: number) {
  const forced = globalPalletOverride(input);
  return input
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.length >= 5)
    .map(({ line, index }) => {
      const destination = cityFromText(line);
      if (!destination) return null;
      const load = line.match(/\b\d{6,}\b/)?.[0] ?? "";
      return {
        line: index + 1,
        load,
        store: "",
        destination,
        pallets: parsePalletCount(line, fallbackPallets, forced),
        raw: line,
      };
    })
    .filter((row): row is BulkQuoteInput => row !== null);
}

function parseBulkQuoteRows(input: string, fallbackPallets: number) {
  if (!input.trim()) return [];
  const delimited = parseDelimitedBulkRows(input, fallbackPallets);
  const vertical = delimited.length
    ? []
    : parseVerticalBulkRows(input, fallbackPallets);
  const rows =
    delimited.length > 0
      ? delimited
      : vertical.length > 0
        ? vertical
        : parseLineBulkRows(input, fallbackPallets);
  return rows.slice(0, 80);
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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("quote");
  const [spotCalculatorInput, setSpotCalculatorInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [bulkCopied, setBulkCopied] = useState(false);
  const [fuel, setFuel] = useState<FuelSchedule>({
    ltl: 35.4,
    tl: 83.2,
    effective: "July 27, 2026",
    status: "checking",
  });
  const resultRef = useRef<HTMLElement>(null);
  const bulkPanelRef = useRef<HTMLElement>(null);
  const spotPanelRef = useRef<HTMLElement>(null);
  const historyPanelRef = useRef<HTMLElement>(null);

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
  const selectedAccessorials: SelectedAccessorials = {
    tailgate,
    inside,
    appointment,
    returns,
    dunnage,
    driverAssist,
  };
  const bulkOpen = workspaceMode === "bulk";
  const spotMode = workspaceMode === "spots";
  const historyMode = workspaceMode === "history";
  const spotEstimate = estimatePalletSpots(spotCalculatorInput, {
    bareNumberAsLinearFeet: true,
  });

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

  const quote = calculateQuote({
    originMode,
    warehouse,
    pickupCity,
    customer,
    activeProfileLabel: activeProfile.label,
    destination,
    pallets,
    mode,
    selectedAccessorials,
    helpers,
    market,
    fsc,
  });
  const matches = quote.matches;
  const bulkRows: BulkQuoteResult[] = parseBulkQuoteRows(
    bulkInput,
    pallets || 1,
  ).map((row) => {
    const rowFuelService = fuelServiceMode(row.destination, mode);
    const rowFsc =
      fscOverride ??
      card.preferredFsc ??
      (rowFuelService === "ftl" ? fuel.tl : fuel.ltl);
    return {
      ...row,
      normalizedDestination: cityDisplayName(row.destination),
      quote: calculateQuote({
        originMode,
        warehouse,
        pickupCity,
        customer,
        activeProfileLabel: activeProfile.label,
        destination: row.destination,
        pallets: row.pallets,
        mode,
        selectedAccessorials,
        helpers,
        market,
        fsc: rowFsc,
      }),
    };
  });
  const pricedBulkRows = bulkRows.filter((row) => row.quote.suggested !== null);
  const manualBulkRows = bulkRows.length - pricedBulkRows.length;
  const recentQuotes = [...allHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const warehouseLabel =
    warehouse === "mississauga"
      ? "Mississauga warehouse"
      : "Montreal warehouse";
  const originLabel =
    originMode === "warehouse"
      ? warehouseLabel
      : pickupCity.trim()
        ? cityDisplayName(pickupCity)
        : "enter a pickup";
  const destinationLabel = destination
    ? cityDisplayName(destination)
    : "enter a destination";
  const workspaceTitle =
    workspaceMode === "bulk"
      ? "Build bulk quotes"
      : workspaceMode === "spots"
        ? "Measure pallet spots"
        : workspaceMode === "history"
          ? "Review recent lanes"
          : "Build a pallet rate";
  const workspaceEyebrow =
    workspaceMode === "bulk"
      ? "Bulk mode"
      : workspaceMode === "spots"
        ? "Load sizing"
        : workspaceMode === "history"
          ? "History"
          : "New quote";
  const destinationCleanup = cityCleanupSuggestion(destination);
  const destinationPostalFsa = postalCodeFsa(destination);
  const pickupCleanup =
    originMode === "custom" ? cityCleanupSuggestion(pickupCity) : null;
  const pickupPostalFsa =
    originMode === "custom" ? postalCodeFsa(pickupCity) : null;
  const rateSourceLabel = quote.rate
    ? quote.rate.card.label
    : quote.historyMedian !== null
      ? "Exact history only"
      : "Live rate needed";
  const quoteFuelLabel = quote.rate?.fuelMode === "included"
    ? "Fuel included"
    : `APPS ${fuelService.toUpperCase()} ${fsc.toFixed(1)}%`;
  const quoteExtras = quote.accessorials + quote.helperCharge;
  const quoteExtrasLabel =
    quoteExtras > 0 ? currency.format(quoteExtras) : "No extras";
  const quoteHistoryLabel = matches.length
    ? `${matches.length} exact match${matches.length === 1 ? "" : "es"}`
    : "No exact history";
  const selectedExtraCount =
    Object.values(selectedAccessorials).filter(Boolean).length +
    (helpers > 0 ? 1 : 0);
  const advancedSummary = selectedExtraCount
    ? `${selectedExtraCount} extra${selectedExtraCount === 1 ? "" : "s"} selected · ${market}% adjustment`
    : `No extras · ${market}% adjustment`;
  const accessorialDisplayRates =
    quote.rate?.accessorialRates ?? defaultAccessorials;
  const destinationMatchLabel = destination.trim()
    ? destinationPostalFsa
      ? `${destinationPostalFsa} postal area · ${destinationLabel}`
      : `Matched destination · ${destinationLabel}`
    : "";
  const mobileSteps = [
    { label: "Lane", complete: originReady && Boolean(destination.trim()) },
    { label: "Load", complete: loadReady && Boolean(service) },
    { label: "Price", complete: quote.suggested !== null },
  ];
  const activeStepIndex = mobileSteps.findIndex((step) => !step.complete);
  const currentStepIndex =
    activeStepIndex === -1 ? mobileSteps.length - 1 : activeStepIndex;
  const quoteLine =
    !loadReady
      ? "Pallet count is required before preparing a customer quote."
      : quote.suggested === null
        ? `Please obtain a live rate for ${originLabel} to ${destinationLabel}.`
        : `It would cost ${currency.format(quote.suggested)} all in.`;

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
    setWorkspaceMode("quote");
    setSpotCalculatorInput("");
    setBulkInput("");
  };

  const showResults = () => {
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateSpotCalculator = (value: string) => {
    setSpotCalculatorInput(value);
    const estimate = estimatePalletSpots(value, {
      bareNumberAsLinearFeet: true,
    });
    if (estimate) setPallets(estimate.palletSpots);
  };

  const switchWorkspaceMode = (nextMode: WorkspaceMode) => {
    setWorkspaceMode(nextMode);
    if (nextMode === "bulk") {
      window.setTimeout(
        () =>
          bulkPanelRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        0,
      );
    }
    if (nextMode === "spots") {
      window.setTimeout(
        () =>
          spotPanelRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        0,
      );
    }
    if (nextMode === "history") {
      window.setTimeout(
        () =>
          historyPanelRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        0,
      );
    }
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

  const copyBulkQuotes = async () => {
    const lines = bulkRows.map((row) => {
      const load = row.load ? `${row.load} - ` : "";
      const store = row.store ? `${row.store} - ` : "";
      const price =
        row.quote.suggested === null
          ? "Manual quote"
          : currency.format(row.quote.suggested);
      return `${load}${store}${row.normalizedDestination} - ${row.pallets} skid${row.pallets === 1 ? "" : "s"} - ${price} - ${row.quote.confidence.label}`;
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setBulkCopied(true);
      window.setTimeout(() => setBulkCopied(false), 1400);
    } catch {
      setBulkCopied(false);
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
        <div className="top-actions">
          <div className="mode-tabs" aria-label="Calculator mode">
            {workspaceModes.map(({ id, label }) => (
              <button
                key={id}
                className={workspaceMode === id ? "active" : ""}
                type="button"
                onClick={() => switchWorkspaceMode(id)}
                aria-pressed={workspaceMode === id}
              >
                {label}
              </button>
            ))}
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
        </div>
      </header>

      <main className="dashboard">
        <aside className="quote-tool" aria-label="Quote inputs">
          <div className="tool-heading">
            <div>
              <span className="eyebrow">{workspaceEyebrow}</span>
              <h1>{workspaceTitle}</h1>
            </div>
            <button className="text-button" type="button" onClick={reset}>
              Reset
            </button>
          </div>

          <div className="form-stack">
            <div className="mobile-steps" aria-label="Quote progress">
              {mobileSteps.map((step, index) => (
                <span
                  key={step.label}
                  className={
                    step.complete
                      ? "complete"
                      : index === currentStepIndex
                        ? "active"
                        : ""
                  }
                >
                  {index + 1}. {step.label}
                </span>
              ))}
            </div>

            <section className="form-section profile-section">
              <div className="form-section-label">Pricing profile</div>
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
            </section>

            <section className="form-section step-section">
              <div className="step-heading">
                <span className="step-number">1</span>
                <div>
                  <strong>Lane</strong>
                  <small>Choose the pickup and destination</small>
                </div>
              </div>
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

            <div className="form-grid single-column">
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
                    placeholder="City or postal code"
                    value={pickupCity}
                    onChange={(event) => {
                      setPickupCity(event.target.value);
                      setFscOverride(null);
                    }}
                  />
                  {pickupCleanup && (
                    <button
                      className="city-suggestion"
                      type="button"
                      onClick={() => setPickupCity(pickupCleanup.value)}
                    >
                      Use {pickupCleanup.label}
                    </button>
                  )}
                  {pickupPostalFsa && (
                    <small>
                      {pickupPostalFsa} matched to {cityDisplayName(pickupCity)}
                    </small>
                  )}
                  <datalist id="pickup-list">
                    {pickupSuggestions.map((city) => (
                      <option key={city} value={city} />
                    ))}
                    {postalCodeSuggestions.map(({ prefix, destination: city }) => (
                      <option key={`pickup-${prefix}`} value={prefix}>
                        {cityDisplayName(city)}
                      </option>
                    ))}
                  </datalist>
                </label>
              )}

            </div>

            <label className="field">
              <span>Destination</span>
              <input
                type="text"
                list="destination-list"
                placeholder="City or postal code"
                value={destination}
                onChange={(event) => {
                setDestination(event.target.value);
                  setFscOverride(null);
                }}
              />
              {destinationCleanup && (
                <button
                  className="city-suggestion"
                  type="button"
                  onClick={() => setDestination(destinationCleanup.value)}
                >
                  Use {destinationCleanup.label}
                </button>
              )}
              {destinationPostalFsa && (
                <small>
                  {destinationPostalFsa} matched to {destinationLabel}
                </small>
              )}
              <datalist id="destination-list">
                {destinationSuggestions.map((city) => (
                  <option key={city} value={city} />
                ))}
                {postalCodeSuggestions.map(({ prefix, destination: city }) => (
                  <option key={`destination-${prefix}`} value={prefix}>
                    {cityDisplayName(city)}
                  </option>
                ))}
              </datalist>
            </label>
            {destinationMatchLabel && (
              <div className="destination-match" aria-live="polite">
                <span className="match-dot" aria-hidden="true" />
                <div>
                  <strong>{destinationMatchLabel}</strong>
                  <small>
                    {quote.rate ? quote.rate.note : "Rate zone checks after the load is entered"}
                  </small>
                </div>
              </div>
            )}
            </section>

            <section className="form-section step-section">
              <div className="step-heading">
                <span className="step-number">2</span>
                <div>
                  <strong>Load</strong>
                  <small>Set pallet count and service</small>
                </div>
              </div>
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
                  max={60}
                  step={0.5}
                  value={pallets}
                  onChange={(event) =>
                    setPallets(
                      Math.max(0, Math.min(60, Number(event.target.value) || 0)),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setPallets((value) => Math.min(60, value + 1))}
                  aria-label="Add one pallet"
                  title="Add one pallet"
                >
                  +
                </button>
              </div>
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

            <details className="advanced-options">
              <summary>
                <span>
                  <strong>Advanced options</strong>
                  <small>{advancedSummary}</small>
                </span>
                <span className="disclosure-icon" aria-hidden="true" />
              </summary>
              <div className="advanced-options-body">
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
                  <small>+${accessorialDisplayRates.tailgate}</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={inside}
                    onChange={(event) => setInside(event.target.checked)}
                  />
                  <span>Inside</span>
                  <small>+${accessorialDisplayRates.inside}</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={appointment}
                    onChange={(event) => setAppointment(event.target.checked)}
                  />
                  <span>Appointment</span>
                  <small>
                    {accessorialDisplayRates.appointment === 0
                      ? "Included"
                      : `+$${accessorialDisplayRates.appointment}`}
                  </small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={returns}
                    onChange={(event) => setReturns(event.target.checked)}
                  />
                  <span>Pallet return</span>
                  <small>+${accessorialDisplayRates.returns}</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={dunnage}
                    onChange={(event) => setDunnage(event.target.checked)}
                  />
                  <span>Dunnage removal</span>
                  <small>+${accessorialDisplayRates.dunnage}</small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={driverAssist}
                    onChange={(event) => setDriverAssist(event.target.checked)}
                  />
                  <span>Driver assist</span>
                  <small>+${accessorialDisplayRates.driverAssist}</small>
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
              </div>
            </details>
            </section>

            <section className="quote-action-block">
              <div className="step-heading compact">
                <span className="step-number">3</span>
                <div>
                  <strong>Price</strong>
                  <small>Review the all-in customer quote</small>
                </div>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={showResults}
                disabled={!destination || !originReady || !loadReady}
              >
                Calculate rate
              </button>
            </section>
          </div>
        </aside>

        <section className="result-workspace" ref={resultRef} aria-live="polite">
          <div className="result-heading">
            <div>
              <span className="eyebrow">Selected lane</span>
              <h2>
                {originLabel} <span>to</span>{" "}
                {destinationLabel}
              </h2>
              <p>
                {activeProfile.label} · {pallets} skid
                {pallets === 1 ? "" : "s"} · {serviceLabel(mode)}
              </p>
            </div>
            <span
              className={`status-badge confidence-badge ${quote.confidence.level}`}
            >
              {quote.confidence.label}
            </span>
          </div>

          {bulkOpen && (
            <section
              id="bulk-quote-panel"
              className="bulk-panel top-bulk-panel bulk-drawer"
              ref={bulkPanelRef}
            >
              <div className="section-title">
                <h3>Bulk quote mode</h3>
                <span>
                  {bulkRows.length
                    ? `${pricedBulkRows.length}/${bulkRows.length} priced`
                    : "Paste lanes"}
                </span>
              </div>
              <div className="bulk-stat-row" aria-label="Bulk quote status">
                <span>
                  <strong>{bulkRows.length}</strong>
                  Rows
                </span>
                <span>
                  <strong>{pricedBulkRows.length}</strong>
                  Priced
                </span>
                <span className={manualBulkRows ? "attention" : ""}>
                  <strong>{manualBulkRows}</strong>
                  Manual
                </span>
              </div>
              <textarea
                value={bulkInput}
                onChange={(event) => {
                  setBulkInput(event.target.value);
                  setBulkCopied(false);
                }}
                rows={7}
                placeholder="Load | Store | Destination | Pallet spots"
                aria-label="Bulk quote rows"
              />
              <div className="bulk-actions">
                <button
                  type="button"
                  onClick={() => void copyBulkQuotes()}
                  disabled={!bulkRows.length}
                >
                  {bulkCopied ? "Copied" : "Copy priced rows"}
                </button>
                <span>
                  {bulkRows.length
                    ? `${bulkRows.length} lane${bulkRows.length === 1 ? "" : "s"} found`
                    : "Current quote settings apply"}
                </span>
              </div>

              {bulkRows.length > 0 && (
                <div className="bulk-table-wrap">
                  <table className="bulk-table">
                    <thead>
                      <tr>
                        <th>Load</th>
                        <th>Store</th>
                        <th>Destination</th>
                        <th>Skids</th>
                        <th>Quote</th>
                        <th>Confidence</th>
                        <th>Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((row) => (
                        <tr key={`${row.line}-${row.load}-${row.destination}`}>
                          <td>{row.load || `Line ${row.line}`}</td>
                          <td>{row.store || "-"}</td>
                          <td>
                            <strong>{row.normalizedDestination}</strong>
                          </td>
                          <td>{row.pallets}</td>
                          <td>
                            {row.quote.suggested === null
                              ? "Manual"
                              : currency.format(row.quote.suggested)}
                          </td>
                          <td>
                            <span
                              className={`confidence-badge ${row.quote.confidence.level}`}
                            >
                              {row.quote.confidence.label}
                            </span>
                            <small>{row.quote.confidence.detail}</small>
                          </td>
                          <td>
                            {row.quote.rate
                              ? row.quote.rate.note
                              : row.quote.historyMedian === null
                                ? "Live rate needed"
                                : "Exact history median"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {bulkInput.trim() && bulkRows.length === 0 && (
                <p className="bulk-empty">No priced lanes found.</p>
              )}
            </section>
          )}

          {spotMode && (
            <section
              id="pallet-spot-panel"
              className="spot-workspace-panel"
              ref={spotPanelRef}
            >
              <div className="section-title">
                <h3>Pallet spot calculator</h3>
                <span>Dimensions or linear ft</span>
              </div>
              <input
                type="text"
                placeholder="51 x 36 x 37, 51, 36, 37, 12 ft, or 12"
                value={spotCalculatorInput}
                onChange={(event) => updateSpotCalculator(event.target.value)}
                aria-label="Pallet spot dimensions or linear feet"
              />
              {spotEstimate ? (
                <>
                  <div className="spot-estimate-grid wide">
                    <span>
                      <strong>
                        {formatEstimateNumber(spotEstimate.palletSpots)}
                      </strong>
                      Pallet spots
                    </span>
                    <span>
                      <strong>
                        {formatEstimateNumber(spotEstimate.linearFeet)}
                      </strong>
                      Linear ft
                    </span>
                  </div>
                </>
              ) : (
                <p>Enter dimensions with x or commas, or type a number for linear feet.</p>
              )}
            </section>
          )}

          {historyMode && (
            <section
              id="history-panel"
              className="history-panel"
              ref={historyPanelRef}
            >
              <div className="section-title">
                <h3>Recent quoted lanes</h3>
                <span>{recentQuotes.length} latest saved rows</span>
              </div>
              <div className="history-list">
                {recentQuotes.map((record) => (
                  <article
                    key={`${record.date}-${record.customer}-${record.origin}-${record.destination}-${record.price}`}
                  >
                    <div>
                      <span>{record.date}</span>
                      <strong>
                        {cityDisplayName(record.origin)} to{" "}
                        {cityDisplayName(record.destination)}
                      </strong>
                      <small>
                        {record.customer} - {record.service}
                        {record.skids ? ` - ${record.skids} skids` : ""}
                      </small>
                    </div>
                    <strong>{currency.format(record.price)}</strong>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className={`quote-hero-card ${quote.confidence.level}`}>
            <div className="quote-hero-main">
              <span className="eyebrow">All-in customer price</span>
              <strong>
                {quote.suggested === null
                  ? "Manual quote"
                  : currency.format(quote.suggested)}
              </strong>
              <p>{quote.confidence.detail}</p>
            </div>
            <div className="quote-hero-side">
              <span className={`confidence-badge ${quote.confidence.level}`}>
                {quote.confidence.label}
              </span>
              <button
                type="button"
                onClick={() => void copyQuote()}
                disabled={quote.suggested === null}
              >
                {copied ? "Copied" : "Copy quote"}
              </button>
            </div>
            <div className="quote-copy-preview">
              <span>Customer-ready</span>
              <p>{quoteLine}</p>
            </div>
            <div className="quote-cost-meta" aria-label="Quote cost settings">
              <span>{quoteFuelLabel}</span>
              <span>{quoteExtrasLabel}</span>
              <span>{market}% market adjustment</span>
            </div>
            <dl className="quote-hero-details">
              <div>
                <dt>Rate card total</dt>
                <dd>
                  {quote.tariffTotal === null
                    ? "Not available"
                    : currency.format(round5(quote.tariffTotal))}
                </dd>
              </div>
              <div>
                <dt>Working range</dt>
                <dd>
                  {quote.low === null || quote.high === null
                    ? "Not available"
                    : `${currency.format(quote.low)} - ${currency.format(quote.high)}`}
                </dd>
              </div>
              <div>
                <dt>Rate basis</dt>
                <dd>{rateSourceLabel}</dd>
              </div>
              <div>
                <dt>History</dt>
                <dd>{quoteHistoryLabel}</dd>
              </div>
            </dl>
          </section>

          <div className="route-summary" aria-label="Quote summary">
            <div>
              <span>Origin</span>
              <strong>{originLabel}</strong>
            </div>
            <div>
              <span>Destination</span>
              <strong>{destination ? cityDisplayName(destination) : "Not selected"}</strong>
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

          <details className="pricing-details">
            <summary>
              <span>
                <strong>Price breakdown</strong>
                <small>Tariff, fuel, extras, market adjustment and range</small>
              </span>
              <span className="disclosure-icon" aria-hidden="true" />
            </summary>
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
          </details>

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
          onClick={() =>
            quote.suggested === null ? showResults() : void copyQuote()
          }
          disabled={!destination || !originReady || !loadReady}
        >
          {quote.suggested === null
            ? "View quote"
            : copied
              ? "Copied"
              : "Copy quote"}
        </button>
      </div>
    </div>
  );
}
