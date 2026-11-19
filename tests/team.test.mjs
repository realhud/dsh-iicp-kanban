/**
 * Tests: v0.3 team model — one lead agent leading many worker agents.
 *
 * Every case runs against its own DSH_HOME so team state never leaks between
 * tests (service.mjs reads DSH_HOME when the service is constructed).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createKanbanService } from "../server/service.mjs";

function fakeCtx() {
  return { logger: { info() {}, warn() {} } };
}

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
  const text = await res.finished;
  return { status: res.statusCode, json: text ? JSON.parse(text) : {} };
}

/** Run `fn(service, home)` against a throwaway DSH home. */
async function withService(fn, { seed, ctx } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "iicp-kanban-team-"));
  if (seed) {
    fs.mkdirSync(path.join(home, "storages", "iicp-kanban"), { recursive: true });
    fs.writeFileSync(path.join(home, "storages", "iicp-kanban", "state.json"), JSON.stringify(seed), "utf8");
  }
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const service = createKanbanService({ ctx: ctx || fakeCtx() });
    service.start();
    return await fn(service, home);
  } finally {
    process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

/** Create a worker under the seeded default lead and return their ids. */
async function seedTeam(service, { workerName = "青岚" } = {}) {
  const team = await call(service, "/team");
  assert.ok(team.json.team.lead, "seeded default lead must exist");
  const leadId = team.json.team.lead.id;
  const worker = await call(service, "/member.create", {
    method: "POST",
    body: { name: workerName, title: "执行", leadId, skills: ["前端", "前端"] },
  });
  assert.equal(worker.status, 200);
  return { leadId, workerId: worker.json.member.id };
}

test("an empty roster is seeded with a default lead on start", async () => {
  await withService(async (service) => {
    const team = await call(service, "/team");
    assert.ok(team.json.team.lead, "a default lead must be seeded");
    assert.equal(team.json.team.lead.name, "队长");
    assert.equal(team.json.team.lead.kind, "lead");

    const state = await call(service, "/state");
    const stored = state.json.members.find((m) => m.name === "队长");
    assert.equal(stored.kind, "lead");
    assert.equal(stored.role, "owner");
    assert.equal(stored.leadId, "");
  });
});

test("new members become workers under the seeded lead", async () => {
  await withService(async (service) => {
    const lead = await call(service, "/team");
    const leadId = lead.json.team.lead.id;

    const first = await call(service, "/member.create", { method: "POST", body: { name: "墨渊" } });
    assert.equal(first.json.member.kind, "worker");
    assert.equal(first.json.member.leadId, leadId);

    const second = await call(service, "/member.create", { method: "POST", body: { name: "青岚" } });
    assert.equal(second.json.member.kind, "worker");
    assert.equal(second.json.member.leadId, leadId);
    assert.equal(second.json.member.status, "idle");
  });
});

test("a second lead is rejected while the team already has one", async () => {
  await withService(async (service) => {
    await call(service, "/member.create", { method: "POST", body: { name: "墨渊" } });
    const second = await call(service, "/member.create", { method: "POST", body: { name: "玄策", kind: "lead" } });
    assert.equal(second.status, 409);
  });
});

test("invalid kind and unknown leadId are rejected", async () => {
  await withService(async (service) => {
    const badKind = await call(service, "/member.create", { method: "POST", body: { name: "甲", kind: "boss" } });
    assert.equal(badKind.status, 400);

    // The seeded lead exists, so an explicit lead request is a conflict and
    // an unknown leadId is invalid.
    const existing = await call(service, "/member.create", { method: "POST", body: { name: "墨渊", kind: "lead" } });
    assert.equal(existing.status, 409);

    const badLead = await call(service, "/member.create", { method: "POST", body: { name: "乙", leadId: "m_missing" } });
    assert.equal(badLead.status, 400);
    assert.match(badLead.json.message, /lead not found/);
  });
});

test("skills are clipped, deduped and capped; personality survives a roundtrip", async () => {
  await withService(async (service) => {
    const many = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
    const created = await call(service, "/member.create", {
      method: "POST",
      body: { name: "白砚", skills: [" QA ", "QA", ...many], personality: "较真，只看证据", provider: "deepseek", model: "v4" },
    });
    const member = created.json.member;
    assert.equal(member.skills.length, 8);
    assert.deepEqual(member.skills.slice(0, 2), ["QA", "一"]);
    assert.equal(member.personality, "较真，只看证据");
    assert.equal(member.provider, "deepseek");
    assert.equal(member.model, "v4");

    const state = await call(service, "/state");
    const stored = state.json.members.find((m) => m.id === member.id);
    assert.equal(stored.personality, "较真，只看证据");
    assert.equal(stored.skills.length, 8);
  });
});

test("dispatching a task claims it for the worker and starts it", async () => {
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const task = await call(service, "/task.create", { method: "POST", body: { title: "补齐成员模块", goal: "队长带工人" } });
    const taskId = task.json.task.id;

    const dispatched = await call(service, "/member.dispatch", {
      method: "POST",
      body: { taskId, memberId: workerId },
    });
    assert.equal(dispatched.status, 200);
    assert.equal(dispatched.json.task.assigneeId, workerId);
    assert.equal(dispatched.json.task.status, "in_progress");
    assert.equal(dispatched.json.member.status, "working");
    assert.ok(dispatched.json.task.history.some((entry) => entry.kind === "assignee" && entry.note.startsWith("派单")));
  });
});

