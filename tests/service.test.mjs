/**
 * Tests: service.mjs — route behavior via a fake req/res pair.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createKanbanService } from "../server/service.mjs";

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "iicp-kanban-svc-"));
}

function fakeCtx() {
  return { logger: { info() {}, warn() {} } };
}

/** Minimal request/response doubles. */
function makeReq({ method = "GET", body } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = "/";
  if (body !== undefined) {
    req.end(JSON.stringify(body));
  } else {
    req.end();
  }
  return req;
}

function makeRes() {
  const res = new PassThrough();
  res.statusCode = 200;
  res.headersSent = false;
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.finished = new Promise((resolve) => res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))));
  res.writeHead = (status) => {
    res.statusCode = status;
    res.headersSent = true;
    return res;
  };
  return res;
}

async function call(service, route, { method = "GET", body } = {}) {
  const req = makeReq({ method, body });
  const res = makeRes();
  const url = new URL(`http://localhost${route}`);
  await service.handle(req, res, { route: url.pathname, url, method });
  await res.finished;
  return { status: res.statusCode, json: JSON.parse(res.finished ? await res.finished : "{}") };
}

function newService() {
  const home = tempHome();
  const service = createKanbanService({ ctx: fakeCtx() });
  // Production always starts the service; start() also seeds the default lead.
  service.start();
  // Rebind store to temp home: easiest via env var already read at import?
  return { service, home };
}

// service.mjs reads DSH_HOME at construction time; set env before creating.
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "iicp-kanban-env-"));

test("/ping responds ok", async () => {
  const { service } = newService();
  const { status, json } = await call(service, "/ping");
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.plugin, "dsh-iicp-kanban");
});

test("unknown route returns 404", async () => {
  const { service } = newService();
  const { status } = await call(service, "/nope");
  assert.equal(status, 404);
});

test("member create/update/delete lifecycle", async () => {
  const { service } = newService();
  const created = await call(service, "/member.create", {
    method: "POST",
    body: { name: "张三", role: "admin", title: "开发", contact: "zs@x" },
  });
  assert.equal(created.status, 200);
  const memberId = created.json.member.id;
  assert.equal(created.json.member.role, "admin");

  const updated = await call(service, "/member.update", {
    method: "POST",
    body: { id: memberId, name: "张三丰", role: "member" },
  });
  assert.equal(updated.json.member.name, "张三丰");
  assert.equal(updated.json.member.role, "member");

  const invalid = await call(service, "/member.update", {
    method: "POST",
    body: { id: memberId, role: "boss" },
  });
  assert.equal(invalid.status, 400);

  const deleted = await call(service, "/member.delete", { method: "POST", body: { id: memberId } });
  assert.equal(deleted.json.ok, true);
});

test("member create requires name", async () => {
  const { service } = newService();
  const result = await call(service, "/member.create", { method: "POST", body: { name: "" } });
  assert.equal(result.status, 400);
});

test("task lifecycle with assignment and unassign-on-member-delete", async () => {
  const { service } = newService();
  const member = await call(service, "/member.create", { method: "POST", body: { name: "李四" } });
  const memberId = member.json.member.id;

  const task = await call(service, "/task.create", {
    method: "POST",
    body: { title: "实现登录", assigneeId: memberId, priority: "P1", tags: ["auth", "后端"] },
  });
  assert.equal(task.status, 200);
  const taskId = task.json.task.id;
  assert.equal(task.json.task.assigneeId, memberId);
  assert.equal(task.json.task.status, "backlog");

  // invalid assignee rejected
  const bad = await call(service, "/task.create", { method: "POST", body: { title: "x", assigneeId: "m_missing" } });
  assert.equal(bad.status, 400);

  // move via kanban drag
  const moved = await call(service, "/task.move", { method: "POST", body: { id: taskId, status: "in_progress" } });
  assert.equal(moved.json.task.status, "in_progress");

  // state reflects assignment
  const state = await call(service, "/state");
  const stateTask = state.json.tasks.find((t) => t.id === taskId);
  assert.equal(stateTask.assigneeName, "李四");
  assert.equal(state.json.stats.byStatus.in_progress, 1);

  // deleting the member unassigns the task and records history
  await call(service, "/member.delete", { method: "POST", body: { id: memberId } });
  const after = await call(service, "/state");
  const afterTask = after.json.tasks.find((t) => t.id === taskId);
  assert.equal(afterTask.assigneeId, "");
  assert.ok(afterTask.history.some((entry) => entry.kind === "assignee" && entry.note.includes("李四")));
});

