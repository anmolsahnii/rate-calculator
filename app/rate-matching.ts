import {
  cityAliases,
  montrealLocalPostalPrefixes,
  postalCodeCityAliases,
  quebecCityPostalPrefixes,
  spotGtaPickupOrigins,
} from "./rate-data.ts";

const postalAliasEntries = Object.entries(postalCodeCityAliases).sort(
  ([left], [right]) => right.length - left.length,
);

const canadianPostalPattern =
  /\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ])(?:[\s-]?(\d[ABCEGHJ-NPRSTVWXYZ]\d))?\b/i;

export function clean(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(on|qc|pq|ab|bc|mb|sk|ns|nb)\b/g, " ")
    .replace(/[^a-z0-9'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function postalCodeFsa(value: unknown) {
  const match = String(value ?? "").toUpperCase().match(canadianPostalPattern);
  return match?.[1] ?? null;
}

function postalPrefixMatch(value: unknown, prefixes: string[]) {
  const fsa = postalCodeFsa(value);
  return Boolean(fsa && prefixes.some((prefix) => fsa.startsWith(prefix)));
}

export function postalCodeDestination(value: unknown) {
  const fsa = postalCodeFsa(value);
  if (!fsa) return null;
  return postalAliasEntries.find(([prefix]) => fsa.startsWith(prefix))?.[1] ?? null;
}

export function isMontrealLocalPostalCode(value: unknown) {
  return postalPrefixMatch(value, montrealLocalPostalPrefixes);
}

export function isQuebecCityPostalCode(value: unknown) {
  return postalPrefixMatch(value, quebecCityPostalPrefixes);
}

export function cityKey(value: unknown) {
  if (/^n\.?s\.?$/i.test(String(value ?? "").trim())) return "nova scotia";
  const postalDestination = postalCodeDestination(value);
  if (postalDestination) return postalDestination;
  const raw = clean(value);
  if (raw === "montreal local" || raw === "montreal exterior") return raw;
  for (const [alias, canonical] of Object.entries(cityAliases)) {
    const aliasKey = clean(alias);
    if (!aliasKey) continue;
    if (raw === aliasKey || (aliasKey.length >= 4 && raw.includes(aliasKey))) {
      return canonical;
    }
  }
  return raw;
}

export function zoneFor(city: string, zones: Record<number, string[]>) {
  for (const [zone, cities] of Object.entries(zones)) {
    if (cities.some((candidate) => clean(candidate) === clean(city))) {
      return Number(zone);
    }
  }
  return null;
}

export function isSpotGtaPickup(value: string) {
  if (clean(value) === "gta") return true;
  const pickup = cityKey(value);
  return spotGtaPickupOrigins.some(
    (origin) => clean(origin) === clean(pickup),
  );
}
