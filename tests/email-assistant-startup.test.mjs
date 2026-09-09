import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../email-assistant/background.js", import.meta.url), "utf8");
function worker({ running = false, injectionFails = false } = {}) {
  const calls = [];
  const handlers = {};
  const chrome = {
    tabs: {
      query: async () => [{ id: 12 }, { id: 13 }],
      sendMessage: async (id) => { calls.push(["message", id]); if (!running) throw new Error("No receiver"); return { ready: true }; },
    },
    scripting: { executeScript: async (request) => { calls.push(["inject", request.target.tabId]); if (injectionFails) throw new Error("Access denied"); running = true; } },
    action: {
      onClicked: { addListener: (fn) => { handlers.click = fn; } },
      setBadgeText: async (value) => calls.push(["badge", value.text]),
      setTitle: async () => {},
    },
    runtime: { onInstalled: { addListener: (fn) => { handlers.install = fn; } } },
  };
  vm.runInNewContext(source, { chrome, console: { warn() {} } });
  return { calls, handlers };
}

test("toolbar recovers an already-open Gmail tab with no content script", async () => {
  const { calls, handlers } = worker();
  await handlers.click({ id: 12 });
  assert.deepEqual(calls, [["message", 12], ["inject", 12], ["message", 12], ["badge", ""]]);
});

test("toolbar does not inject a second note when one is running", async () => {
  const { calls, handlers } = worker({ running: true });
  await handlers.click({ id: 12 });
  assert.equal(calls.some(([type]) => type === "inject"), false);
});

test("failed access produces an actionable toolbar badge", async () => {
  const { calls, handlers } = worker({ injectionFails: true });
  await handlers.click({ id: 12 });
  assert.deepEqual(calls.at(-1), ["badge", "!"]);
});

test("installation starts the note in existing Gmail tabs", async () => {
  const { calls, handlers } = worker();
  await handlers.install();
  assert.ok(calls.some(([type, id]) => type === "message" && id === 12));
  assert.ok(calls.some(([type, id]) => type === "message" && id === 13));
});
