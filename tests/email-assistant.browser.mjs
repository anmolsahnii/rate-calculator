import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const html = await readFile("email-assistant.html");
const server = http.createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(html); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 400, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route(/appsexpress\.com/, (route) => route.fulfill({ body: "27-Jul-26 | 31 | 35.4 | 83.2", contentType: "text/plain" }));
try {
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByText("Paste an email", { exact: true }).click();
  await page.getByLabel("Sender / company", { exact: true }).fill("GoBolt <quotes@gobolt.com>");
  await page.getByLabel("Email text", { exact: true }).fill("From Mississauga to Ottawa\n2 pallets\n48 x 40 x 48 inches\nTailgate required. Inside delivery required.");
  await page.getByRole("button", { name: "Analyze request", exact: true }).click();
  await page.getByText("All-in customer price", { exact: true }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: /Customer agreement/ }).inputValue(), "gobolt");
  assert.equal(await page.getByLabel("Pallet spots", { exact: true }).inputValue(), "2");
  assert.equal(await page.getByLabel("Tailgate", { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel("Inside delivery", { exact: true }).isChecked(), true);
  // GoBolt two-pallet Ottawa card: $221 fuel included + $90 extras; +10%, rounded to $340.
  assert.equal(await page.locator(".ea-price").innerText(), "$340.00");
  assert.equal(await page.getByRole("button", { name: "Copy quote", exact: true }).isDisabled(), true);
  await page.getByLabel("Customer, load, fuel and delivery requirements reviewed", { exact: true }).check();
  assert.equal(await page.getByRole("button", { name: "Copy quote", exact: true }).isEnabled(), true);
  await page.getByLabel("Pallet spots", { exact: true }).fill("3");
  assert.equal(await page.getByRole("button", { name: "Copy quote", exact: true }).isDisabled(), true);
  await page.getByLabel("Pallet spots", { exact: true }).fill("2");
  assert.equal(await page.getByRole("button", { name: "Copy quote", exact: true }).isDisabled(), true, "Restoring the old value must not restore approval");
  await page.getByText("Price breakdown", { exact: true }).click();
  await mkdir("outputs/email-assistant-qa", { recursive: true });
  await page.screenshot({ path: "outputs/email-assistant-qa/sidebar.png", fullPage: true });
  for (const width of [280, 360, 480, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `No horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 280, height: 900 });
  await page.screenshot({ path: "outputs/email-assistant-qa/narrow.png", fullPage: true });
  await page.getByLabel("Destination / postal code", { exact: true }).fill("Unknown town");
  assert.equal(await page.locator(".ea-price").innerText(), "No confirmed rate");
  assert.equal(await page.getByRole("button", { name: "Copy quote", exact: true }).isDisabled(), true);
  if (!(await page.locator(".ea-paste").getAttribute("open") !== null)) await page.getByText("Paste an email", { exact: true }).click();
  await page.getByLabel("Email text", { exact: true }).fill("Can you quote the attached shipment?");
  await page.getByRole("button", { name: "Analyze request", exact: true }).click();
  assert.equal(await page.getByLabel("Pickup city / postal code", { exact: true }).inputValue(), "");
  assert.equal(await page.getByLabel("Destination / postal code", { exact: true }).inputValue(), "");
  assert.equal(await page.getByLabel("Pallet spots", { exact: true }).inputValue(), "");
  assert.equal(await page.locator(".ea-price").innerText(), "No confirmed rate");
  assert.deepEqual(errors, []);
  const reader = await browser.newPage();
  await reader.setContent('<div role="main"><h2 class="hP">Quote request</h2><div class="adn"><span class="gD" name="Earlier" email="earlier@example.com"></span><div class="a3s" style="display:none">Old 8 pallets</div></div><div class="adn"><span class="gD" name="GoBolt" email="quotes@gobolt.com"></span><div class="a3s"><div>From Mississauga to Ottawa</div><div>2 pallets</div><div class="gmail_quote">Old 8 pallets</div><div class="gmail_signature">Toronto office</div></div><div class="aQH"><div class="aZo">Attachment</div></div></div></div>');
  await reader.evaluate(() => { window.chrome = { runtime: { onMessage: { addListener(fn) { window.readQuoteEmail = fn; } } } }; });
  await reader.addScriptTag({ content: await readFile("email-assistant/gmail.js", "utf8") });
  const extracted = await reader.evaluate(() => new Promise((resolve) => window.readQuoteEmail({ type: "3myle-read-open-email" }, {}, resolve)));
  assert.equal(extracted.email.sender, "GoBolt <quotes@gobolt.com>");
  assert.match(extracted.email.body, /Mississauga to Ottawa\n2 pallets/);
  assert.doesNotMatch(extracted.email.body, /Old|office/);
  assert.equal(extracted.email.hasAttachments, true);
  await reader.setContent('<div role="main">Inbox</div>');
  const cleared = await reader.evaluate(() => new Promise((resolve) => window.readQuoteEmail({ type: "3myle-read-open-email" }, {}, resolve)));
  assert.equal(cleared.email, null);
  await reader.close();
  console.log("PASS: customer extraction, card pricing, fuel inclusion, extras, review reset, missing rate, new-message reset and 4 viewport widths");
  console.log("PASS: Gmail reader selects expanded message, strips older replies/signatures, flags attachments and clears on inbox");
} catch (error) {
  console.log(await page.locator("body").innerText());
  console.log(errors);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
