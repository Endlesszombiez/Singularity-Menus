import { test } from "node:test";
import assert from "node:assert/strict";
import { moveTask, duplicateTask, topAssignees } from "../static/production.js";

test("duplicates the complete task immediately below the original as an independent copy", () => {
  const items = [{ title: "First", owner: "Team 1", status: "Done", detail: "Details", due: "10:00", priority: "High" }, { title: "Last" }];
  assert.equal(duplicateTask(items, 0), true);
  assert.deepEqual(items.map((item) => item.title), ["First", "First", "Last"]);
  assert.deepEqual(items[1], items[0]);
  items[1].detail = "Changed";
  assert.equal(items[0].detail, "Details");
  assert.equal(duplicateTask(items, -1), false);
  assert.equal(duplicateTask(Array(100).fill(items[0]), 0), false);
});

test("reorders by insertion in both directions and keeps every task", () => {
  const items = ["A", "B", "C", "D"];
  assert.equal(moveTask(items, 0, 2), true);
  assert.deepEqual(items, ["B", "C", "A", "D"]);
  assert.equal(moveTask(items, 3, 0), true);
  assert.deepEqual(items, ["D", "B", "C", "A"]);
  assert.equal(moveTask(items, 0, 0), false);
  assert.equal(moveTask(items, 0, 4), false);
});

test("ranks the top three historical assignees plus unsaved assignments without inflating saved counts", () => {
  const history = { "Team 1": 50, Josh: 1, "Team 2": 54, Other: 1 };
  assert.deepEqual(topAssignees(history, [], []), ["Team 2", "Team 1", "Josh"]);
  const items = Array.from({ length: 60 }, () => ({ owner: "Team 1" }));
  assert.deepEqual(topAssignees(history, items, items), ["Team 2", "Team 1", "Josh"]);
  assert.deepEqual(topAssignees(history, items, []), ["Team 1", "Team 2", "Josh"]);
  assert.deepEqual(topAssignees({}, [{ owner: " Josh " }, { owner: "" }], []), ["Josh"]);
  assert.equal(history["Team 1"], 50);
});
