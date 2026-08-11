import assert from "node:assert/strict";
import test from "node:test";
import {
  estimatePalletSpots,
  formatEstimateNumber,
} from "../app/pallet-spots.ts";

test("estimates pallet spots from dimensions", () => {
  const estimate = estimatePalletSpots(
    "APPROX: 1 SKID, 51 X 36 X 37, 80 LBS",
  );

  assert.equal(estimate?.source, "dimensions");
  assert.equal(estimate?.skidCount, 1);
  assert.equal(estimate?.palletSpots, 2);
  assert.equal(formatEstimateNumber(estimate?.linearFeet ?? 0), "4");
});

test("estimates pallet spots from linear feet", () => {
  const estimate = estimatePalletSpots("7 linear ft");

  assert.equal(estimate?.source, "linear-feet");
  assert.equal(estimate?.palletSpots, 3.5);
  assert.equal(estimate?.skidCount, 4);
  assert.equal(estimate?.linearFeet, 7);
});

test("keeps direct pallet spots usable", () => {
  const estimate = estimatePalletSpots("6 pallet spots");

  assert.equal(estimate?.source, "spots");
  assert.equal(estimate?.palletSpots, 6);
  assert.equal(estimate?.linearFeet, 12);
});
