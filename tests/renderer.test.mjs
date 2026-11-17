import { test } from "node:test";
import assert from "node:assert/strict";
import { boardHTML, capacity, esc, currentDate, pageCount, updateClocks } from "../static/board.js";

test("escapes user-supplied text in every display context", () => {
  const evil = '<img src=x onerror="alert(1)">';
  const html = boardHTML(
    {
      template: "production",
      theme: 0,
      title: evil,
      subtitle: evil,
      footer: evil,
      date: "",
      items: [
        {
          title: evil,
          detail: evil,
          owner: evil,
          due: evil,
          priority: "High",
          status: "To do",
        },
      ],
    },
    { site_name: evil },
  );
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.equal(esc(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("paginates tasks while keeping counts for the entire board", () => {
  const board = {
    template: "production",
    theme: 0,
    title: "Plan",
    items: Array.from({ length: 14 }, (_, i) => ({
      title: `TASK_${i}_END`,
      status: i < 3 ? "Done" : "To do",
      priority: "Normal",
    })),
  };
  const first = boardHTML(board, {}, 0);
  const last = boardHTML(board, {}, 1);
  assert.ok(!first.includes("TASK_0_END"));
  assert.ok(first.includes("TASK_3_END"));
  assert.ok(!first.includes("TASK_9_END"));
  assert.ok(last.includes("TASK_13_END"));
  assert.ok(!last.includes("TASK_0_END"));
  assert.ok(last.includes("2 / 2"));
  assert.equal(pageCount(board), 2);
  assert.equal(board.items.length, 14);
  assert.ok(first.includes("<strong>14</strong> tasks today"));
  assert.ok(last.includes("21% complete"));
});

test("renders all template themes, empty boards and metrics with zero target", () => {
  const types = [
    "production",
    "briefing",
    "announcements",
    "schedule",
    "metrics",
    "menu",
    "safety",
    "welcome",
  ];
  for (const template of types)
    for (const theme of [0, 1, 2]) {
      const empty = boardHTML({ template, theme, title: "Hello", items: [] });
      assert.ok(empty.includes(`template-${template} theme-${theme}`));
      assert.ok(empty.includes("No entries to show yet."));
      assert.ok(capacity(template) >= 3);
    }
  const metric = boardHTML({
    template: "metrics",
    theme: 2,
    title: "Output",
    items: [{ title: "Count", value: "10", target: "0", unit: "units" }],
  });
  assert.ok(!metric.includes("Infinity"));
  assert.ok(!metric.includes("NaN"));
  assert.ok(metric.includes("width:0%"));
});

test("automatic dates follow workspace midnight; fixed dates remain unchanged", () => {
  const before = new Date("2026-11-18T04:59:59Z");
  const after = new Date("2026-11-18T05:00:00Z");
  assert.equal(currentDate("America/New_York", before), "2026-11-17");
  assert.equal(currentDate("America/New_York", after), "2026-11-18");
  assert.equal(currentDate("Asia/Tokyo", before), "2026-11-18");
  const fixed = boardHTML({ template: "production", date: "2026-11-17", items: [] });
  const auto = boardHTML({ template: "production", auto_date: true, date: "2000-01-01", items: [] }, { timezone: "UTC" });
  assert.ok(fixed.includes("Tuesday, Nov 17"));
  assert.ok(!fixed.includes("data-auto-date"));
  assert.ok(auto.includes("data-auto-date"));
  assert.ok(!auto.includes("Saturday, Jan 1"));
  const date = {};
  updateClocks({ querySelectorAll: (selector) => selector === "[data-auto-date]" ? [date] : [] }, "UTC");
  assert.ok(date.textContent);
});

test("completed production tasks are retained but hidden, including all-complete boards", () => {
  const board = { template: "production", items: [
    { title: "Hidden completed task", status: "Done" },
  ] };
  const html = boardHTML(board);
  assert.ok(!html.includes("Hidden completed task"));
  assert.ok(html.includes("All tasks complete."));
  assert.ok(html.includes("100% complete"));
  assert.equal(board.items.length, 1);
  assert.equal(pageCount(board), 1);
  assert.ok(boardHTML({ ...board, template: "briefing" }).includes("Hidden completed task"));
});
