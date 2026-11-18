/**
 * In-process smoke for the v2 task model (agent-execution semantics).
 * Uses the same fake req/res doubles as tests/service.test.mjs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "iicp-smoke-v2-"));
const { createKanbanService } = await import("../server/service.mjs");

function makeReq({ method = "GET", body } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = "/";
  req.end(body !== undefined ? JSON.stringify(body) : undefined);
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
  return { status: res.statusCode, json: JSON.parse(await res.finished) };
}

const service = createKanbanService({ ctx: { logger: { info() {}, warn() {} } } });

// 1. ping reports version 2
const ping = await call(service, "/ping");
assert.equal(ping.json.version, 2);

// 2. agent-style create with full v2 payload
const created = await call(service, "/task.create", {
  method: "POST",
  body: {
    title: "冒烟：v2 模型",
    goal: { text: "完成 v2 语义验证", source: "session" },
    acceptanceCriteria: "全部断言通过",
    origin: "session",
    sourceSessionId: "smoke-session",
    subtasks: [
      { text: "建模", done: true, source: "ai" },
      { text: "联动", done: false, source: "ai" },
      { text: "人工验收", done: false, source: "manual" },
    ],
    artifacts: [{ name: "result.md", path: "docs/result.md", kind: "deliverable" }],
  },
});
assert.equal(created.status, 200);
const task = created.json.task;
assert.equal(task.goal.status, "active");
assert.equal(task.progress, 33);
assert.equal(task.subtasks.length, 3);
assert.equal(task.artifacts[0].path, "docs/result.md");

// 3. drag to done: ai subtasks auto-close, manual survives, goal → done, progress → 67
const moved = await call(service, "/task.move", { method: "POST", body: { id: task.id, status: "done" } });
assert.equal(moved.json.task.goal.status, "done");
assert.equal(moved.json.task.progress, 67);
assert.equal(moved.json.task.subtasks.find((s) => s.source === "manual").done, false);
assert.ok(moved.json.task.history.some((h) => h.kind === "subtask"));

// 4. persistence roundtrip through state.json
const state = await call(service, "/state");
const stateTask = state.json.tasks.find((t) => t.id === task.id);
assert.equal(stateTask.goal.source, "session");
assert.equal(stateTask.progress, 67);

// 5. persisted file has the v2 shape
const file = path.join(process.env.DSH_HOME, "storages", "iicp-kanban", "state.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
assert.equal(raw.tasks[0].goal.text, "完成 v2 语义验证");
assert.equal(raw.tasks[0].acceptanceCriteria, "全部断言通过");

fs.rmSync(process.env.DSH_HOME, { recursive: true, force: true });
console.log("SMOKE-V2-PASS");