test("task update with status transition records history", async () => {
  const { service } = newService();
  const task = await call(service, "/task.create", { method: "POST", body: { title: "写报告" } });
  const taskId = task.json.task.id;
  const updated = await call(service, "/task.update", {
    method: "POST",
    body: { id: taskId, status: "done", title: "写报告（完）" },
  });
  assert.equal(updated.json.task.status, "done");
  assert.ok(updated.json.task.history.some((entry) => entry.kind === "status" && entry.to === "done"));
});

/* ---- v2 task model (super-kanban agent semantics) ---- */

test("task pin toggles through task.update and records history", async () => {
  const { service } = newService();
  const created = await call(service, "/task.create", { method: "POST", body: { title: "置顶验证" } });
  assert.equal(created.json.task.pinned, false);

  const pinned = await call(service, "/task.update", {
    method: "POST",
    body: { id: created.json.task.id, pinned: true },
  });
  assert.equal(pinned.json.task.pinned, true);
  assert.equal(pinned.json.changed, true);
  assert.ok(pinned.json.task.history.some((entry) => entry.kind === "pin" && entry.note === "置顶任务"));

  const unpinned = await call(service, "/task.update", {
    method: "POST",
    body: { id: created.json.task.id, pinned: false },
  });
  assert.equal(unpinned.json.task.pinned, false);
  assert.ok(unpinned.json.task.history.some((entry) => entry.kind === "pin" && entry.note === "取消置顶"));

  const noop = await call(service, "/task.update", {
    method: "POST",
    body: { id: created.json.task.id, pinned: false },
  });
  assert.equal(noop.json.changed, false);
});

test("task.create accepts v2 fields: goal object, acceptanceCriteria, subtasks, artifacts", async () => {
  const { service } = newService();
  const created = await call(service, "/task.create", {
    method: "POST",
    body: {
      title: "实现导出",
      goal: { text: "导出 CSV 可用", status: "active", source: "session" },
      acceptanceCriteria: "1) 点导出得 CSV；2) UTF-8 无乱码",
      origin: "session",
      sourceSessionId: "sess-123",
      subtasks: [
        { text: "选列导出", done: true, source: "ai" },
        { text: "写 CSV 编码", done: false, source: "ai" },
        { text: "人工复核", done: false, source: "manual" },
      ],
      artifacts: [{ name: "export.mjs", path: "server/export.mjs", kind: "deliverable", time: 1 }],
    },
  });
  assert.equal(created.status, 200);
  const task = created.json.task;
  assert.equal(task.goal.text, "导出 CSV 可用");
  assert.equal(task.goal.status, "active");
  assert.equal(task.goal.source, "session");
  assert.equal(task.acceptanceCriteria.includes("UTF-8"), true);
  assert.equal(task.origin, "session");
  assert.equal(task.sourceSessionId, "sess-123");
  assert.equal(task.subtasks.length, 3);
  assert.equal(task.progress, 33); // 1/3 derived
  assert.equal(task.artifacts[0].name, "export.mjs");
});

test("goal string from old clients migrates into goal object", async () => {
  const { service } = newService();
  const created = await call(service, "/task.create", {
    method: "POST",
    body: { title: "旧客户端任务", goal: "纯字符串目标" },
  });
  const task = created.json.task;
  assert.equal(typeof task.goal, "object");
  assert.equal(task.goal.text, "纯字符串目标");
  assert.equal(task.goal.status, "active");
  assert.equal(task.goal.source, "task");
});

test("done status auto-closes non-manual subtasks but keeps manual ones", async () => {
  const { service } = newService();
  const created = await call(service, "/task.create", {
    method: "POST",
    body: {
      title: "自动关闭语义",
      subtasks: [
        { text: "AI 步骤", done: false, source: "ai" },
        { text: "手工步骤", done: false, source: "manual" },
      ],
    },
  });
  const taskId = created.json.task.id;
  const moved = await call(service, "/task.move", { method: "POST", body: { id: taskId, status: "done" } });
  const subtasks = moved.json.task.subtasks;
  assert.equal(subtasks[0].done, true); // ai subtask auto-closed
  assert.equal(subtasks[1].done, false); // manual survives
  assert.equal(moved.json.task.progress, 50);
  assert.equal(moved.json.task.goal.status, "none"); // no goal text → none
  assert.ok(moved.json.task.history.some((entry) => entry.kind === "subtask"));
});

test("manual subtask edits update derived progress", async () => {
  const { service } = newService();
  const created = await call(service, "/task.create", {
    method: "POST",
    body: {
      title: "进度推导",
      subtasks: [{ text: "步骤一", done: false, source: "manual" }, { text: "步骤二", done: false, source: "manual" }],
    },
  });
  const taskId = created.json.task.id;
  const updated = await call(service, "/task.update", {
    method: "POST",
    body: {
      id: taskId,
      subtasks: [
        { text: "步骤一", done: true, source: "manual" },
        { text: "步骤二", done: false, source: "manual" },
      ],
    },
  });
  assert.equal(updated.json.task.progress, 50);
});