test("a worker report waits for the lead and never self-accepts", async () => {
  await withService(async (service) => {
    const { leadId, workerId } = await seedTeam(service);
    const task = await call(service, "/task.create", { method: "POST", body: { title: "写文档" } });
    const taskId = task.json.task.id;
    await call(service, "/member.dispatch", { method: "POST", body: { taskId, memberId: workerId } });

    const reported = await call(service, "/member.report", {
      method: "POST",
      body: { taskId, memberId: workerId, note: "六件套已更新", subtasks: [{ text: "写", done: true }] },
    });
    assert.equal(reported.status, 200);
    assert.equal(reported.json.task.reviewStatus, "pending");
    assert.equal(reported.json.task.status, "in_progress");

    // Reporting twice without a verdict is a conflict.
    const twice = await call(service, "/member.report", { method: "POST", body: { taskId, memberId: workerId } });
    assert.equal(twice.status, 409);

    const accepted = await call(service, "/member.review", {
      method: "POST",
      body: { taskId, leadId, decision: "accepted", note: "证据齐全" },
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.json.task.status, "done");
    assert.equal(accepted.json.task.reviewStatus, "accepted");
    assert.equal(accepted.json.task.reviewNote, "证据齐全");
    assert.ok(accepted.json.task.history.some((entry) => entry.kind === "review" && entry.note.includes("验收通过")));
  });
});

test("a rejected submission goes back to in_progress with the lead's note", async () => {
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const task = await call(service, "/task.create", { method: "POST", body: { title: "改样式" } });
    const taskId = task.json.task.id;
    await call(service, "/member.dispatch", { method: "POST", body: { taskId, memberId: workerId } });
    await call(service, "/member.report", { method: "POST", body: { taskId, memberId: workerId } });

    const changes = await call(service, "/member.review", {
      method: "POST",
      body: { taskId, decision: "changes", note: "对照度不够" },
    });
    assert.equal(changes.status, 200);
    assert.equal(changes.json.task.status, "in_progress");
    assert.equal(changes.json.task.reviewStatus, "changes");
    assert.equal(changes.json.task.reviewNote, "对照度不够");
  });
});

test("review validates decision, existence and pending state", async () => {
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const task = await call(service, "/task.create", { method: "POST", body: { title: "x" } });
    const taskId = task.json.task.id;

    const noDecision = await call(service, "/member.review", { method: "POST", body: { taskId } });
    assert.equal(noDecision.status, 400);

    const missing = await call(service, "/member.review", {
      method: "POST",
      body: { taskId: "t_missing", decision: "accepted" },
    });
    assert.equal(missing.status, 404);

    // Nothing submitted yet: no pending review to settle.
    const notPending = await call(service, "/member.review", {
      method: "POST",
      body: { taskId, decision: "accepted" },
    });
    assert.equal(notPending.status, 409);

    // Once submitted, a worker still cannot act as the reviewer.
    await call(service, "/member.dispatch", { method: "POST", body: { taskId, memberId: workerId } });
    await call(service, "/member.report", { method: "POST", body: { taskId, memberId: workerId } });
    const workerReview = await call(service, "/member.review", {
      method: "POST",
      body: { taskId, leadId: workerId, decision: "accepted" },
    });
    assert.equal(workerReview.status, 400);
    assert.match(workerReview.json.message, /is not a lead/);
  });
});

