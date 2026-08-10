import assert from "node:assert/strict";
import test from "node:test";
import { parseQuoteEmail } from "../src/email-parser.ts";

const data = {
  cities: [
    "mississauga",
    "montreal",
    "brampton",
    "north york",
    "ottawa",
    "oakville",
    "dorval",
    "richmond hill",
    "vancouver",
  ],
  profiles: [
    { id: "spot", label: "Spot" },
    { id: "wheels18", label: "18 Wheels" },
    { id: "vessi", label: "Vessi" },
    { id: "gobolt", label: "GoBolt" },
  ],
};

test("extracts a complete warehouse quote request", () => {
  const quote = parseQuoteEmail(
    {
      subject: "Vessi rate request",
      sender: "Vessi Operations <ops@vessi.com>",
      body: "Please quote 4 pallets from Mississauga, ON to Brampton, ON. LTL with tailgate.",
      url: "https://mail.google.com/",
    },
    data,
  );

  assert.equal(quote.customer, "vessi");
  assert.equal(quote.warehouse, "mississauga");
  assert.equal(quote.destination, "Brampton");
  assert.equal(quote.pallets, 4);
  assert.equal(quote.service, "ltl");
  assert.equal(quote.tailgate, true);
  assert.equal(quote.originDetected, true);
});

test("keeps incomplete emails in review state", () => {
  const quote = parseQuoteEmail(
    {
      subject: "Rate needed",
      sender: "Customer <customer@example.com>",
      body: "Can you quote delivery to Oakville?",
      url: "https://mail.google.com/",
    },
    data,
  );

  assert.equal(quote.destination, "Oakville");
  assert.equal(quote.pallets, 0);
  assert.equal(quote.originDetected, false);
  assert.equal(quote.warehouse, "mississauga");
});

test("infers one pallet from a standard skid Spot request", () => {
  const quote = parseQuoteEmail(
    {
      subject: "Load #3409600 North York to Ottawa",
      sender: "Customer <customer@example.com>",
      body: [
        "Pickup: North York, ON",
        "Delivery: Ottawa, ON",
        "It is 1 panel on standard skid.",
        "Need liftgate at delivery.",
      ].join("\n"),
      url: "https://mail.google.com/",
    },
    data,
  );

  assert.equal(quote.customer, "spot");
  assert.equal(quote.pickup, "North York");
  assert.equal(quote.destination, "Ottawa");
  assert.equal(quote.pallets, 1);
  assert.equal(quote.palletsDetected, true);
  assert.equal(quote.tailgate, true);
});

test("does not infer pallets from pallet-jack or rate-card text", () => {
  const quote = parseQuoteEmail(
    {
      subject: "Pallet Rates",
      sender: "Customer <customer@example.com>",
      body: "Can you quote delivery to Oakville? Need pallet jack only.",
      url: "https://mail.google.com/",
    },
    data,
  );

  assert.equal(quote.destination, "Oakville");
  assert.equal(quote.pallets, 0);
  assert.equal(quote.palletsDetected, false);
});

test("detects 18 Wheels customer requests", () => {
  const quote = parseQuoteEmail(
    {
      subject: "18 Wheels quote request",
      sender: "Customer <customer@example.com>",
      body: "Please quote 6 skids from Mississauga, ON to Vancouver, BC.",
      url: "https://mail.google.com/",
    },
    data,
  );

  assert.equal(quote.customer, "wheels18");
  assert.equal(quote.customerDetected, true);
  assert.equal(quote.destination, "Vancouver");
  assert.equal(quote.pallets, 6);
});

test("extracts a custom pickup and accessorials", () => {
  const quote = parseQuoteEmail(
    {
      subject: "Spot quote",
      sender: "Customer <customer@example.com>",
      body: [
        "Pickup: Richmond Hill, ON",
        "Destination: Oakville, ON",
        "Pallets: 3",
        "Appointment and inside delivery required with 1 helper and driver assist.",
      ].join("\n"),
      url: "https://mail.google.com/",
    },
    data,
  );

  assert.equal(quote.originType, "custom");
  assert.equal(quote.pickup, "Richmond Hill");
  assert.equal(quote.destination, "Oakville");
  assert.equal(quote.pallets, 3);
  assert.equal(quote.appointment, true);
  assert.equal(quote.inside, true);
  assert.equal(quote.driverAssist, true);
  assert.equal(quote.helpers, 1);
});

test("detects straight truck requests and caps pallets at 12", () => {
  const quote = parseQuoteEmail(
    {
      subject: "Straight truck quote",
      sender: "Customer <customer@example.com>",
      body: "Please quote 18 pallets from Mississauga to Oakville using a Max 5 Ton truck.",
      url: "https://mail.google.com/",
    },
    data,
  );

  assert.equal(quote.service, "straight");
  assert.equal(quote.pallets, 12);
});

test("detects an FTL request without pallets and dunnage removal", () => {
  const quote = parseQuoteEmail(
    {
      subject: "FTL quote",
      sender: "Customer <customer@example.com>",
      body: "Please quote FTL from Mississauga to Brampton with dunnage removal.",
      url: "https://mail.google.com/",
    },
    data,
  );

  assert.equal(quote.service, "ftl");
  assert.equal(quote.pallets, 0);
  assert.equal(quote.dunnage, true);
});
