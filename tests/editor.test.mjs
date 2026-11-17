import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as board from "../static/board.js";
import * as production from "../static/production.js";

// Run the actual editor handlers with small DOM adapters, as in the player tests.
const source = readFileSync(new URL("../static/app.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/init\(\);\s*$/, "");
const dependencies = { ...board, ...production, fitBoards: () => {} };
const run = new Function("document", "location", "ResizeObserver", "addEventListener",
  "setInterval", "requestAnimationFrame", "cancelAnimationFrame", ...Object.keys(dependencies),
  source + `
  return {
    setup(value, saved, specs) {
      editor = value;
      state = { settings: { timezone: "America/New_York" }, assignment_history: { "Team 2": 54, "Team 1": 50, Josh: 1 },
        boards: { test: { draft: saved } } };
      catalog = specs;
      render = () => {};
    },
    bindEditor, editorHTML, entryListHTML,
    isDirty: () => dirty,
  };`);
function element(dataset = {}) {
  const listeners = new Map(), classes = new Set();
  return {
    dataset, style: {}, value: "", disabled: false,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    emit(type, event = {}) { return listeners.get(type)?.({ type, ...event }); },
    classList: { add: (name) => classes.add(name), remove: (...names) => names.forEach((n) => classes.delete(n)), contains: (name) => classes.has(name) },
    focus() {}, scrollIntoView() {},
  };
}
function harness() {
  const root = element(), modal = element(), form = element(), list = element();
  const preview = { innerHTML: "", querySelectorAll: () => [] };
  const dateInput = element();
  const ownerInput = element();
  const cards = Array.from({ length: 3 }, (_, index) => {
    const card = element({ entryIndex: String(index) });
    card.getBoundingClientRect = () => ({ top: index * 150, height: 150 });
    return card;
  });
  const handle = element();
  handle.closest = () => cards[0];
  handle.querySelector = () => ownerInput;
  handle.setPointerCapture = () => {};
  handle.hasPointerCapture = () => true;
  handle.releasePointerCapture = () => {};
  list.querySelectorAll = (selector) => selector === ".entry-card" ? cards : cards.filter((card) => card.classList.contains("drop-before") || card.classList.contains("drop-after"));
  const document = {
    querySelector(selector) {
      if (selector === "#toast") throw new Error("Unexpected editor error toast");
      return { "#app": root, "#modal": modal, "#editor-form": form,
        "#entry-list": list, "#save-status": {}, "#editor-preview": preview,
        '[data-board-key="date"]': dateInput,
      }[selector] || (selector.includes('data-item-key="owner"') ? ownerInput : handle);
    },
    querySelectorAll: () => [],
  };
  const editor = { id: "test", template: "production", name: "Plan", title: "Tasks", date: "2020-01-01", theme: 0,
    page_seconds: 15, items: [{ title: "A", owner: "Team 1" }, { title: "B" }, { title: "C" }] };
  const saved = structuredClone(editor);
  const app = run(document, { hash: "" }, class { observe() {} }, () => {}, () => {}, () => 1, () => {}, ...Object.values(dependencies));
  app.setup(editor, saved, { production: { name: "Production", themes: [], columns: [["title", "Task"], ["owner", "Assigned to"], ["status", "Status"]] } });
  app.bindEditor();
  const click = async (action, extra = {}) => {
    const button = element({ action, ...extra });
    await root.emit("click", { target: { closest: (selector) => selector === "[data-action]" ? button : null } });
  };
  const drag = (finish = "pointerup") => {
    list.emit("pointerdown", { button: 0, pointerId: 1, clientY: 20, target: { closest: () => handle }, preventDefault() {} });
    handle.emit("pointermove", { clientY: 440 });
    assert.ok(cards[2].classList.contains("drop-after"));
    handle.emit(finish);
  };
  return { app, form, editor, dateInput, ownerInput, click, drag, cards };
}

test("editor switch uses today's workspace date and freezes it when disabled", () => {
  const env = harness();
  env.form.emit("input", { target: { dataset: { boardKey: "auto_date" }, checked: true } });
  assert.equal(env.editor.auto_date, true);
  assert.equal(env.dateInput.disabled, true);
  assert.equal(env.dateInput.value, board.currentDate("America/New_York"));
  env.form.emit("input", { target: { dataset: { boardKey: "auto_date" }, checked: false } });
  assert.equal(env.dateInput.disabled, false);
  env.form.emit("input", { target: { dataset: { boardKey: "date" }, value: "2026-11-01" } });
  assert.equal(env.editor.date, "2026-11-01");
  assert.equal(env.app.isDirty(), true);
});

test("editor renders matching duplicate controls and ranked assignee pills; clicks update the task", async () => {
  const env = harness();
  const html = env.app.entryListHTML();
  assert.ok(html.includes('data-action="duplicate-entry"'));
  assert.ok(html.includes('class="icon-btn drag-handle"'));
  assert.ok(html.indexOf('data-owner="Team 2"') < html.indexOf('data-owner="Team 1"'));
  assert.ok(html.includes('value="Done" >Complete</option>'));
  await env.click("assign-owner", { index: "0", owner: "Josh" });
  assert.equal(env.editor.items[0].owner, "Josh");
  assert.equal(env.ownerInput.value, "Josh");
  await env.click("duplicate-entry", { index: "0" });
  assert.deepEqual(env.editor.items.map((item) => item.title), ["A", "A", "B", "C"]);
  assert.notEqual(env.editor.items[0], env.editor.items[1]);
  await env.click("move-entry", { index: "1", direction: "1" });
  assert.deepEqual(env.editor.items.map((item) => item.title), ["A", "B", "A", "C"]);
});

test("pointer dragging inserts a task at its drop position and cancel preserves the order", () => {
  const env = harness();
  env.drag();
  assert.deepEqual(env.editor.items.map((item) => item.title), ["B", "C", "A"]);
  assert.equal(env.app.isDirty(), true);
  assert.ok(env.cards.every((card) => !card.classList.contains("drop-after") && !card.classList.contains("dragging")));
  const cancelled = harness();
  cancelled.drag("pointercancel");
  assert.deepEqual(cancelled.editor.items.map((item) => item.title), ["A", "B", "C"]);
  assert.equal(cancelled.app.isDirty(), false);
});
