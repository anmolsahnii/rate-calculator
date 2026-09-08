const assistantUrl = "https://anmolsahnii.github.io/rate-calculator/email-assistant.html";
const assistantOrigin = new URL(assistantUrl).origin;
const frame = document.getElementById("assistant");
const status = document.getElementById("connection");
frame.src = `${assistantUrl}?v=${Date.now()}`;
let ready = false;
let email = null;

function deliver() {
  if (ready) frame.contentWindow.postMessage({ type: "3myle-open-email", email }, assistantOrigin);
}

window.addEventListener("message", (event) => {
  if (event.origin === "https://mail.google.com" && event.source === window.parent) {
    if (event.data?.type !== "3myle-analyze-email") return;
    email = event.data.email;
    deliver();
    return;
  }
  if (event.origin !== assistantOrigin || event.source !== frame.contentWindow) return;
  if (event.data?.type !== "3myle-assistant-ready") return;
  ready = true;
  status.hidden = true;
  deliver();
});

window.parent.postMessage({ type: "3myle-note-ready" }, "https://mail.google.com");
setTimeout(() => { if (!ready) status.textContent = "Rate cards unavailable. Check your connection, then refresh Gmail."; }, 20000);
