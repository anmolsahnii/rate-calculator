import { customerProfiles, destinationSuggestions, cityAliases, type CustomerId } from "./rate-data.ts";
import { cityKey, clean, postalCodeDestination } from "./rate-matching.ts";
import { estimatePalletSpots } from "./pallet-spots.ts";

export type OpenQuoteEmail = { sender: string; subject: string; body: string; hasAttachments?: boolean };
export type EmailQuoteDetails = {
  customer: CustomerId | "";
  origin: string;
  destination: string;
  pallets: number | null;
  spots: number | null;
  dimensions: string[];
  service: "ltl" | "straight" | "ftl";
  extras: Record<"tailgate" | "inside" | "appointment" | "returns" | "dunnage" | "driverAssist", boolean>;
  warnings: string[];
  isRequest: boolean;
};

const cityTerms = [...new Set([...destinationSuggestions, ...Object.keys(cityAliases)])]
  .map((name) => ({ name: clean(name), city: cityKey(name) }))
  .filter(({ name }) => name.length >= 3)
  .sort((a, b) => b.name.length - a.name.length);

function citiesIn(text: string) {
  let remaining = ` ${clean(text)} `;
  const cities: string[] = [];
  for (const term of cityTerms) {
    if (remaining.includes(` ${term.name} `)) {
      cities.push(term.city);
      remaining = remaining.split(` ${term.name} `).join(" ");
    }
  }
  const postalCity = postalCodeDestination(text);
  if (postalCity) cities.push(postalCity);
  return [...new Set(cities)];
}

// Quoted messages and signatures often contain older lanes and warehouse addresses.
export function currentMessageText(body: string) {
  return body.split(/\n\s*(?:On .+wrote:|[-_]{3,}\s*(?:Original|Forwarded) message|From:\s*.+@|(?:Best regards|Kind regards|Regards|Sincerely)[,!]?\s*$)/im)[0].trim();
}

