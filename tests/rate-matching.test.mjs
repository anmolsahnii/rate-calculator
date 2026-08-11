import assert from "node:assert/strict";
import test from "node:test";
import { cityKey, isSpotGtaPickup, zoneFor } from "../app/rate-matching.ts";
import { rateCards, spotOntarioZones } from "../app/rate-data.ts";

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
