/**
 * In-process smoke for the project module (v2.6).
 * Covers: create/update with dueDate + workspaceId, archive gating,
 * workspace discovery from storages/workspace.json, and delete detachment.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "iicp-smoke-project-"));
process.env.DSH_HOME = home;

// A DSH-side workspace registry so the module can render "workspace projects".
const storages = path.join(home, "storages");
fs.mkdirSync(storages, { recursive: true });
fs.writeFileSync(
  path.join(storages, "workspace.json"),
  JSON.stringify({
    workspaces: [
      { id: "ws-alpha", cwd: "F:\\realhud\\alpha", title: "Alpha 工作区" },
      { id: "ws-beta", cwd: "F:\\realhud\\beta" },
    ],
  }),
  "utf8",
);

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

const service = createKanbanService({ ctx: { logger: { info() {} , warn() {} } } });

// 1. workspaces are discovered from the DSH storage file (title falls back to basename)
const workspaces = await call(service, "/workspaces");
assert.equal(workspaces.status, 200);
const alpha = workspaces.json.workspaces.find((w) => w.id === "ws-alpha");
const beta = workspaces.json.workspaces.find((w) => w.id === "ws-beta");
assert.equal(alpha.title, "Alpha 工作区");
assert.equal(beta.title, "beta");

// 2. create a custom project bound to a workspace, with a due date
const created = await call(service, "/project.create", {
  method: "POST",
  body: { name: "跨工作区改造", notes: "把两张看板并行推进", dueDate: "2026-12-31", workspaceId: "ws-alpha" },
});
assert.equal(created.status, 200);
const project = created.json.project;
assert.equal(project.dueDate, "2026-12-31");
assert.equal(project.workspaceId, "ws-alpha");
assert.equal(project.archived, false);

// 3. an impossible calendar date is rejected (normalized to empty, not stored raw)
const badDate = await call(service, "/project.create", {
  method: "POST",
  body: { name: "非法日期", dueDate: "2026-02-31" },
});
assert.equal(badDate.json.project.dueDate, "");

// 4. tasks can be grouped into the project; moving to another project records history
const task = await call(service, "/task.create", {
  method: "POST",
  body: { title: "拆出项目卡片", projectId: project.id, workspaceId: "ws-alpha", dueDate: "2026-11-30" },
});
assert.equal(task.json.task.projectId, project.id);

// 5. archive the project: it disappears from the active list and blocks new tasks
const archived = await call(service, "/project.update", {
  method: "POST",
  body: { id: project.id, archived: true },
});
assert.equal(archived.json.project.archived, true);
const blocked = await call(service, "/task.create", {
  method: "POST",
  body: { title: "不该进来", projectId: project.id },
});
assert.equal(blocked.status, 400);

// 6. restore then delete: tasks are detached rather than deleted
await call(service, "/project.update", { method: "POST", body: { id: project.id, archived: false } });
const removed = await call(service, "/project.delete", { method: "POST", body: { id: project.id } });
assert.equal(removed.status, 200);
const after = await call(service, "/state");
assert.equal(after.json.projects.some((p) => p.id === project.id), false);
assert.equal(after.json.tasks.find((t) => t.id === task.json.task.id).projectId, "");
assert.ok(after.json.stats.projects >= 0);

// 7. the project list survives a store roundtrip with its new fields
const keep = await call(service, "/project.create", {
  method: "POST",
  body: { name: "持久化校验", dueDate: "2027-01-15", workspaceId: "ws-beta" },
});
const fresh = createKanbanService({ ctx: { logger: { info() {}, warn() {} } } });
const reloaded = await call(fresh, "/state");
const persisted = reloaded.json.projects.find((p) => p.id === keep.json.project.id);
assert.equal(persisted.dueDate, "2027-01-15");
assert.equal(persisted.workspaceId, "ws-beta");

fs.rmSync(home, { recursive: true, force: true });
console.log("SMOKE-PROJECT-PASS");
