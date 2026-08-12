import assert from "node:assert/strict";
import test from "node:test";
import {
  cityKey,
  isMontrealLocalPostalCode,
  isQuebecCityPostalCode,
  isSpotGtaPickup,
  postalCodeFsa,
  zoneFor,
} from "../app/rate-matching.ts";
import { ftlZones, rateCards, spotOntarioZones } from "../app/rate-data.ts";

test("keeps Ontario Spot cities from matching the Nova Scotia alias", () => {
  assert.equal(cityKey("brampton"), "brampton");
  assert.equal(cityKey("vaughan"), "vaughan");
  assert.equal(cityKey("NS"), "nova scotia");
  assert.equal(cityKey("Halifax"), "nova scotia");

  const bramptonZone = zoneFor(cityKey("brampton"), spotOntarioZones);
  assert.equal(bramptonZone, 1);
  assert.equal(rateCards.spot.ltl?.[bramptonZone]?.[1], 58);
  assert.equal(isSpotGtaPickup("Brampton"), true);
});

test("normalizes common quote spelling and store aliases", () => {
  assert.equal(cityKey("Missisauga warehouse"), "mississauga");
  assert.equal(cityKey("missiaga"), "mississauga");
  assert.equal(cityKey("montreeal"), "montreal");
  assert.equal(cityKey("Richmonhill"), "richmond hill");
  assert.equal(cityKey("Farm Boy Barrhaven"), "ottawa");
  assert.equal(cityKey("Farm Boy Port Credit"), "mississauga");
  assert.equal(cityKey("Farm Boy King & Weber"), "waterloo");
  assert.equal(cityKey("Farm Boy Fairway"), "kitchener");
});

test("resolves full Canadian postal codes into existing rate zones", () => {
  assert.equal(postalCodeFsa("Kingston, ON K7M 8T5"), "K7M");
  assert.equal(cityKey("Kingston, ON K7M 8T5"), "kingston");
  assert.equal(zoneFor(cityKey("K7M 8T5"), ftlZones), 6);
  assert.equal(cityKey("L0S 1J0"), "niagara-on-the-lake");
  assert.equal(zoneFor(cityKey("L0S 1J0"), spotOntarioZones), 6);
  assert.equal(cityKey("H4T 1S5"), "saint-laurent");
  assert.equal(isMontrealLocalPostalCode("H4T 1S5"), true);
  assert.equal(isMontrealLocalPostalCode("J3G 2T3"), true);
  assert.equal(cityKey("G1K 7P4"), "quebec city");
  assert.equal(isQuebecCityPostalCode("G1K 7P4"), true);
});
