import {
  cityAliases,
  spotGtaPickupOrigins,
} from "./rate-data.ts";

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

export function cityKey(value: unknown) {
  if (/^n\.?s\.?$/i.test(String(value ?? "").trim())) return "nova scotia";
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
