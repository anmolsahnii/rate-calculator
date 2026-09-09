import assert from "node:assert/strict";
import test from "node:test";
import { parseQuoteEmail } from "../app/email-quote-parser.ts";

const parse = (body, sender = "Canada Cartage <quotes@canadacartage.com>", extra = {}) => parseQuoteEmail({ sender, subject: "Rate request", body, ...extra });

test("reads sender, labelled addresses, skids and oversized floor space", () => {
  const result = parse("Origin Address:\n659 College Street East\nBelleville, ON K8N 0A3\nDestination:\n300 Taylor Road\nNiagara-on-the-Lake, ON L0S 1J0\n2 pallets\n51 x 36 x 37 inches\nTailgate and inside delivery required.");
  assert.equal(result.customer, "canada");
  assert.equal(result.origin, "mississauga");
  assert.ok(result.warnings.some((item) => item.includes("belleville")));
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
  assert.equal(result.origin, "mississauga");
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

test("defaults to Mississauga without needing a pickup in the message", () => {
  const result = parse("Destination: Ottawa\n2 skids\nRegards,\nSome Company\nMississauga ON");
  assert.equal(result.origin, "mississauga");
});

test("reads updated table dimensions and only recovers the destination from an older request", () => {
  const result = parse("Updated dimensions\nPallet\nLength(IN)\nWidth (IN)\nHeight(IN)\nWeight (LB)\n1\n72\n40\n35\n2100\n2\n73\n41\n18\n1500\n3\n48\n40\n14\n350\n3950\nBest Regards\nExample sender\nFrom: Example sender\nSent: Yesterday\nSubject: Rate request\nDelivery : Delivery Address:\nExample store\n123 Example Street\nUnit 10\nMontreal, QC\nH3B 4G5\nApprox. 5 skid spots\nBest Regards");
  assert.equal(result.destination, "montreal");
  assert.equal(result.pallets, 3);
  assert.deepEqual(result.dimensions, ["72 x 40 x 35 inches", "73 x 41 x 18 inches", "48 x 40 x 14 inches"]);
  assert.equal(result.spots, 7);
  assert.ok(result.warnings.some((item) => item.includes("earlier message")));
});

test("reads tab-separated HTML tables and a separately captured quoted address", () => {
  const result = parse("Pallet\tLength(IN)\tWidth (IN)\tHeight(IN)\tWeight (LB)\n1\t48\t40\t48\t1000\n", undefined, { quotedBody: "\nFrom: Earlier message\nDelivery Address:\nMontreal QC H3B 4G5\n8 skids" });
  assert.equal(result.pallets, 1);
  assert.equal(result.spots, 1);
  assert.equal(result.destination, "montreal");
});

test("current delivery overrides the earlier thread destination", () => {
  const result = parse("Delivery: Ottawa\n2 pallets\n48\" x 40\" x 48\"", undefined, { quotedBody: "\nFrom: Earlier message\nDelivery: Montreal\n8 skids" });
  assert.equal(result.destination, "ottawa");
  assert.equal(result.spots, 2);
});

test("recognizes skid spots without treating them as physical skid count", () => {
  const result = parse("Delivery: Montreal\nApprox. 5 skid spots");
  assert.equal(result.spots, 5);
  assert.equal(result.pallets, null);
});

test("quantity ranges need a specific quantity", () => {
  assert.equal(parse("From Kingston to Markham\n5-7 pallets per pickup").pallets, null);
});
