const assistantUrl = "https://anmolsahnii.github.io/rate-calculator/email-assistant.html";
const assistantOrigin = new URL(assistantUrl).origin;
const frame = document.getElementById("assistant");
const status = document.getElementById("connection");
frame.src = `${assistantUrl}?v=${Date.now()}`;
let ready = false;
let sequence = 0;
let previous = "";
let paused = false;

window.addEventListener("message", (event) => {
  if (event.origin !== assistantOrigin || event.source !== frame.contentWindow) return;
  if (event.data?.type === "3myle-assistant-ready") { ready = true; previous = ""; void refresh(); }
  if (event.data?.type === "3myle-follow-email") {
    paused = !event.data.enabled;
    previous = "";
    status.textContent = paused ? "Paused on this quote" : "Reading the open Gmail message...";
    if (!paused) void refresh();
  }
});

async function refresh() {
  if (!ready || paused) return;
  const request = ++sequence;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let email = null;
  let label = "Open an email in Gmail";
  try {
    if (tab?.id) {
      const result = await chrome.tabs.sendMessage(tab.id, { type: "3myle-read-open-email" });
      email = result?.email ?? null;
      label = email ? "Following the open Gmail message" : "Open or expand a Gmail message";
    }
  } catch { label = "Open Gmail; refresh its tab after first installation"; }
  if (request !== sequence || paused) return;
  status.textContent = label;
  const key = JSON.stringify([tab?.id, email]);
  if (key === previous) return;
  previous = key;
  frame.contentWindow.postMessage({ type: "3myle-open-email", email }, assistantOrigin);
}
setInterval(() => void refresh(), 1500);
chrome.tabs.onActivated.addListener(() => void refresh());
setTimeout(() => { if (!ready) status.textContent = "Rate panel could not connect. Check your internet connection and reopen the sidebar."; }, 20000);
