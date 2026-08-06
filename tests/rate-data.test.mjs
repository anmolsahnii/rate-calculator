import assert from "node:assert/strict";
import test from "node:test";
import {
  ftlLtlFuelDestinations,
  rateCards,
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
});
