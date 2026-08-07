import { customerProfiles, destinationSuggestions } from "../../app/rate-data";
import {
  parseQuoteEmail,
  type EmailPayload,
  type ParsedQuote,
} from "./email-parser";
import "./popup.css";

type ChromeTab = {
  id?: number;
  url?: string;
};

declare const chrome: {
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<ChromeTab[]>;
    sendMessage(
      tabId: number,
      message: { type: "analyze-rate-email" },
    ): Promise<EmailPayload | { error: string }>;
    create(options: { url: string }): Promise<ChromeTab>;
  };
};

const app = document.querySelector<HTMLElement>("#app");
const calculatorUrl = "https://anmolsahnii.github.io/rate-calculator/";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logo() {
  return `
    <span class="logo" aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <circle cx="10" cy="33" r="3.5"></circle>
        <path d="M14 33h5.5l9-12H38"></path>
        <path d="m32 15 6 6-6 6"></path>
      </svg>
    </span>
  `;
}

function shell(content: string) {
  return `
    <header>
      ${logo()}
      <div>
        <strong>Rate Calculator</strong>
        <span>Gmail quote reader</span>
      </div>
    </header>
    ${content}
    <footer>Built by Anmol Sahni</footer>
  `;
}

function showLoading() {
  if (!app) return;
  app.innerHTML = shell(`
    <section class="state">
      <span class="spinner" aria-hidden="true"></span>
      <h1>Reading open email</h1>
      <p>Looking for the customer, route, pallets, and service.</p>
    </section>
  `);
}

function showError(message: string) {
  if (!app) return;
  app.innerHTML = shell(`
    <section class="state error-state">
      <span class="state-icon" aria-hidden="true">!</span>
      <h1>Email not available</h1>
      <p>${escapeHtml(message)}</p>
      <button id="retry" type="button">Try again</button>
    </section>
  `);
  document.querySelector("#retry")?.addEventListener("click", () => void analyze());
}

function option(value: string, label: string, selected: string) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function formQuote(details: ParsedQuote): ParsedQuote {
  const origin = document.querySelector<HTMLSelectElement>("#origin")?.value;
  return {
    ...details,
    customer:
      document.querySelector<HTMLSelectElement>("#customer")?.value ?? "spot",
    originType: origin === "custom" ? "custom" : "warehouse",
    warehouse: origin === "montreal" ? "montreal" : "mississauga",
    pickup:
      document.querySelector<HTMLInputElement>("#pickup")?.value.trim() ?? "",
    destination:
      document.querySelector<HTMLInputElement>("#destination")?.value.trim() ?? "",
    pallets: Math.min(
      12,
      Math.max(
        0,
        Number(document.querySelector<HTMLInputElement>("#pallets")?.value) || 0,
      ),
    ),
    service:
      (document.querySelector<HTMLSelectElement>("#service")?.value as
        | "ltl"
        | "straight"
        | "ftl") ?? "ltl",
  };
}

async function openCalculator(details: ParsedQuote) {
  const url = new URL(calculatorUrl);
  url.searchParams.set("customer", details.customer);
  url.searchParams.set("destination", details.destination);
  url.searchParams.set("pallets", String(details.pallets));
  url.searchParams.set("service", details.service);
  url.searchParams.set("market", "10");
  url.searchParams.set("source", "gmail");

  if (details.originType === "custom" && details.pickup) {
    url.searchParams.set("pickup", details.pickup);
  } else {
    url.searchParams.set("warehouse", details.warehouse);
  }
  if (details.tailgate) url.searchParams.set("tailgate", "1");
  if (details.inside) url.searchParams.set("inside", "1");
  if (details.appointment) url.searchParams.set("appointment", "1");
  if (details.returns) url.searchParams.set("returns", "1");
  if (details.dunnage) url.searchParams.set("dunnage", "1");
  if (details.driverAssist) url.searchParams.set("driverAssist", "1");
  if (details.helpers) url.searchParams.set("helpers", String(details.helpers));

  await chrome.tabs.create({ url: url.toString() });
  window.close();
}

