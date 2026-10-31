import { test } from "node:test";
import assert from "node:assert/strict";
import { boardHTML, capacity, esc } from "../static/board.js";

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
  const last = boardHTML(board, {}, 2);
  assert.ok(first.includes("TASK_0_END"));
  assert.ok(!first.includes("TASK_6_END"));
  assert.ok(last.includes("TASK_13_END"));
  assert.ok(!last.includes("TASK_0_END"));
  assert.ok(last.includes("3 / 3"));
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
