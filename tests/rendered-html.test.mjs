import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports the rate calculator for GitHub Pages", async () => {
  const html = await readFile(
    new URL("../out/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /<title>Rate Calculator<\/title>/i);
  assert.match(html, /Professional pallet freight pricing/);
  assert.match(html, /Built by Anmol Sahni/);
  assert.match(html, /Build a pallet rate/);
  assert.match(html, /Market adjustment/);
  assert.match(html, /Quote summary/);
  assert.match(html, /class="brand-mark"/);
  assert.match(html, />Spot</);
  assert.match(html, /Mississauga/);
  assert.match(html, /Montreal/);
  assert.match(html, /Montreal Local/);
  assert.match(html, /Montreal Exterior/);
  assert.match(html, /Straight Truck/);
  assert.match(html, /Dunnage removal/);
  assert.match(html, /Other pickup/);
  assert.match(html, /Bulk quote/);
  assert.match(html, /bulk-quote-panel/);
  assert.match(html, /confidence-badge/);
  assert.match(html, /Rate evidence and data notes/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
