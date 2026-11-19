/**
 * In-process smoke for the v0.3 team model (one lead agent, many workers).
 * Uses the same fake req/res doubles as the other smoke scripts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "iicp-smoke-team-"));
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
  return { status: res.statusCode, json: JSON.parse(await res.finished) };
}

const service = createKanbanService({ ctx: { logger: { info() {}, warn() {} } } });
service.start();

// 1. ping still reports the task-model version
const ping = await call(service, "/ping");
assert.equal(ping.json.version, 2);

// 2. an empty install is seeded with a default lead on start
const seeded = await call(service, "/team");
assert.ok(seeded.json.team.lead, "a default lead must be seeded on an empty install");
assert.equal(seeded.json.team.lead.name, "队长");
assert.equal(seeded.json.team.lead.kind, "lead");
const seededLeadId = seeded.json.team.lead.id;

// 2b. the lead cannot be deleted or demoted
const deleteLead = await call(service, "/member.delete", { method: "POST", body: { id: seededLeadId } });
assert.equal(deleteLead.status, 400);
assert.match(deleteLead.json.message, /队长不可被删除/);
const demoteLead = await call(service, "/member.update", { method: "POST", body: { id: seededLeadId, kind: "worker" } });
assert.equal(demoteLead.status, 400);
assert.match(demoteLead.json.message, /队长不可被卸任/);

// 3. a new member joins the seeded lead as a worker
const lead = await call(service, "/member.create", {
  method: "POST",
  body: { name: "墨渊", title: "主理人", personality: "先问目标再动手", skills: ["拆解", "验收"] },
});
assert.equal(lead.status, 200);
assert.equal(lead.json.member.kind, "worker");
assert.equal(lead.json.member.leadId, seededLeadId);

const worker = await call(service, "/member.create", {
  method: "POST",
  body: { name: "青岚", title: "执行", provider: "deepseek", model: "v4", skills: ["前端"] },
});
assert.equal(worker.json.member.kind, "worker");
assert.equal(worker.json.member.leadId, seededLeadId);

// 4. a second lead is refused while the first one is in place
const clash = await call(service, "/member.create", { method: "POST", body: { name: "玄策", kind: "lead" } });
assert.equal(clash.status, 409);

// 5. dispatch claims the task and moves it out of the backlog
const created = await call(service, "/task.create", {
  method: "POST",
  body: { title: "补齐成员模块", goal: "队长带工人", acceptanceCriteria: "队长能派单也能验收" },
});
const taskId = created.json.task.id;
const dispatched = await call(service, "/member.dispatch", {
  method: "POST",
  body: { taskId, memberId: worker.json.member.id },
});
assert.equal(dispatched.status, 200);
assert.equal(dispatched.json.task.status, "in_progress");
assert.equal(dispatched.json.member.status, "working");

// 6. the worker reports; the task waits for the lead instead of going done
const reported = await call(service, "/member.report", {
  method: "POST",
  body: {
    taskId,
    memberId: worker.json.member.id,
    note: "接口与界面都加好了",
    subtasks: [{ text: "服务端", done: true }, { text: "客户端", done: true }],
  },
});
assert.equal(reported.json.task.reviewStatus, "pending");
assert.equal(reported.json.task.status, "in_progress");
assert.equal(reported.json.task.progress, 100);

// 7. the team aggregate carries the review queue
const team = await call(service, "/team");
assert.equal(team.json.team.lead.id, seededLeadId);
assert.equal(team.json.team.lead.workerCount, 2);
assert.equal(team.json.team.pendingReviews.length, 1);
assert.equal(team.json.team.pendingReviews[0].assigneeName, "青岚");
const qinglan = team.json.team.workers.find((w) => w.name === "青岚");
assert.equal(qinglan.awaitingReview, 1);

// 8. the lead accepts: done, subtasks settled, and the trail records who signed
const accepted = await call(service, "/member.review", {
  method: "POST",
  body: { taskId, decision: "accepted", note: "跑了测试，证据齐全" },
});
assert.equal(accepted.status, 200);
assert.equal(accepted.json.task.status, "done");
assert.equal(accepted.json.task.reviewStatus, "accepted");
assert.ok(accepted.json.task.history.some((entry) => entry.kind === "review" && entry.note.includes("验收通过")));

// 9. the verdict is persisted with the team shape, not just in memory
const state = await call(service, "/state");
assert.equal(state.json.team.pendingReviews.length, 0);
const file = path.join(process.env.DSH_HOME, "storages", "iicp-kanban", "state.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const stored = raw.members.find((member) => member.name === "青岚");
assert.equal(stored.kind, "worker");
assert.equal(stored.leadId, seededLeadId);
assert.equal(raw.members.find((member) => member.name === "队长").kind, "lead");
assert.equal(raw.members.find((member) => member.name === "墨渊").kind, "worker");
assert.equal(raw.tasks[0].reviewStatus, "accepted");

service.stop();
fs.rmSync(process.env.DSH_HOME, { recursive: true, force: true });
console.log("SMOKE-TEAM-PASS");
