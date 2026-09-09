"use client";

import { useEffect, useState } from "react";
import { calculateQuote, fuelServiceMode, parseAppsFuel } from "./RateCalculator";
import { parseQuoteEmail, type OpenQuoteEmail } from "./email-quote-parser";
import { customerProfiles, rateCards, type CustomerId } from "./rate-data";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
const extrasLabels = { tailgate: "Tailgate", inside: "Inside delivery", appointment: "Appointment", returns: "Pallet return", dunnage: "Dunnage removal", driverAssist: "Driver assist" };
type Fuel = { ltl: number; tl: number; effective: string; status: "checking" | "live" | "saved" };

export function EmailQuoteAssistant() {
  const [email, setEmail] = useState<OpenQuoteEmail | null>(null);
  const [revision, setRevision] = useState(0);
  const [fuel, setFuel] = useState<Fuel>({ ltl: 35.4, tl: 83.2, effective: "July 27, 2026", status: "checking" });
  const [fuelRefresh, setFuelRefresh] = useState(0);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || !/^chrome-extension:\/\/[a-p]{32}$/.test(event.origin)) return;
      if (event.data?.type !== "3myle-open-email") return;
      const item = event.data.email;
      if (item !== null && (!item || typeof item.sender !== "string" || typeof item.subject !== "string" || typeof item.body !== "string")) return;
      setEmail(item === null ? null : { sender: item.sender.slice(0, 500), subject: item.subject.slice(0, 500), body: item.body.slice(0, 40000), quotedBody: typeof item.quotedBody === "string" ? item.quotedBody.slice(0, 40000) : "", hasAttachments: Boolean(item.hasAttachments) });
      setRevision((value) => value + 1);
    };
    window.addEventListener("message", receive);
    if (window.parent !== window) window.parent.postMessage({ type: "3myle-assistant-ready" }, "*");
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function refresh() {
      setFuel((old) => ({ ...old, status: "checking" }));
      for (const url of ["https://r.jina.ai/http://www.appsexpress.com/express/fuel_surcharge", "https://www.appsexpress.com/express/fuel_surcharge"]) {
        try {
          const response = await fetch(url, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]) });
          if (!response.ok) continue;
          const schedule = parseAppsFuel(await response.text());
          if (!cancelled) setFuel({ ...schedule, status: "live" });
          return;
        } catch { if (cancelled) return; }
      }
      if (!cancelled) setFuel((old) => ({ ...old, status: "saved" }));
    }
    void refresh();
    return () => { cancelled = true; controller.abort(); };
  }, [fuelRefresh]);

  return <main className="email-assistant">
    {email ? <QuoteDetails key={revision} email={email} fuel={fuel} refreshFuel={() => setFuelRefresh((value) => value + 1)} /> : <section className="ea-empty"><h2>No message analyzed</h2><p>Ready for the open Gmail message.</p></section>}
    <footer className="ea-footer">CAD · Rate cards + APPS fuel · Text extraction</footer>
  </main>;
}