test("a worker cannot report on someone else's task", async () => {
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const other = await call(service, "/member.create", { method: "POST", body: { name: "玄策" } });
    const task = await call(service, "/task.create", {
      method: "POST",
      body: { title: "编码", assigneeId: other.json.member.id },
    });
    const stolen = await call(service, "/member.report", {
      method: "POST",
      body: { taskId: task.json.task.id, memberId: workerId },
    });
    assert.equal(stolen.status, 400);
  });
});

test("dragging a worker task to done counts as the owner's acceptance", async () => {
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const task = await call(service, "/task.create", {
      method: "POST",
      body: { title: "上线", assigneeId: workerId },
    });
    const moved = await call(service, "/task.move", { method: "POST", body: { id: task.json.task.id, status: "done" } });
    assert.equal(moved.status, 200);
    assert.equal(moved.json.task.reviewStatus, "accepted");
    assert.equal(moved.json.task.progress, 100);
  });
});

test("worker status is derived from the live task column", async () => {
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const task = await call(service, "/task.create", { method: "POST", body: { title: "推进", assigneeId: workerId } });

    let state = await call(service, "/state");
    assert.equal(state.json.members.find((m) => m.id === workerId).status, "working");

    await call(service, "/task.move", { method: "POST", body: { id: task.json.task.id, status: "blocked" } });
    state = await call(service, "/state");
    assert.equal(state.json.members.find((m) => m.id === workerId).status, "blocked");

    await call(service, "/task.move", { method: "POST", body: { id: task.json.task.id, status: "done" } });
    state = await call(service, "/state");
    assert.equal(state.json.members.find((m) => m.id === workerId).status, "idle");
  });
});

test("the lead cannot step down: kind stays lead", async () => {
  await withService(async (service) => {
    const { leadId, workerId } = await seedTeam(service);

    const demoted = await call(service, "/member.update", { method: "POST", body: { id: leadId, kind: "worker" } });
    assert.equal(demoted.status, 400);
    assert.match(demoted.json.message, /队长不可被卸任/);

    // The lead keeps its role and its workers stay attached.
    const team = await call(service, "/team");
    assert.equal(team.json.team.lead.id, leadId);
    assert.equal(team.json.team.orphanWorkers, 0);
    assert.equal(team.json.team.workers.find((w) => w.id === workerId).leadId, leadId);

    // Promoting a second lead while one exists is still a conflict.
    const promoted = await call(service, "/member.update", { method: "POST", body: { id: workerId, kind: "lead" } });
    assert.equal(promoted.status, 409);
    assert.match(promoted.json.message, /团队已经有队长/);
  });
});