test("lockedFields filters to lockable set and protects semantics", async () => {
  const { service } = newService();
  const created = await call(service, "/task.create", {
    method: "POST",
    body: { title: "锁定测试", lockedFields: ["subtasks", "bogus-field"] },
  });
  assert.deepEqual(created.json.task.lockedFields, ["subtasks"]);
  const taskId = created.json.task.id;
  // With subtasks locked, moving to done must NOT auto-close unfinished subtasks.
  const made = await call(service, "/task.update", {
    method: "POST",
    body: { id: taskId, subtasks: [{ text: "锁住不关", done: false, source: "ai" }] },
  });
  assert.equal(made.json.task.progress, 0);
  const moved = await call(service, "/task.move", { method: "POST", body: { id: taskId, status: "done" } });
  assert.equal(moved.json.task.subtasks[0].done, false); // protected
});

test("subtask list caps at 12 and drops invalid entries", async () => {
  const { service } = newService();
  const subtasks = Array.from({ length: 15 }, (_, i) => ({ text: `s${i}`, done: false, source: "ai" }));
  subtasks.push({ text: "", done: false, source: "ai" }); // invalid → dropped
  const created = await call(service, "/task.create", { method: "POST", body: { title: "上限", subtasks } });
  assert.ok(created.json.task.subtasks.length <= 12);
});

test("partial goal object update merges and stays normalized", async () => {
  const { service } = newService();
  const created = await call(service, "/task.create", {
    method: "POST",
    body: { title: "合并", goal: { text: "初始目标", source: "task" } },
  });
  const taskId = created.json.task.id;
  const updated = await call(service, "/task.update", {
    method: "POST",
    body: { id: taskId, goal: { text: "改后的目标" } },
  });
  assert.equal(updated.json.task.goal.text, "改后的目标");
  assert.equal(updated.json.task.goal.source, "task");
  assert.equal(updated.json.task.goal.status, "active");
});

test("project lifecycle and task detachment on delete", async () => {
  const { service } = newService();
  const project = await call(service, "/project.create", { method: "POST", body: { name: "平台重构", notes: "q3" } });
  const projectId = project.json.project.id;
  const task = await call(service, "/task.create", {
    method: "POST",
    body: { title: "拆服务", projectId },
  });
  assert.equal(task.json.task.projectId, projectId);

  const badTask = await call(service, "/task.create", { method: "POST", body: { title: "x", projectId: "p_none" } });
  assert.equal(badTask.status, 400);

  await call(service, "/project.delete", { method: "POST", body: { id: projectId } });
  const state = await call(service, "/state");
  const stateTask = state.json.tasks.find((t) => t.id === task.json.task.id);
  assert.equal(stateTask.projectId, "");
});

test("member workload includes unassigned bucket", async () => {
  const { service } = newService();
  await call(service, "/task.create", { method: "POST", body: { title: "无主任务" } });
  const workload = await call(service, "/member.workload");
  const unassigned = workload.json.workload.find((row) => row.memberId === "");
  assert.ok(unassigned.total >= 1);
});

test("non-object body is rejected", async () => {
  const { service } = newService();
  const result = await call(service, "/task.create", { method: "POST", body: [1, 2] });
  assert.equal(result.status, 400);
});

test("project due date accepts a real date and rejects an impossible one", async () => {
  const { service } = newService();
  const good = await call(service, "/project.create", {
    method: "POST",
    body: { name: "有到期日", dueDate: "2026-03-31" },
  });
  assert.equal(good.json.project.dueDate, "2026-03-31");

  const bad = await call(service, "/project.create", {
    method: "POST",
    body: { name: "非法到期日", dueDate: "2026-02-31" },
  });
  assert.equal(bad.json.project.dueDate, "");

  const updated = await call(service, "/project.update", {
    method: "POST",
    body: { id: good.json.project.id, dueDate: "2026-04-01" },
  });
  assert.equal(updated.json.project.dueDate, "2026-04-01");

  const cleared = await call(service, "/project.update", {
    method: "POST",
    body: { id: good.json.project.id, dueDate: "" },
  });
  assert.equal(cleared.json.project.dueDate, "");
});

test("project keeps workspace binding and archive flag across updates", async () => {
  const { service } = newService();
  const created = await call(service, "/project.create", {
    method: "POST",
    body: { name: "绑定工作区", workspaceId: "ws-1", notes: "跨工作区归组" },
  });
  assert.equal(created.json.project.workspaceId, "ws-1");
  assert.equal(created.json.project.archived, false);

  const archived = await call(service, "/project.update", {
    method: "POST",
    body: { id: created.json.project.id, archived: true },
  });
  assert.equal(archived.json.project.archived, true);

  const state = await call(service, "/state");
  const project = state.json.projects.find((p) => p.id === created.json.project.id);
  assert.equal(project.workspaceId, "ws-1");
  assert.equal(project.archived, true);
  assert.equal(project.notes, "跨工作区归组");
});

