import assert from "node:assert/strict";
import test from "node:test";
import { parseQuoteEmail } from "../app/email-quote-parser.ts";

const parse = (body, sender = "Canada Cartage <quotes@canadacartage.com>", extra = {}) => parseQuoteEmail({ sender, subject: "Rate request", body, ...extra });

test("reads sender, labelled addresses, skids and oversized floor space", () => {
  const result = parse("Origin Address:\n659 College Street East\nBelleville, ON K8N 0A3\nDestination:\n300 Taylor Road\nNiagara-on-the-Lake, ON L0S 1J0\n2 pallets\n51 x 36 x 37 inches\nTailgate and inside delivery required.");
  assert.equal(result.customer, "canada");
  assert.equal(result.origin, "belleville");
  assert.equal(result.destination, "niagara-on-the-lake");
  assert.equal(result.pallets, 2);
  assert.equal(result.spots, 4);
  assert.equal(result.extras.tailgate, true);
  assert.equal(result.extras.inside, true);
});

test("does not assign delivery company as the billing customer", () => {
  const result = parse("Pickup: Kingston\nDestination: GoBolt YYZ5 Markham\n3 pallets", "Other company <dispatch@example.com>");
  assert.equal(result.customer, "");
  assert.equal(result.destination, "markham");
});

test("parses a route and dimensions from separate skids", () => {
  const result = parse("From Caledon, ON to Kingston, ON\nTotal skids = 2\n40 x 48 x 34 @ 700 lbs\n40 x 48 x 34 @ 750 lbs");
  assert.equal(result.origin, "caledon");
  assert.equal(result.destination, "kingston");
  assert.equal(result.spots, 2);
});

test("ignores quoted older reply and does not enable negated extras", () => {
  const result = parse("From Mississauga to Ottawa\n2 skids\nNo tailgate required.\nOn Monday someone wrote:\nFrom Toronto to Montreal\n8 skids\nTailgate required");
  assert.equal(result.destination, "ottawa");
  assert.equal(result.pallets, 2);
  assert.equal(result.extras.tailgate, false);
});

test("leaves multiple counts and incomplete lanes unresolved", () => {
  const result = parse("Pickup: Mississauga\nDestination: Ottawa\n2 skids\nDestination: Toronto\n3 skids");
  assert.equal(result.destination, "");
  assert.equal(result.pallets, null);
  assert.ok(result.warnings.some((item) => item.includes("Multiple")));
});

test("explicit spots and linear feet take priority over skid count", () => {
  assert.equal(parse("From Mississauga to Ottawa\n3 skids\n5 pallet spots").spots, 5);
  assert.equal(parse("From Mississauga to Ottawa\n3 skids\n9 LF").spots, 4.5);
});

test("metric dimensions cannot silently use the inch estimator", () => {
  const result = parse("From Mississauga to Ottawa\n2 pallets\n120 x 100 x 150 cm");
  assert.equal(result.spots, null);
});

test("flags attachments and Uniqlo agreement ambiguity", () => {
  const result = parse("Uniqlo supplies\nFrom Mississauga to Ottawa\n3 skids", undefined, { hasAttachments: true });
  assert.equal(result.customer, "ccls");
  assert.ok(result.warnings.some((item) => item.startsWith("Attachments")));
  assert.ok(result.warnings.some((item) => item.includes("agreement")));
});

test("does not invent origin from an unrelated city in signature", () => {
  const result = parse("Destination: Ottawa\n2 skids\nRegards,\nSome Company\nMississauga ON");
  assert.equal(result.origin, "");
});

test("quantity ranges need a specific quantity", () => {
  assert.equal(parse("From Kingston to Markham\n5-7 pallets per pickup").pallets, null);
});
