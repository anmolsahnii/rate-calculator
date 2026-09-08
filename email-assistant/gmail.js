(() => {
  let revision = 0;
  const observer = new MutationObserver(() => { revision++; });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "aria-expanded"] });

  function visible(element) {
    return Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  }

  function readOpenMessage() {
    const main = document.querySelector('div[role="main"]');
    if (!main) return null;
    const subject = main.querySelector("h2.hP");
    const messages = [...main.querySelectorAll(".adn")].filter(visible);
    // Use the last expanded message only. Never combine different replies into one shipment.
    const expanded = messages.filter((message) => [...message.querySelectorAll(".a3s")].some(visible));
    const message = expanded.at(-1);
    const body = message && [...message.querySelectorAll(".a3s")].find(visible);
    if (!subject || !body) return null;
    const clone = body.cloneNode(true);
    clone.querySelectorAll(".gmail_quote, .gmail_signature, blockquote, script, style").forEach((node) => node.remove());
    // innerText on a detached clone loses line breaks; replace block boundaries first.
    clone.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    clone.querySelectorAll("div,p,tr,li").forEach((node) => node.append("\n"));
    const sender = message.querySelector(".gD[email]");
    return {
      sender: `${sender?.getAttribute("name") ?? ""} <${sender?.getAttribute("email") ?? ""}>`,
      subject: subject.textContent?.trim().slice(0, 500) ?? "",
      body: clone.textContent?.trim().slice(0, 40000) ?? "",
      hasAttachments: Boolean(message.querySelector(".aQH .aZo, .aQH .aV3, [download_url]")),
    };
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== "3myle-read-open-email") return;
    sendResponse({ email: readOpenMessage(), revision, location: location.hash });
  });
})();
