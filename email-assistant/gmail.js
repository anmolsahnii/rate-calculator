(() => {
  if (location.origin !== "https://mail.google.com") return;
  function visible(element) {
    return Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  }

  function openMessageElements() {
    const main = document.querySelector('div[role="main"]');
    if (!main) return null;
    const subject = main.querySelector("h2.hP");
    const messages = [...main.querySelectorAll(".adn")].filter(visible);
    // Use the last expanded message only. Never combine different replies into one shipment.
    const expanded = messages.filter((message) => [...message.querySelectorAll(".a3s")].some(visible));
    const message = expanded.at(-1);
    const body = message && [...message.querySelectorAll(".a3s")].find(visible);
    return subject && body ? { subject, body, message } : null;
  }

  function readOpenMessage() {
    const current = openMessageElements();
    if (!current) return null;
    const { subject, body, message } = current;
    const clone = body.cloneNode(true);
    function plainText(node) {
      const copy = node.cloneNode(true);
      copy.querySelectorAll("script,style,.gmail_signature").forEach((item) => item.remove());
      copy.querySelectorAll("br").forEach((item) => item.replaceWith("\n"));
      copy.querySelectorAll("td,th").forEach((item) => item.append("\t"));
      copy.querySelectorAll("div,p,tr,li").forEach((item) => item.append("\n"));
      return copy.textContent?.trim() ?? "";
    }
    const quotedBody = [...clone.querySelectorAll(".gmail_quote, blockquote")]
      .filter((node) => !node.parentElement?.closest(".gmail_quote, blockquote"))
      .map((node) => `\nFrom: Earlier message\n${plainText(node)}`).join("\n").slice(0, 40000);
    clone.querySelectorAll(".gmail_quote, .gmail_signature, blockquote, script, style").forEach((node) => node.remove());
    const sender = message.querySelector(".gD[email]");
    return {
      sender: `${sender?.getAttribute("name") ?? ""} <${sender?.getAttribute("email") ?? ""}>`,
      subject: subject.textContent?.trim().slice(0, 500) ?? "",
      body: plainText(clone).slice(0, 40000),
      quotedBody,
      hasAttachments: Boolean(message.querySelector(".aQH .aZo, .aQH .aV3, [download_url]")),
    };
  }

  if (globalThis.threeMyleQuoteNote) {
    globalThis.threeMyleQuoteNote();
    return;
  }
  // A reloaded extension can leave an inert note from the previous context.
  document.getElementById("3myle-quote-note")?.remove();
  const host = document.createElement("div");
  host.id = "3myle-quote-note";
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;width:min(360px,calc(100vw - 24px));font:13px Arial,sans-serif;color:#203b33;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host{color-scheme:light}*{box-sizing:border-box;letter-spacing:0}.note{border:1px solid #c0c7b5;border-radius:6px;box-shadow:0 6px 28px #18352930;overflow:hidden;background:#fffef5}
    .handle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:#fff1aa;cursor:move;touch-action:none;user-select:none}
    .handle strong{font:700 13px Arial,sans-serif;color:#334c37}.handle button{width:28px;height:28px;padding:0;border:1px solid #c8bd83;border-radius:4px;background:transparent;font:20px Arial;cursor:pointer;color:#334c37}
    .actions{padding:10px 12px;background:#fffbed;display:flex;align-items:center;gap:10px}.actions button{background:#176a55;border:0;border-radius:4px;color:white;font:600 13px Arial;padding:10px 12px;cursor:pointer;flex:none}.status{font:11px/1.4 Arial;color:#58644b;overflow-wrap:anywhere}
    iframe{display:block;width:100%;height:min(440px,calc(100vh - 148px));min-height:80px;border:0;background:white}[hidden]{display:none!important}
    button:focus-visible{outline:2px solid #176a55;outline-offset:2px}
  `;
  // Build nodes directly so startup also works on pages enforcing Trusted Types.
  function element(tag, attributes = {}, text = "") {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.textContent = text;
    return node;
  }
  const note = element("section", { class: "note", "aria-label": "3Myle floating quote note" });
  const titlebar = element("div", { class: "handle" });
  titlebar.append(element("strong", {}, "3Myle · Quote note"), element("button", { type: "button", title: "Minimize note", "aria-label": "Minimize note" }, "−"));
  const content = element("div", { class: "contents" });
  const actions = element("div", { class: "actions" });
  actions.append(element("button", { type: "button" }, "Analyze email"), element("span", { class: "status", role: "status" }, "Connecting..."));
  content.append(actions, element("iframe", { title: "Quote result", allow: "clipboard-write", referrerpolicy: "no-referrer" }));
  note.append(titlebar, content);
  shadow.append(style, note);
  const frame = shadow.querySelector("iframe");
  const status = shadow.querySelector(".status");
  const contents = shadow.querySelector(".contents");
  const minimize = shadow.querySelector(".handle button");
  const handle = shadow.querySelector(".handle");
  const frameOrigin = `chrome-extension://${chrome.runtime.id}`;
  frame.src = chrome.runtime.getURL("panel.html");
  let lastEmail = null;
  let lastBody = null;
  let lastHash = "";
  let mounted = false;

  function send() {
    if (mounted) frame.contentWindow.postMessage({ type: "3myle-analyze-email", email: lastEmail }, frameOrigin);
  }
  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow || event.origin !== frameOrigin || event.data?.type !== "3myle-note-ready") return;
    mounted = true;
    status.textContent = "Ready";
    send();
  });
  shadow.querySelector(".actions button").addEventListener("click", () => {
    lastEmail = readOpenMessage();
    lastBody = openMessageElements()?.body ?? null;
    lastHash = location.hash;
    status.textContent = lastEmail ? "Current email" : "Open or expand an email";
    send();
  });
  function expand() {
    contents.hidden = false;
    minimize.textContent = "−";
    minimize.setAttribute("aria-label", "Minimize note");
    minimize.title = "Minimize note";
    constrain();
  }
  minimize.addEventListener("click", () => {
    if (contents.hidden) return expand();
    contents.hidden = true;
    minimize.textContent = "+";
    minimize.setAttribute("aria-label", "Expand note");
    minimize.title = "Expand note";
  });
  chrome.runtime.onMessage.addListener((request, _sender, respond) => {
    if (request?.type === "3myle-show-note") {
      expand();
      respond({ ready: true });
    }
  });
  function position(left, top) {
    const bounds = host.getBoundingClientRect();
    host.style.left = `${Math.max(8, Math.min(left, innerWidth - bounds.width - 8))}px`;
    host.style.top = `${Math.max(8, Math.min(top, innerHeight - bounds.height - 8))}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  }
  function constrain() {
    const bounds = host.getBoundingClientRect();
    position(bounds.left, bounds.top);
  }
  let drag = null;
  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button") || event.button !== 0) return;
    const bounds = host.getBoundingClientRect();
    drag = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    handle.setPointerCapture(event.pointerId);
    frame.style.pointerEvents = "none";
  });
  handle.addEventListener("pointermove", (event) => {
    if (drag) position(event.clientX - drag.x, event.clientY - drag.y);
  });
  const stopDrag = () => { drag = null; frame.style.pointerEvents = ""; };
  handle.addEventListener("pointerup", stopDrag);
  handle.addEventListener("pointercancel", stopDrag);
  host.addEventListener("keydown", (event) => event.stopPropagation());
  window.addEventListener("resize", constrain);

  const observer = new MutationObserver(() => {
    if (!chrome.runtime.id) { observer.disconnect(); host.remove(); return; }
    if (!host.isConnected) document.documentElement.append(host);
    if (lastEmail && (location.hash !== lastHash || openMessageElements()?.body !== lastBody)) {
      lastEmail = null;
      lastBody = null;
      status.textContent = "New message · ready";
      send();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-expanded"] });
  window.addEventListener("hashchange", () => {
    lastEmail = null;
    lastBody = null;
    status.textContent = "New message · ready";
    send();
  });
  document.documentElement.append(host);
  globalThis.threeMyleQuoteNote = expand;
  setTimeout(() => {
    if (!mounted) status.textContent = "Connection failed. Reload the extension and refresh Gmail.";
  }, 20000);
})();
