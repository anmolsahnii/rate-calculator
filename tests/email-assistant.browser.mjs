import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import http from "node:http";

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
  assert.equal(await page.getByText("Paste an email", { exact: true }).count(), 0);
  const sendEmail = (email) => page.evaluate((email) => window.dispatchEvent(new MessageEvent("message", {
    origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", source: window.parent,
    data: { type: "3myle-open-email", email },
  })), email);
  await sendEmail({ sender: "GoBolt <quotes@gobolt.com>", subject: "Quote request", body: "From Mississauga to Ottawa\n2 pallets\n48 x 40 x 48 inches\nTailgate required. Inside delivery required." });
  await page.getByText("All-in customer price", { exact: true }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: /Customer agreement/ }).inputValue(), "spot");
  await page.getByRole("combobox", { name: /Customer agreement/ }).selectOption("gobolt");
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
  await sendEmail({ sender: "GoBolt <quotes@gobolt.com>", subject: "New request", body: "Can you quote the attached shipment?" });
  assert.equal(await page.getByLabel("Pickup city / postal code", { exact: true }).inputValue(), "mississauga");
  assert.equal(await page.getByLabel("Destination / postal code", { exact: true }).inputValue(), "");
  assert.equal(await page.getByLabel("Pallet spots", { exact: true }).inputValue(), "");
  assert.equal(await page.locator(".ea-price").innerText(), "No confirmed rate");
  await sendEmail({ sender: "Example <quote@example.com>", subject: "Updated rate request", body: "Pallet\tLength(IN)\tWidth (IN)\tHeight(IN)\tWeight (LB)\n1\t72\t40\t35\t2100\n2\t73\t41\t18\t1500\n3\t48\t40\t14\t350\n3950", quotedBody: "\nFrom: Earlier message\nDelivery Address:\nMontreal, QC H3B 4G5\n5 skid spots" });
  assert.equal(await page.getByRole("combobox", { name: /Customer agreement/ }).inputValue(), "spot");
  assert.equal(await page.getByLabel("Pickup city / postal code", { exact: true }).inputValue(), "mississauga");
  assert.equal(await page.getByLabel("Destination / postal code", { exact: true }).inputValue(), "montreal");
  assert.equal(await page.getByLabel("Pallet spots", { exact: true }).inputValue(), "7");
  // Spot Montreal: seven spots $658 + 35.4% fuel + 10% adjustment, rounded to $980.
  assert.equal(await page.locator(".ea-price").innerText(), "$980.00");
  console.log("Updated table Spot quote:", await page.locator(".ea-price").innerText());
  await page.getByRole("combobox", { name: /^Service/ }).selectOption("ftl");
  for (const destination of ["Mississauga", "Oakville", "Hamilton", "Concord", "Woodbridge", "L9C 6C2"]) {
    await page.getByLabel("Destination / postal code", { exact: true }).fill(destination);
    assert.match(await page.locator(".ea-fuel").innerText(), /APPS LTL 35\.4%/, destination);
  }
  await page.getByLabel("Destination / postal code", { exact: true }).fill("Montreal");
  assert.match(await page.locator(".ea-fuel").innerText(), /APPS FTL 83\.2%/);
  await sendEmail(null);
  await page.getByText("No message analyzed", { exact: true }).waitFor();
  assert.equal(await page.locator(".ea-price").count(), 0);
  assert.deepEqual(errors, []);
  const reader = await browser.newPage();
  await reader.route("https://mail.google.com/**", (route) => route.fulfill({ contentType: "text/html", headers: { "Content-Security-Policy": "require-trusted-types-for 'script'" }, body: '<div role="main"><h2 class="hP">Quote request</h2><div class="adn"><span class="gD" name="Earlier" email="earlier@example.com"></span><div class="a3s" style="display:none">Old 8 pallets</div></div><div class="adn"><span class="gD" name="GoBolt" email="quotes@gobolt.com"></span><div class="a3s"><div>From Mississauga to Ottawa</div><div>2 pallets</div><div class="gmail_quote">Old 8 pallets</div><div class="gmail_signature">Toronto office</div></div><div class="aQH"><div class="aZo">Attachment</div></div></div></div>' }));
  await reader.goto("https://mail.google.com/mail/u/0/#inbox/test-fixture");
  await reader.evaluate(() => {
    window.chrome = { runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", getURL: (file) => `chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${file}`, onMessage: { addListener(fn) { window.showQuoteNote = fn; } } } };
    // A simulated extension-frame port isolates the Gmail reader from installed browser state.
    window.sentQuotes = [];
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", { get() { return window; } });
    window.postMessage = (message, targetOrigin) => window.sentQuotes.push({ message, targetOrigin });
  });
  await reader.evaluate(await readFile("email-assistant/gmail.js", "utf8"));
  await reader.evaluate(await readFile("email-assistant/gmail.js", "utf8"));
  assert.equal(await reader.locator('[id="3myle-quote-note"]').count(), 1, "Reinjection leaves one functioning note");
  await reader.evaluate(() => window.dispatchEvent(new MessageEvent("message", { source: window, origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", data: { type: "3myle-note-ready" } })));
  assert.equal(await reader.evaluate(() => window.sentQuotes.filter((item) => item.message.email).length), 0, "No email read before click");
  await reader.getByRole("button", { name: "Analyze email", exact: true }).click();
  const extracted = await reader.evaluate(() => window.sentQuotes.at(-1).message.email);
  assert.equal(extracted.sender, "GoBolt <quotes@gobolt.com>");
  assert.match(extracted.body, /Mississauga to Ottawa\n2 pallets/);
  assert.doesNotMatch(extracted.body, /Old|office/);
  assert.match(extracted.quotedBody, /Old 8 pallets/);
  assert.equal(extracted.hasAttachments, true);
  assert.equal(await reader.evaluate(() => window.sentQuotes.at(-1).targetOrigin), "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  await reader.getByRole("button", { name: "Minimize note", exact: true }).click();
  assert.equal(await reader.getByRole("button", { name: "Analyze email", exact: true }).isVisible(), false);
  await reader.getByRole("button", { name: "Expand note", exact: true }).click();
  assert.equal(await reader.getByRole("button", { name: "Analyze email", exact: true }).isVisible(), true);
  const handle = reader.locator('[id="3myle-quote-note"] .handle');
  const before = await handle.boundingBox();
  await reader.mouse.move(before.x + 30, before.y + 20);
  await reader.mouse.down();
  await reader.mouse.move(100, 100, { steps: 6 });
  await reader.mouse.up();
  const after = await handle.boundingBox();
  assert.ok(after.x < before.x, "Note is draggable");
  await reader.setViewportSize({ width: 320, height: 640 });
  const bounds = await reader.locator('[id="3myle-quote-note"]').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320 && bounds.y + bounds.height <= 640, "Note stays in viewport");
  await reader.route(/appsexpress\.com/, (route) => route.fulfill({ body: "27-Jul-26 | 31 | 35.4 | 83.2", contentType: "text/plain" }));
  const hostedFixture = "https://anmolsahnii.github.io/rate-calculator/email-assistant.html";
  await reader.route(hostedFixture, (route) => route.fulfill({ contentType: "text/html", body: html }));
  await reader.locator('iframe[title="Quote result"]').evaluate((iframe, url) => { iframe.src = url; }, hostedFixture);
  const renderedNote = reader.frameLocator('iframe[title="Quote result"]');
  await renderedNote.getByText("No message analyzed", { exact: true }).waitFor();
  const resultFrame = reader.frames().find((frame) => frame.url() === hostedFixture);
  await resultFrame.evaluate((email) => window.dispatchEvent(new MessageEvent("message", { origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", source: window.parent, data: { type: "3myle-open-email", email } })), extracted);
  await renderedNote.getByText("All-in customer price", { exact: true }).waitFor();
  await reader.screenshot({ path: "outputs/email-assistant-qa/floating-note.png" });
  await reader.getByRole("button", { name: "Close note", exact: true }).click();
  assert.equal(await reader.locator('[id="3myle-quote-note"]').isVisible(), false);
  await reader.evaluate(() => { document.querySelector('div[role="main"]').textContent = "Inbox"; });
  await reader.waitForFunction(() => window.sentQuotes.at(-1).message.email === null);
  assert.equal(await reader.locator('[id="3myle-quote-note"]').isVisible(), false, "Closed note stays hidden during Gmail navigation");
  await reader.evaluate(() => window.showQuoteNote({ type: "3myle-show-note" }, {}, () => {}));
  assert.equal(await reader.getByRole("button", { name: "Analyze email", exact: true }).isVisible(), true, "Note survives Gmail navigation");
  assert.equal((await browser.contexts()[0].pages()).length, 1, "Assistant does not open a tab in the original context");
  await reader.close();
  console.log("PASS: customer extraction, card pricing, fuel inclusion, extras, review reset, missing rate, new-message reset and 4 viewport widths");
  console.log("PASS: floating Gmail note, click-only extraction, minimize/expand, drag, viewport bounds and clear on navigation");
} catch (error) {
  console.log(await page.locator("body").innerText());
  console.log(errors);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