function showAnalysis(
  details: ParsedQuote,
  email: EmailPayload,
  openWhenReady = true,
) {
  if (!app) return;
  const needsReview =
    !details.originDetected ||
    !details.destinationDetected ||
    (details.service === "ltl" && !details.palletsDetected);
  const originValue =
    details.originType === "custom" ? "custom" : details.warehouse;

  app.innerHTML = shell(`
    <section class="summary">
      <div>
        <span class="eyebrow">Email analyzed</span>
        <h1>${needsReview ? "Review shipment details" : "Quote details found"}</h1>
      </div>
      <span class="status ${needsReview ? "review" : "ready"}">
        ${needsReview ? "Review" : "Ready"}
      </span>
    </section>
    <p class="subject" title="${escapeHtml(email.subject)}">${escapeHtml(email.subject)}</p>
    <form id="quote-form">
      <label>
        <span>Customer</span>
        <select id="customer">
          ${customerProfiles
            .map((profile) => option(profile.id, profile.label, details.customer))
            .join("")}
        </select>
      </label>
      <label>
        <span>Pickup origin</span>
        <select id="origin" class="${details.originDetected ? "" : "needs-review"}">
          ${option("mississauga", "Mississauga warehouse", originValue)}
          ${option("montreal", "Montreal warehouse", originValue)}
          ${option("custom", "Other pickup", originValue)}
        </select>
        ${
          details.originDetected
            ? ""
            : '<small>Not stated in the email. Mississauga is selected.</small>'
        }
      </label>
      <label id="pickup-field" class="${details.originType === "custom" ? "" : "hidden"}">
        <span>Pickup city</span>
        <input id="pickup" value="${escapeHtml(details.pickup)}" placeholder="City, province" />
      </label>
      <div class="field-row">
        <label>
          <span>Destination</span>
          <input
            id="destination"
            class="${details.destinationDetected ? "" : "needs-review"}"
            value="${escapeHtml(details.destination)}"
            placeholder="City, province"
          />
        </label>
        <label>
          <span>Pallets</span>
          <input
            id="pallets"
            class="${details.palletsDetected ? "" : "needs-review"}"
            type="number"
            min="0"
            max="12"
            value="${details.pallets || ""}"
            placeholder="0"
          />
        </label>
      </div>
      <label>
        <span>Service</span>
        <select id="service">
          ${option("ltl", "LTL", details.service)}
          ${option("straight", "Straight Truck", details.service)}
          ${option("ftl", "FTL", details.service)}
        </select>
      </label>
      <button class="primary" type="submit">Open calculated quote</button>
      <p id="form-error" class="form-error" role="alert"></p>
    </form>
  `);

  const origin = document.querySelector<HTMLSelectElement>("#origin");
  const pickupField = document.querySelector<HTMLElement>("#pickup-field");
  origin?.addEventListener("change", () => {
    pickupField?.classList.toggle("hidden", origin.value !== "custom");
  });

  document.querySelector("#quote-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const updated = formQuote(details);
    const error = document.querySelector<HTMLElement>("#form-error");
    if (
      !updated.destination ||
      (updated.service === "ltl" && updated.pallets < 1)
    ) {
      if (error) {
        error.textContent =
          updated.service === "ltl"
            ? "Destination and pallet count are required for LTL."
            : "Destination is required.";
      }
      return;
    }
    if (updated.originType === "custom" && !updated.pickup) {
      if (error) error.textContent = "Pickup city is required.";
      return;
    }
    void openCalculator(updated);
  });

  if (!needsReview && openWhenReady) {
    window.setTimeout(() => void openCalculator(details), 700);
  }
}

async function analyze() {
  showLoading();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (
      !tab?.id ||
      (tab.url !== undefined && !tab.url.startsWith("https://mail.google.com/"))
    ) {
      showError("Open the customer quote email in Gmail and try again.");
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "analyze-rate-email",
    });
    if ("error" in response) {
      showError(response.error);
      return;
    }

    showAnalysis(
      parseQuoteEmail(response, {
        cities: destinationSuggestions,
        profiles: customerProfiles,
      }),
      response,
    );
  } catch {
    showError(
      "Refresh the Gmail tab once after installing the extension, then try again.",
    );
  }
}

const previewMode =
  window.location.protocol !== "chrome-extension:" &&
  new URLSearchParams(window.location.search).get("preview") === "1";

if (previewMode) {
  const previewEmail: EmailPayload = {
    subject: "Quote request · Mississauga to Brampton",
    sender: "Vessi Operations <ops@example.com>",
    body: "Please quote 4 pallets from Mississauga, ON to Brampton, ON. LTL service.",
    url: window.location.href,
  };
  showAnalysis(
    parseQuoteEmail(previewEmail, {
      cities: destinationSuggestions,
      profiles: customerProfiles,
    }),
    previewEmail,
    false,
  );
} else {
  void analyze();
}