function QuoteDetails({ email, fuel, refreshFuel }: { email: OpenQuoteEmail; fuel: Fuel; refreshFuel: () => void }) {
  const [parsed] = useState(() => parseQuoteEmail(email));
  const [customer, setCustomer] = useState<CustomerId | "">("spot");
  const [origin, setOrigin] = useState(parsed.origin);
  const [destination, setDestination] = useState(parsed.destination);
  const [spots, setSpots] = useState(parsed.spots === null ? "" : String(parsed.spots));
  const [service, setService] = useState(parsed.service);
  const [extras, setExtras] = useState(parsed.extras);
  const [helpers, setHelpers] = useState(0);
  const [market, setMarket] = useState(10);
  const [reviewKey, setReviewKey] = useState("");
  const [copyState, setCopyState] = useState("");
  const activeCustomer = customer || "spot";
  const profile = customerProfiles.find((item) => item.id === activeCustomer)!;
  const fuelMode = fuelServiceMode(destination, service);
  const fsc = rateCards[activeCustomer].preferredFsc ?? (fuelMode === "ftl" ? fuel.tl : fuel.ltl);
  const quantity = Number(spots);
  const validSpots = spots.trim() !== "" && Number.isFinite(quantity) && quantity >= 0 && quantity <= 60 && (service !== "ltl" || quantity > 0);
  const oversizedLtl = service === "ltl" && quantity > 10;
  const ready = Boolean(customer && origin.trim() && destination.trim() && validSpots && !oversizedLtl);
  const quote = calculateQuote({ originMode: "custom", warehouse: "mississauga", pickupCity: origin, customer: activeCustomer, activeProfileLabel: profile.label, destination: ready ? destination : "", pallets: validSpots ? quantity : 0, mode: service, selectedAccessorials: extras, helpers, market, fsc });
  // Historical totals can contain unitemized charges; only a matched card enables copying here.
  const price = ready && quote.rate ? quote.suggested : null;
  const key = JSON.stringify([customer, origin, destination, spots, service, extras, helpers, market, fsc, fuel.status]);
  const reviewed = reviewKey === key;
  const line = price === null ? "" : `It would cost ${money.format(price)} all in.`;

  async function copyQuote() {
    try { await navigator.clipboard.writeText(line); setCopyState("Quote copied"); }
    catch { setCopyState("Clipboard unavailable. Select the quote text to copy."); }
  }

  return <>
    <section className="ea-message"><span className="ea-eyebrow">Current message</span><h2>{email.subject}</h2><p>{email.sender || "Sender not provided"}</p>{parsed.customer && <p>Detected client: {customerProfiles.find((item) => item.id === parsed.customer)?.label}</p>}</section>
    <section className="ea-result" aria-label="Quote result"><div className="ea-result-title"><span>All-in customer price</span><span className={`ea-badge ${price === null || !reviewed ? "review" : "matched"}`}>{price === null ? "Needs details" : reviewed ? "Card matched" : "Review quote"}</span></div><strong className="ea-price">{price === null ? "No confirmed rate" : money.format(price)}</strong>
      {price !== null && <p className="ea-quote-line">{line}</p>}
      {oversizedLtl && <p className="ea-warning">Over 10 LTL spots: confirm capacity and tariff tier, or select the agreed truck service.</p>}
      {ready && !quote.rate && <p className="ea-warning">No matching rate card for this customer, pickup and destination. Obtain a manual quote.</p>}
      {quote.rate && <details className="ea-breakdown"><summary>Price breakdown</summary><dl><div><dt>Base rate</dt><dd>{money.format(quote.rate.base)}</dd></div><div><dt>{quote.rate.fuelMode === "included" ? "Fuel included" : `Fuel ${fsc.toFixed(1)}%`}</dt><dd>{money.format(quote.fuelCharge)}</dd></div><div><dt>Accessorials + helpers</dt><dd>{money.format(quote.accessorials + quote.helperCharge)}</dd></div><div><dt>Adjustment + rounding</dt><dd>{money.format((price ?? 0) - (quote.tariffTotal ?? 0))}</dd></div></dl><p>{quote.rate.note}</p><p>Source: {quote.rate.card.sourceLabel} · Effective {quote.rate.card.effective}</p></details>}
    </section>
    <section className="ea-inputs" aria-label="Shipment details" onChangeCapture={() => { setReviewKey(""); setCopyState(""); }}>
      <label>Customer agreement<select aria-label="Customer agreement" value={customer} onChange={(event) => setCustomer(event.target.value as CustomerId | "")}><option value="">Select customer</option>{customerProfiles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <div className="ea-lane"><label>Pickup city / postal code<input value={origin} onChange={(event) => setOrigin(event.target.value)} /></label><label>Destination / postal code<input value={destination} onChange={(event) => setDestination(event.target.value)} /></label></div>
      <div className="ea-columns"><label>Pallet spots<input type="number" min={service === "ltl" ? 0.5 : 0} max={60} step="0.5" value={spots} onChange={(event) => setSpots(event.target.value)} /></label><label>Service<select value={service} onChange={(event) => setService(event.target.value as typeof service)}><option value="ltl">LTL</option><option value="straight">Straight truck</option><option value="ftl">FTL</option></select></label></div>
      <p className="ea-load-note">{parsed.pallets === null ? "Skid count unconfirmed" : `${parsed.pallets} physical skid${parsed.pallets === 1 ? "" : "s"}`}{validSpots ? ` · ${quantity * 2} linear ft estimated` : ""}</p>
      {parsed.dimensions.length > 0 && <p className="ea-dimensions">{parsed.dimensions.join("; ")}</p>}
      <fieldset className="ea-extras"><legend>Delivery requirements</legend>{Object.entries(extrasLabels).map(([id, label]) => <label key={id}><input type="checkbox" checked={extras[id as keyof typeof extras]} onChange={(event) => setExtras({ ...extras, [id]: event.target.checked })} />{label}</label>)}</fieldset>
      <div className="ea-columns"><label>Helpers<input type="number" min={0} max={6} step={1} value={helpers} onChange={(event) => setHelpers(Math.max(0, Math.min(6, Math.floor(Number(event.target.value)))))} /></label><label>Market adjustment<select value={market} onChange={(event) => setMarket(Number(event.target.value))}><option value={0}>0%</option><option value={10}>10%</option><option value={20}>20%</option><option value={30}>30%</option></select></label></div>
    </section>
    <section className="ea-review"><div className="ea-fuel"><span>{quote.rate?.fuelMode === "included" ? "Fuel included in card" : `APPS ${fuelMode.toUpperCase()} ${fsc.toFixed(1)}%`}<small>{fuel.status === "live" ? "Fetched" : fuel.status === "checking" ? "Refreshing" : "Saved schedule"} · {fuel.effective}</small></span><button type="button" onClick={() => { setReviewKey(""); refreshFuel(); }} disabled={fuel.status === "checking"}>Refresh fuel</button></div>
      {parsed.warnings.length > 0 && <details open><summary>Review checks ({parsed.warnings.length})</summary><ul>{parsed.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
      {fuel.status === "saved" && quote.rate?.fuelMode === "add" && <p className="ea-warning">Fuel refresh failed. Verify the saved schedule before approving this price.</p>}
      <label className="ea-approval"><input type="checkbox" checked={reviewed} onChange={(event) => { setReviewKey(event.target.checked ? key : ""); setCopyState(""); }} />Customer, load, fuel and delivery requirements reviewed</label>
      <button className="ea-copy" disabled={price === null || !reviewed || fuel.status === "checking"} onClick={() => void copyQuote()}>Copy quote</button><p role="status" className="ea-copy-status">{copyState}</p>
    </section>
  </>;
}
