/**
 * Tests: store.mjs — persistence, migration, corruption recovery.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStore, emptyState, migrate, newId, newTaskId } from "../server/store.mjs";

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "iicp-kanban-test-"));
}

test("emptyState has expected defaults", () => {
  const state = emptyState();
  assert.equal(state.version, 1);
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.members, []);
  assert.deepEqual(state.projects, []);
  assert.equal(state.settings.defaultAssigneeId, "");
});

test("createStore requires dshHome", () => {
  assert.throws(() => createStore({}), /requires dshHome/);
});

test("load creates fresh state and persists it", () => {
  const home = tempHome();
  try {
    const store = createStore({ dshHome: home });
    const state = store.state;
    assert.equal(state.version, 1);
    assert.ok(fs.existsSync(store.file));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("save + reload roundtrip keeps data", () => {
  const home = tempHome();
  try {
    const store = createStore({ dshHome: home });
    store.state.members.push({
      id: "m_test1",
      name: "张三",
      title: "开发",
      contact: "",
      role: "member",
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    store.state.tasks.push({
      id: "t_test1",
      title: "写文档",
      goal: "",
      notes: "",
      status: "in_progress",
      priority: "P1",
      tags: ["docs"],
      workspaceId: "",
      projectId: "",
      assigneeId: "m_test1",
      origin: "manual",
      sourceSessionId: "",
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      history: [],
    });
    store.save();

    const reloaded = createStore({ dshHome: home });
    assert.equal(reloaded.state.members[0].name, "张三");
    assert.equal(reloaded.state.tasks[0].status, "in_progress");
    assert.equal(reloaded.state.tasks[0].assigneeId, "m_test1");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("corrupt state.json is backed up and replaced", () => {
  const home = tempHome();
  try {
    fs.mkdirSync(path.join(home, "storages", "iicp-kanban"), { recursive: true });
    fs.writeFileSync(
      path.join(home, "storages", "iicp-kanban", "state.json"),
      "{ this is not json",
      "utf8",
    );
    const store = createStore({ dshHome: home });
    const state = store.state;
    assert.equal(state.version, 1);
    const dir = path.join(home, "storages", "iicp-kanban");
    const backups = fs.readdirSync(dir).filter((name) => name.startsWith("state.json.corrupt-"));
    assert.equal(backups.length, 1);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("migrate clamps invalid values to defaults", () => {
  const state = migrate({
    tasks: [
      { id: "t_1", title: "合法", status: "bogus", priority: "P9", tags: ["a", "b", "c", "d", "e", "f"] },
      { title: "缺少 id" },
      null,
    ],
    members: [{ id: "m_1", name: "李四", role: "boss" }, { id: "", name: "无 id" }],
    projects: [{ id: "p_1", name: "" }],
    settings: { bogus: true, defaultAssigneeId: "m_1" },
  });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].status, "backlog");
  assert.equal(state.tasks[0].priority, "P2");
  assert.equal(state.tasks[0].tags.length, 4); // clamped to tagsPerTask
  assert.equal(state.members.length, 1);
  assert.equal(state.members[0].role, "member"); // invalid role → member
  assert.equal(state.projects.length, 0); // name required
  assert.equal(state.settings.defaultAssigneeId, "m_1");
  assert.equal(state.settings.bogus, undefined);
});

test("newTaskId is unique and prefixed", () => {
  const counters = { task: 0 };
  const ids = new Set(Array.from({ length: 100 }, () => newTaskId(counters)));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.ok(id.startsWith("t_"));
});

test("newId uses prefix", () => {
  const id = newId("m");
  assert.ok(id.startsWith("m_"));
  assert.equal(id.length, 10);
});

/* ---- v2 task model migration ---- */

test("v1 task with string goal migrates into goal object shape", () => {
  const state = migrate({
    tasks: [
      {
        id: "t_old1",
        title: "旧任务",
        goal: "老版本纯字符串目标",
        status: "in_progress",
      },
      {
        id: "t_old2",
        title: "已完成旧任务",
        goal: "已完成的目标",
        status: "done",
      },
      { id: "t_old3", title: "无目标", status: "backlog" },
    ],
  });
  const [running, done, none] = state.tasks;
  assert.equal(running.goal.text, "老版本纯字符串目标");
  assert.equal(running.goal.status, "active");
  assert.equal(running.goal.source, "task");
  assert.equal(done.goal.status, "done"); // follows task.status
  assert.equal(none.goal.text, "");
  assert.equal(none.goal.status, "none");
});

test("v2 task keeps goal/subtasks/artifacts/progress through roundtrip", () => {
  const state = migrate({
    tasks: [
      {
        id: "t_v2",
        title: "新模型任务",
        goal: { text: "目标", status: "active", source: "session" },
        acceptanceCriteria: "验收",
        progress: 250, // clamped
        subtasks: [
          { text: "一步", done: true, source: "ai" },
          "字符串子任务", // legacy string → manual
          { text: "", done: false, source: "ai" }, // invalid → dropped
        ],
        artifacts: [{ name: "a.md", path: "docs/a.md", kind: "deliverable", time: 5 }],
        lockedFields: ["subtasks", "junk"],
      },
    ],
  });
  const task = state.tasks[0];
  assert.equal(task.goal.source, "session");
  assert.equal(task.acceptanceCriteria, "验收");
  assert.equal(task.progress, 100); // clamped to 100
  assert.equal(task.subtasks.length, 2);
  assert.equal(task.subtasks[0].id, "s_1");
  assert.equal(task.subtasks[1].source, "manual"); // string migrated as manual
  assert.equal(task.artifacts[0].path, "docs/a.md");
  assert.deepEqual(task.lockedFields, ["subtasks"]);
});

test("dependsOn defaults to [] and keeps only unique string ids", () => {
  const state = migrate({
    tasks: [
      { id: "t_a", title: "A" },
      { id: "t_b", title: "B", dependsOn: "t_a" },
      { id: "t_c", title: "C", dependsOn: ["t_a", 7, "  ", "t_a", " t_b "] },
    ],
  });
  assert.deepEqual(state.tasks[0].dependsOn, []);
  assert.deepEqual(state.tasks[1].dependsOn, []);
  assert.deepEqual(state.tasks[2].dependsOn, ["t_a", "t_b"]);
});

test("dependsOn is capped at 8 entries", () => {
  const ids = Array.from({ length: 12 }, (_, index) => `t_${index}`);
  const state = migrate({
    tasks: [
      ...ids.map((id) => ({ id, title: id })),
      { id: "t_a", title: "A", dependsOn: ids },
    ],
  });
  const task = state.tasks.find((item) => item.id === "t_a");
  assert.deepEqual(task.dependsOn, ids.slice(0, 8));
});

test("migrate drops dangling and self prerequisite ids but keeps task state", () => {
  const state = migrate({
    tasks: [
      {
        id: "t_a",
        title: "A",
        status: "in_progress",
        priority: "P1",
        dependsOn: ["t_b", "t_missing", "t_a", "t_b"],
        archived: false,
      },
      { id: "t_b", title: "B", status: "done", dependsOn: ["t_missing"], archived: true },
    ],
  });
  assert.deepEqual(state.tasks[0].dependsOn, ["t_b"]);
  assert.deepEqual(state.tasks[1].dependsOn, []);
  assert.equal(state.tasks[0].status, "in_progress");
  assert.equal(state.tasks[0].priority, "P1");
  assert.equal(state.tasks[1].archived, true);
});
