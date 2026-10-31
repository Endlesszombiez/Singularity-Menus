import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boardHTML, capacity, updateClocks } from "../static/board.js";

// Exercise the real player controller with minimal DOM/network/timer adapters.
// No browser or third-party DOM implementation is required.
const source = readFileSync(
  new URL("../static/player.js", import.meta.url),
  "utf8",
).replace(/^import[^\n]+\n/, "");
const run = new Function(
  "document",
  "location",
  "localStorage",
  "fetch",
  "addEventListener",
  "setInterval",
  "setTimeout",
  "clearTimeout",
  "innerWidth",
  "innerHeight",
  "boardHTML",
  "capacity",
  "updateClocks",
  "Date",
  source + "\nreturn {refresh};",
);
const cacheKey = "singularity-display-v1:production-floor";

function content(title = "Published tasks", revision = "v1") {
  return {
    revision,
    screen_name: "Production floor",
    settings: { site_name: "Workshop", timezone: "UTC" },
    board: {
      template: "production",
      theme: 0,
      title,
      page_seconds: 5,
      items: Array.from({ length: 8 }, (_, i) => ({
        title: `Task ${i}`,
        status: "To do",
        priority: "Normal",
      })),
    },
  };
}
function harness(responses, cached) {
  const display = {
    innerHTML: "",
    querySelector: () => ({ style: {} }),
    querySelectorAll: () => [],
  };
  const connection = { hidden: true, textContent: "" };
  const fullscreen = { addEventListener: () => {} };
  const document = {
    title: "",
    querySelector: (selector) =>
      ({
        "#display": display,
        "#connection": connection,
        "#fullscreen": fullscreen,
      })[selector],
  };
  const storage = new Map(cached ? [[cacheKey, JSON.stringify(cached)]] : []);
  const timers = [],
    intervals = [];
  let clock = 1_000_000;
  class FakeDate extends Date {
    static now() {
      return clock;
    }
  }
  const fetch = async () => {
    const result = responses.shift();
    if (result instanceof Error) throw result;
    if (!result) throw new Error("No response");
    return {
      ok: result.status === 200,
      status: result.status,
      json: async () => result.data,
    };
  };
  const player = run(
    document,
    { pathname: "/display/production-floor" },
    {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    fetch,
    () => {},
    (fn) => intervals.push(fn),
    (fn, delay) => {
      timers.push({ fn, delay });
      return timers.length;
    },
    () => {},
    1920,
    1080,
    boardHTML,
    capacity,
    updateClocks,
    FakeDate,
  );
  return {
    player,
    display,
    connection,
    storage,
    timers,
    document,
    tick: (seconds) => {
      clock += seconds * 1000;
      intervals.forEach((fn) => fn());
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("keeps cached content and retries when the server is unreachable", async () => {
  const env = harness(
    [new Error("Network down")],
    content("Last received plan"),
  );
  await flush();
  assert.ok(env.display.innerHTML.includes("Last received plan"));
  assert.equal(env.connection.hidden, false);
  assert.ok(env.connection.textContent.includes("Connection lost"));
  assert.ok(env.timers.some((t) => t.delay === 5000));
});

test("accepts published revisions, caches updates and paginates", async () => {
  const env = harness([{ status: 200, data: content() }]);
  await flush();
  assert.equal(env.connection.hidden, true);
  assert.ok(env.display.innerHTML.includes("Task 0"));
  assert.ok(!env.display.innerHTML.includes("Task 7"));
  assert.equal(env.document.title, "Production floor · Singularity");
  env.tick(6);
  assert.ok(env.display.innerHTML.includes("Task 7"));
  assert.ok(!env.display.innerHTML.includes("Task 0"));
  assert.equal(JSON.parse(env.storage.get(cacheKey)).revision, "v1");
});

test("clears a deleted screen cache instead of displaying obsolete assignments", async () => {
  const env = harness([{ status: 404 }], content("Obsolete board"));
  await flush();
  assert.ok(!env.display.innerHTML.includes("Obsolete board"));
  assert.ok(env.display.innerHTML.includes("This screen is not assigned"));
  assert.equal(env.storage.has(cacheKey), false);
});

test("shows connection loss after a live response and recovers on the next revision", async () => {
  const env = harness([
    { status: 200, data: content() },
    new Error("Offline"),
    { status: 200, data: content("Next shift", "v2") },
  ]);
  await flush();
  await env.player.refresh();
  assert.equal(env.connection.hidden, false);
  assert.ok(env.display.innerHTML.includes("Published tasks"));
  await env.player.refresh();
  assert.equal(env.connection.hidden, true);
  assert.ok(env.display.innerHTML.includes("Next shift"));
  assert.equal(JSON.parse(env.storage.get(cacheKey)).revision, "v2");
});
