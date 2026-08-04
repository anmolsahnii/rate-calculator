import assert from "node:assert/strict";
import test from "node:test";
import { ftlLtlFuelDestinations } from "../app/rate-data.ts";

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
