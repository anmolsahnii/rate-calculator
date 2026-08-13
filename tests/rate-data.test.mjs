import assert from "node:assert/strict";
import test from "node:test";
import {
  cityAliases,
  cclsGtaDestinations,
  cclsSupplyRates,
  destinationSuggestions,
  ftlLtlFuelDestinations,
  palletLaneCards,
  montrealExterior,
  postalCodeSuggestions,
  rateCards,
  spotGtaPickupOrigins,
  spotOntarioZones,
  straightTruckMax5Ton,
  wheels18OntarioZones,
} from "../app/rate-data.ts";

test("uses LTL fuel for every configured Ontario FTL destination", () => {
  const destinations = [
    "mississauga",
    "etobicoke",
    "brampton",
    "halton hills",
    "toronto premium outlets",
    "oakville",
    "pickering",
    "toronto",
    "oshawa",
    "georgetown",
    "orangeville",
    "bolton",
    "newmarket",
    "vaughan",
    "markham",
    "scarborough",
    "burlington",
    "north york",
    "richmond hill",
    "milton",
  ];

  for (const destination of destinations) {
    assert.equal(ftlLtlFuelDestinations.has(destination), true, destination);
  }
});

test("maps Spot GTA pickup zones from the 5 Ton sheet", () => {
  assert.equal(spotOntarioZones[5].includes("ottawa"), true);
  assert.equal(spotOntarioZones[6].includes("niagara"), true);
  assert.equal(spotOntarioZones[6].includes("st catharines"), true);
  assert.equal(rateCards.spot.ltl[5][0], 119);
  assert.equal(rateCards.spot.ltl[6][0], 142.8);
  assert.equal(straightTruckMax5Ton[4], 750);
  assert.equal(straightTruckMax5Ton[5], 900);
  assert.equal(spotGtaPickupOrigins.includes("north york"), true);
  assert.equal(spotGtaPickupOrigins.includes("richmond hill"), true);
  assert.equal(spotGtaPickupOrigins.includes("kitchener"), false);
});

test("adds 18 Wheels Mississauga outbound pallet lanes", () => {
  assert.equal(rateCards.wheels18.fuelMode, "included");
  assert.deepEqual(palletLaneCards.wheels18["nova scotia"], [
    350,
    450,
    600,
    750,
    900,
    1100,
    1200,
  ]);
  assert.deepEqual(palletLaneCards.wheels18.vancouver, [
    450,
    650,
    850,
    1100,
    1400,
    1700,
    2100,
  ]);
  assert.equal(cityAliases["calgary-edmontn"], "calgary edmonton");
  assert.equal(cityAliases.halifax, "nova scotia");
  assert.equal(destinationSuggestions.includes("Nova Scotia"), true);
  assert.equal(destinationSuggestions.includes("nova scotia"), false);
});

test("adds the 18 Wheels GTA 5 Ton Ontario reference card", () => {
  assert.deepEqual(wheels18OntarioZones[1], [
    "vaughan",
    "toronto",
    "scarborough",
    "north york",
    "mississauga",
    "etobicoke",
    "brampton",
    "woodbridge",
  ]);
  assert.deepEqual(rateCards.wheels18.ltl?.[5], [
    117, 143, 156, 163, 185, 205, 218, 231, 238, 244, 257,
  ]);
  assert.deepEqual(rateCards.wheels18.ltl?.[6], [
    150, 221, 290, 359, 428, 498, 567, 636, 756, 788, 1248,
  ]);
});

test("uses the Uniqlo supplies GTA and regional destination card", () => {
  assert.equal(cclsGtaDestinations.includes("markham"), true);
  assert.equal(cclsGtaDestinations.includes("ajax"), true);
  assert.equal(cclsGtaDestinations.includes("toronto premium outlets"), true);
  assert.deepEqual(cclsSupplyRates.gta, [
    43, 33.6, 50.4, 67.2, 79.5, 95.4, 111.3, 127.2, 143.1, 133, 146.3, 159.6,
  ]);
  assert.deepEqual(palletLaneCards.ccls.ottawa, [
    48.1, 56, 84, 112, 130, 156, 182, 208, 234, 240, 264, 288,
  ]);
  assert.deepEqual(palletLaneCards.ccls.montreal, [
    52.91, 61.6, 92.4, 123.2, 143, 171.6, 200.2, 228.8, 257.4, 264, 290.4, 316.8,
  ]);
  assert.deepEqual(palletLaneCards.ccls["quebec city"], [
    63.49, 74, 111, 148, 171.5, 205.8, 240.1, 274.4, 308.7, 317, 348.7, 380.4,
  ]);
});

test("includes postal search coverage for configured destination zones", () => {
  assert.equal(spotOntarioZones[6].includes("niagara-on-the-lake"), true);
  assert.equal(montrealExterior.includes("quebec city"), true);
  assert.equal(
    postalCodeSuggestions.some(({ prefix, destination }) =>
      prefix === "K7M" && destination === "kingston"),
    true,
  );
});
