import assert from "node:assert/strict";
import test from "node:test";
import { parseQuoteEmail } from "../src/email-parser.ts";

const data = {
  cities: [
    "mississauga",
    "montreal",
    "brampton",
    "oakville",
    "dorval",
    "richmond hill",
  ],
  profiles: [
    { id: "spot", label: "Spot" },
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
