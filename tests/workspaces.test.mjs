/**
 * Tests: workspaces.mjs — DSH workspace.json discovery.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkspaces } from "../server/workspaces.mjs";

test("accepts array shape", () => {
  const rows = normalizeWorkspaces([
    { id: "ws1", cwd: "/a/b", title: "项目 A" },
    { id: "ws2", path: "/c/d" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "项目 A");
  assert.equal(rows[0].source, "registry");
  assert.equal(rows[1].title, "d"); // falls back to path basename
});

test("accepts map shape", () => {
  const rows = normalizeWorkspaces({ ws1: { cwd: "/a/b", title: "Alpha" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "ws1");
  assert.equal(rows[0].title, "Alpha");
});

test("accepts wrapped workspaces key", () => {
  const rows = normalizeWorkspaces({ workspaces: [{ id: "ws9", cwd: "/x" }] });
  assert.equal(rows.length, 1);
});

test("reads the live DSH tables.workspaces registry without leaking other tables", () => {
  const rows = normalizeWorkspaces({
    unit: { name: "workspace", version: 2 },
    tables: {
      workspaces: {
        "0de9": { path: "F:\\realhud\\dsh-iicp-kanban", title: "dsh-iicp-kanban" },
        "80f1": { path: "C:\\Users\\dev\\default-workspace" },
      },
      sessions: { anything: { path: "/should/not/appear" } },
    },
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["0de9", "80f1"],
  );
  assert.equal(rows[0].title, "dsh-iicp-kanban");
  assert.equal(rows[1].title, "default-workspace");
});

test("skips entries without id and path", () => {
  const rows = normalizeWorkspaces([{ title: "no id" }, null, "junk"]);
  assert.equal(rows.length, 0);
});

test("clips long titles to 80 chars", () => {
  const rows = normalizeWorkspaces([{ id: "w", cwd: "/p", title: "字".repeat(200) }]);
  assert.equal(rows[0].title.length, 80);
});
