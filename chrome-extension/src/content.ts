type AnalyzeMessage = {
  type: "analyze-rate-email";
};

type EmailPayload = {
  subject: string;
  body: string;
  sender: string;
  url: string;
};

declare const chrome: {
  runtime: {
    onMessage: {
      addListener(
        listener: (
          message: AnalyzeMessage,
          sender: unknown,
          sendResponse: (payload: EmailPayload | { error: string }) => void,
        ) => void,
      ): void;
    };
  };
};

function isVisible(element: Element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

function currentEmail(): EmailPayload | { error: string } {
  const bodies = Array.from(
    document.querySelectorAll<HTMLElement>("div.a3s.aiL, div.a3s"),
  ).filter(isVisible);
  const bodyElement = bodies.at(-1);

  if (!bodyElement) {
    return { error: "Open a customer email in Gmail, then click the button again." };
  }

  const message = bodyElement.closest<HTMLElement>(".adn.ads");
  const senderElement =
    message?.querySelector<HTMLElement>(".gD[email]") ??
    document.querySelector<HTMLElement>(".gD[email]");
  const senderName =
    senderElement?.getAttribute("name") ?? senderElement?.textContent?.trim() ?? "";
  const senderEmail = senderElement?.getAttribute("email") ?? "";
  const subject =
    Array.from(document.querySelectorAll<HTMLElement>("h2.hP"))
      .filter(isVisible)
      .at(-1)
      ?.textContent?.trim() ??
    document.title.replace(/\s*-\s*Gmail\s*$/i, "").trim();

  return {
    subject,
    body: bodyElement.innerText.trim(),
    sender: senderEmail
      ? `${senderName || senderEmail} <${senderEmail}>`
      : senderName,
    url: window.location.href,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "analyze-rate-email") return;
  sendResponse(currentEmail());
});