test("the lead's profile fields stay editable", async () => {
  await withService(async (service) => {
    const { leadId } = await seedTeam(service);
    const updated = await call(service, "/member.update", {
      method: "POST",
      body: { id: leadId, name: "墨渊", title: "主理人", personality: "沉稳" },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.member.kind, "lead");
    assert.equal(updated.json.member.name, "墨渊");
  });
});

test("a lead cannot be attached to another lead", async () => {
  await withService(async (service) => {
    const { leadId } = await seedTeam(service);
    const result = await call(service, "/member.update", { method: "POST", body: { id: leadId, leadId: "m_x" } });
    assert.equal(result.status, 400);
  });
});

test("/team reports lead, workers, pending reviews and queue pressure", async () => {
  await withService(async (service) => {
    const { leadId, workerId } = await seedTeam(service);
    const task = await call(service, "/task.create", { method: "POST", body: { title: "联调" } });
    const taskId = task.json.task.id;
    await call(service, "/task.create", { method: "POST", body: { title: "未指派任务" } });
    await call(service, "/member.dispatch", { method: "POST", body: { taskId, memberId: workerId } });
    await call(service, "/member.report", { method: "POST", body: { taskId, memberId: workerId, note: "好了" } });

    const team = await call(service, "/team");
    const payload = team.json.team;
    assert.equal(payload.lead.id, leadId);
    assert.equal(payload.lead.workerCount, 1);
    assert.equal(payload.workers.length, 1);
    assert.equal(payload.workers[0].awaitingReview, 1);
    assert.equal(payload.pendingReviews.length, 1);
    assert.equal(payload.pendingReviews[0].taskId, taskId);
    assert.equal(payload.pendingReviews[0].assigneeName, "青岚");
    assert.equal(payload.unassigned, 1);

    // The same aggregate rides along with /state for the client.
    const state = await call(service, "/state");
    assert.equal(state.json.team.lead.id, leadId);
    assert.equal(state.json.team.pendingReviews.length, 1);
  });
});

test("removing the lead is rejected; workers and tasks stay intact", async () => {
  await withService(async (service) => {
    const { leadId, workerId } = await seedTeam(service);
    const task = await call(service, "/task.create", { method: "POST", body: { title: "别丢", assigneeId: workerId } });

    const deleted = await call(service, "/member.delete", { method: "POST", body: { id: leadId } });
    assert.equal(deleted.status, 400);
    assert.match(deleted.json.message, /队长不可被删除/);

    const team = await call(service, "/team");
    assert.equal(team.json.team.lead.id, leadId);
    assert.equal(team.json.team.workers.length, 1);
    assert.equal(team.json.team.workers[0].leadId, leadId);
    assert.equal(team.json.team.unassigned, 0);

    const state = await call(service, "/state");
    assert.equal(state.json.tasks.find((t) => t.id === task.json.task.id).assigneeId, workerId);
  });
});

test("member workload exposes kind, status and the review queue", async () => {
  await withService(async (service) => {
    const { leadId, workerId } = await seedTeam(service);
    const task = await call(service, "/task.create", { method: "POST", body: { title: "统计", assigneeId: workerId } });
    await call(service, "/member.report", {
      method: "POST",
      body: { taskId: task.json.task.id, memberId: workerId },
    });

    const workload = await call(service, "/member.workload");
    const lead = workload.json.workload.find((row) => row.memberId === leadId);
    const worker = workload.json.workload.find((row) => row.memberId === workerId);
    assert.equal(lead.kind, "lead");
    assert.equal(worker.kind, "worker");
    assert.equal(worker.reviewing, 1);
    assert.equal(workload.json.workload.at(-1).name, "未指派");
  });
});

test("pre-0.3 member data gains a promoted lead on start", async () => {
  await withService(
    async (service) => {
      const team = await call(service, "/team");
      assert.ok(team.json.team.lead, "a lead must be promoted");
      assert.equal(team.json.team.lead.name, "老队长");
      assert.equal(team.json.team.lead.kind, "lead");
      assert.equal(team.json.team.orphanWorkers, 0);
      assert.equal(team.json.team.workers[0].leadId, team.json.team.lead.id);

      const state = await call(service, "/state");
      const stored = state.json.members.find((m) => m.name === "老队长");
      assert.equal(stored.kind, "lead");
    },
    {
      seed: {
        version: 1,
        members: [
          { id: "m_old00001", name: "老队长", role: "owner", createdAt: "2025-01-01T00:00:00.000Z" },
          { id: "m_old00002", name: "老成员", role: "member", createdAt: "2025-02-01T00:00:00.000Z" },
        ],
        tasks: [],
        projects: [],
        workspaces: [],
        settings: {},
        counters: {},
      },
    },
  );
});

test("legacy tasks default to reviewStatus none", async () => {
  await withService(
    async (service) => {
      const state = await call(service, "/state");
      const task = state.json.tasks[0];
      assert.equal(task.reviewStatus, "none");
      assert.equal(task.reviewNote, "");
    },
    {
      seed: {
        version: 1,
        members: [],
        tasks: [{ id: "t_legacy01", title: "旧任务", status: "backlog" }],
        projects: [],
        workspaces: [],
        settings: {},
        counters: {},
      },
    },
  );
});
