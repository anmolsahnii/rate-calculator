import assert from "node:assert/strict";
import test from "node:test";
import {
  cityAliases,
  destinationSuggestions,
  ftlLtlFuelDestinations,
  palletLaneCards,
  montrealExterior,
  postalCodeSuggestions,
  rateCards,
  spotGtaPickupOrigins,
  spotOntarioZones,
  straightTruckMax5Ton,
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

test("includes postal search coverage for configured destination zones", () => {
  assert.equal(spotOntarioZones[6].includes("niagara-on-the-lake"), true);
  assert.equal(montrealExterior.includes("quebec city"), true);
  assert.equal(
    postalCodeSuggestions.some(({ prefix, destination }) =>
      prefix === "K7M" && destination === "kingston"),
    true,
  );
});