test("archived project cannot receive new tasks", async () => {
  const { service } = newService();
  const created = await call(service, "/project.create", { method: "POST", body: { name: "归档项目" } });
  const projectId = created.json.project.id;
  await call(service, "/project.update", { method: "POST", body: { id: projectId, archived: true } });
  const rejected = await call(service, "/task.create", { method: "POST", body: { title: "不应落进来", projectId } });
  assert.equal(rejected.status, 400);
});

test("project delete detaches tasks and leaves a history trail", async () => {
  const { service } = newService();
  const created = await call(service, "/project.create", { method: "POST", body: { name: "待删项目" } });
  const projectId = created.json.project.id;
  const task = await call(service, "/task.create", { method: "POST", body: { title: "归属任务", projectId } });
  const before = task.json.task.updatedAt;

  await new Promise((resolve) => setTimeout(resolve, 5)); // make timestamps distinguishable
  const deleted = await call(service, "/project.delete", { method: "POST", body: { id: projectId } });
  assert.equal(deleted.status, 200);

  const state = await call(service, "/state");
  const after = state.json.tasks.find((t) => t.id === task.json.task.id);
  assert.equal(after.projectId, "");
  assert.notEqual(after.updatedAt, before);
  const trail = after.history.filter((entry) => entry.kind === "project").at(-1);
  assert.ok(trail, "expected a project history entry");
  assert.match(trail.note, /待删项目/);
});

test("project update honours expectedUpdatedAt (optimistic lock)", async () => {
  const { service } = newService();
  const created = await call(service, "/project.create", { method: "POST", body: { name: "乐观锁" } });
  const project = created.json.project;

  const stale = await call(service, "/project.update", {
    method: "POST",
    body: { id: project.id, notes: "旧快照", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
  });
  assert.equal(stale.status, 409);

  const fresh = await call(service, "/project.update", {
    method: "POST",
    body: { id: project.id, notes: "新快照", expectedUpdatedAt: project.updatedAt },
  });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.json.project.notes, "新快照");

  // A no-op write must not bump updatedAt or report a change.
  const noop = await call(service, "/project.update", {
    method: "POST",
    body: { id: project.id, notes: "新快照" },
  });
  assert.equal(noop.json.changed, false);
});

test("one live project per workspace", async () => {
  const { service } = newService();
  const first = await call(service, "/project.create", { method: "POST", body: { name: "绑定A", workspaceId: "ws-dup" } });
  assert.equal(first.status, 200);

  const second = await call(service, "/project.create", { method: "POST", body: { name: "绑定B", workspaceId: "ws-dup" } });
  assert.equal(second.status, 409);

  // Archiving frees the binding.
  await call(service, "/project.update", { method: "POST", body: { id: first.json.project.id, archived: true } });
  const third = await call(service, "/project.create", { method: "POST", body: { name: "绑定C", workspaceId: "ws-dup" } });
  assert.equal(third.status, 200);
});

test("stale project workspace bindings are healed on start", async () => {
  // Isolated DSH home that actually has a workspace registry.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "iicp-kanban-ws-"));
  fs.mkdirSync(path.join(home, "storages", "iicp-kanban"), { recursive: true });
  fs.writeFileSync(
    path.join(home, "storages", "workspace.json"),
    JSON.stringify({ tables: { workspaces: { "ws-live": { path: "F:/live", title: "live" } } } }),
    "utf8",
  );
  // Seed a state.json carrying the kind of value the old parser produced.
  fs.writeFileSync(
    path.join(home, "storages", "iicp-kanban", "state.json"),
    JSON.stringify({
      version: 1,
      projects: [{ id: "p_stale001", name: "旧项目", workspaceId: "unit" }],
      tasks: [],
      members: [],
      workspaces: [],
      settings: {},
      counters: {},
    }),
    "utf8",
  );

  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const service = createKanbanService({ ctx: fakeCtx() });
    service.start();
    const state = await call(service, "/state");
    assert.equal(state.json.projects.find((p) => p.id === "p_stale001").workspaceId, "");

    // With discovery available, unknown ids are rejected instead of stored.
    const rejected = await call(service, "/project.create", {
      method: "POST",
      body: { name: "坏绑定", workspaceId: "unit" },
    });
    assert.equal(rejected.status, 400);

    const accepted = await call(service, "/project.create", {
      method: "POST",
      body: { name: "好绑定", workspaceId: "ws-live" },
    });
    assert.equal(accepted.json.project.workspaceId, "ws-live");
  } finally {
    process.env.DSH_HOME = previous;
  }
});