export function parseQuoteEmail(email: OpenQuoteEmail): EmailQuoteDetails {
  const body = currentMessageText(email.body).slice(0, 40000);
  const text = `${email.subject}\n${body}`;
  const warnings: string[] = [];
  const sender = email.sender.toLowerCase();
  const senderRules: Array<[RegExp, CustomerId]> = [
    [/canadacartage\.com\b|canada cartage/, "canada"],
    [/gobolt\.com\b|\bgo\s?bolt\b/, "gobolt"],
    [/\bnippon\b|nipponexpress|nx-group/, "nippon"],
    [/\buniqlo\b/, "uniqlo"], [/\bvessi\b/, "vessi"],
    [/\bobibox\b/, "obibox"], [/\bmuji\b/, "muji"],
    [/\befl\b|eflglobal/, "efl"], [/ameri.?connect/, "ameri"],
    [/18\s?wheels/, "wheels18"],
  ];
  let customer: CustomerId | "" = senderRules.find(([pattern]) => pattern.test(sender))?.[1] ?? "";
  if (/\buniqlo\b/i.test(text) && (customer === "canada" || customer === "uniqlo")) {
    customer = /\bsupplies\b/i.test(text) ? "ccls" : "uniqlo";
    warnings.push("Confirm the Uniqlo agreement: supplies and store deliveries use different cards.");
  }
  if (!customer) warnings.push("Customer not recognized. Select the agreement or Spot.");

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const originLabel = /^(?:(?:pickup|pick up|pick-up|origin)(?:\s+(?:location|address|details))?|from)\s*[:=-]\s*(.*)$/i;
  const destinationLabel = /^(?:(?:destination|delivery|deliver to|delivery to|ship to|consignee)(?:\s+(?:location|address))?|to)\s*[:=-]\s*(.*)$/i;
  const route = text.match(/\bfrom\s+([^\n]+?)\s+(?:to|->)\s+([^\n]+)/i);
  function endpoint(label: RegExp, other: RegExp, routePart: string | undefined) {
    const found: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(label);
      if (!match) continue;
      const block = [match[1]];
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        if (other.test(lines[j]) || label.test(lines[j]) || /^(?:dims?|dimensions|total|skids|pallets|weight|pickup window|delivery window)\b/i.test(lines[j])) break;
        block.push(lines[j]);
      }
      found.push(...citiesIn(block.join(" ")));
    }
    if (!found.length && routePart) found.push(...citiesIn(routePart));
    const unique = [...new Set(found)];
    if (unique.length > 1) warnings.push("Multiple locations detected. Review each shipment separately.");
    return unique.length === 1 ? unique[0] : "";
  }
  const origin = endpoint(originLabel, destinationLabel, route?.[1]);
  const destination = endpoint(destinationLabel, originLabel, route?.[2]);
  if (!origin) warnings.push("Pickup city is missing or ambiguous.");
  if (!destination) warnings.push("Destination is missing or ambiguous.");

  const counts = [...body.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:skids?|pallets?)\b(?!\s*spots?)/gi)].map((m) => Number(m[1]));
  const totals = [...body.matchAll(/\b(?:total\s+)?(?:skids?|pallets?)\s*[:=]\s*(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1]));
  const uniqueCounts = [...new Set(totals.length ? totals : counts)];
  const quantityRange = /\b\d+\s*(?:-|to|\u2013)\s*\d+\s*(?:skids?|pallets?)\b/i.test(body);
  const pallets = !quantityRange && uniqueCounts.length === 1 && uniqueCounts[0] > 0 ? uniqueCounts[0] : null;
  if (quantityRange) warnings.push("A pallet range was requested. Enter the quantity for this quote.");
  if (uniqueCounts.length > 1) warnings.push("Multiple pallet quantities detected. Confirm the total for one shipment.");
  const dimensions = [...body.matchAll(/\b\d+(?:\.\d+)?\s*[xX,]\s*\d+(?:\.\d+)?\s*[xX,]\s*\d+(?:\.\d+)?(?:\s*(?:inches|inch|in|cm|mm|ft))?\b/g)].map((m) => m[0]);
  const explicitSpots = body.match(/\b(\d+(?:\.\d+)?)\s*pallet\s*spots?\b/i);
  const feet = body.match(/\b(\d+(?:\.\d+)?)\s*(?:linear\s*(?:feet|ft)|LF)\b/i);
  let spots: number | null = explicitSpots ? Number(explicitSpots[1]) : feet ? Math.ceil(Number(feet[1]) / 2 * 2) / 2 : pallets;
  if (!explicitSpots && !feet && dimensions.length) {
    if (dimensions.some((dim) => /\b(cm|mm|ft)\b/i.test(dim))) {
      spots = null;
      warnings.push("Non-inch dimensions require a checked pallet-spot count.");
    } else if (pallets && dimensions.length === 1) {
      spots = estimatePalletSpots(`${pallets} skids ${dimensions[0]}`)?.palletSpots ?? null;
      warnings.push("Confirm dimensions apply to every skid; pallet spots are a floor-space estimate.");
    } else if (pallets && dimensions.length === pallets) {
      spots = dimensions.reduce((sum, dim) => sum + (estimatePalletSpots(dim)?.palletSpots ?? 0), 0);
      warnings.push("Confirm one dimension row per skid; pallet spots are a floor-space estimate.");
    } else {
      spots = null;
      warnings.push("Match each dimension row to its skid quantity before quoting.");
    }
  }
  if (spots === null) warnings.push("Billable pallet spots need confirmation.");
  if (!dimensions.length && pallets && !explicitSpots && !feet) warnings.push("Dimensions missing: currently assuming one standard pallet spot per skid.");

  const extras = { tailgate: false, inside: false, appointment: false, returns: false, dunnage: false, driverAssist: false };
  const extraPatterns: Record<keyof typeof extras, RegExp> = {
    tailgate: /tail\s?gate|lift\s?gate/i,
    inside: /inside\s*(?:delivery|unload)?|unload.{0,35}(?:into|inside).{0,20}store/i,
    appointment: /appointment|\bappt\b/i,
    returns: /(?:empty\s+)?pallets?.{0,25}(?:return|back)|return.{0,20}pallet/i,
    dunnage: /dunnage/i,
    driverAssist: /driver\s*assist/i,
  };
  for (const [key, pattern] of Object.entries(extraPatterns)) {
    const sentences = body.split(/[\n.!?]+/).filter((line) => pattern.test(line));
    extras[key as keyof typeof extras] = sentences.some((line) => !/\b(no|not|without|don't|do not)\b/i.test(line));
    if (sentences.length) warnings.push(`Confirm ${key === "returns" ? "pallet return" : key} requirement.`);
  }
  if (/same.day|guarantee|before\s*\d|\b\d{1,2}\s*(?:am|pm)\b|unload|helper|non.stack|refrigerat|hazmat|residential|\d[\d,]*\s*(?:lbs?|kg)\b/i.test(body)) {
    warnings.push("Check weight, equipment, handling and delivery timing against the card before copying.");
  }
  if (email.hasAttachments || /\battach(?:ed|ment)\b/i.test(body)) warnings.push("Attachments have not been read. Check them for shipment details.");
  if (/\b(?:FTL|full truck(?:load)?)\b/i.test(text) && /\b(?:LTL|straight truck)\b/i.test(text)) warnings.push("Multiple service types mentioned. Confirm the requested equipment.");
  const service = /\bFTL\b|full truck(?:load)?/i.test(text) ? "ftl" : /straight truck|5\s*ton/i.test(text) ? "straight" : "ltl";
  const isRequest = /\bquote|\brate\b|pricing|pickup|pick.up|\bskids?\b|\bpallets?\b/i.test(text);
  if (!isRequest) warnings.push("This message does not clearly request a freight quote.");
  return { customer, origin, destination, pallets, spots, dimensions, service, extras, warnings: [...new Set(warnings)], isRequest };
}

export const emailQuoteCustomerOptions = customerProfiles;
