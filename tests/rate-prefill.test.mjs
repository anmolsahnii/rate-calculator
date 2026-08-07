import assert from "node:assert/strict";
import test from "node:test";
import { parseRatePrefill } from "../app/rate-prefill.ts";

const customers = ["spot", "vessi", "gobolt"];

test("parses a Gmail calculator handoff", () => {
  const prefill = parseRatePrefill(
    "?warehouse=montreal&destination=Brampton&pallets=4&customer=vessi&service=ltl&tailgate=1&helpers=2&market=20",
    customers,
  );

  assert.deepEqual(prefill, {
    pickup: "",
    warehouse: "montreal",
    destination: "Brampton",
    customer: "vessi",
    service: "ltl",
    pallets: 4,
    helpers: 2,
    market: 20,
    tailgate: true,
    inside: false,
    appointment: false,
    returns: false,
    dunnage: false,
    driverAssist: false,
  });
});

test("clamps numbers and rejects unknown enumerated values", () => {
  const prefill = parseRatePrefill(
    "?pickup=Richmond%20Hill&destination=Oakville&pallets=99&helpers=20&customer=unknown&service=express&market=75",
    customers,
  );

  assert.equal(prefill?.pickup, "Richmond Hill");
  assert.equal(prefill?.pallets, 12);
  assert.equal(prefill?.helpers, 6);
  assert.equal(prefill?.customer, null);
  assert.equal(prefill?.service, null);
  assert.equal(prefill?.market, null);
});

test("accepts straight truck and maps legacy auto links to LTL", () => {
  const straight = parseRatePrefill(
    "?destination=Oakville&pallets=6&service=straight",
    customers,
  );
  const legacy = parseRatePrefill("?service=auto", customers);

  assert.equal(straight?.service, "straight");
  assert.equal(legacy?.service, "ltl");
});

test("parses dunnage removal from a calculator handoff", () => {
  const prefill = parseRatePrefill(
    "?service=ftl&dunnage=1&driverAssist=1",
    customers,
  );

  assert.equal(prefill?.service, "ftl");
  assert.equal(prefill?.dunnage, true);
  assert.equal(prefill?.driverAssist, true);
});
