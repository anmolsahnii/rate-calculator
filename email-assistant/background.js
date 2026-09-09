async function showNote(tab) {
  if (!tab.id) return;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "3myle-show-note" });
    if (!response?.ready) throw new Error("Note is not running");
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["gmail.js"] });
      const response = await chrome.tabs.sendMessage(tab.id, { type: "3myle-show-note" });
      if (!response?.ready) throw new Error("Note did not start");
    } catch (error) {
      await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      await chrome.action.setTitle({ tabId: tab.id, title: "Open Gmail and allow this extension on mail.google.com, then click again." });
      console.warn("3Myle quote note could not start:", error.message);
      return;
    }
  }
  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await chrome.action.setTitle({ tabId: tab.id, title: "Show 3Myle floating quote note" });
}

chrome.action.onClicked.addListener(showNote);
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: "https://mail.google.com/*" });
  await Promise.allSettled(tabs.map(showNote));
});
