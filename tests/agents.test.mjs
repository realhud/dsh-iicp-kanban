/**
 * Tests: v0.5 agent team — sessions, role tools, dispatch queue, wake-ups.
 *
 * A fake `agents` service records create/resume calls, tool registrations,
 * permission pins and followup deliveries, so the orchestration can be tested
 * without a live DSH runtime.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createKanbanService } from "../server/service.mjs";

function createFakeAgents({ resumeError = "", createError = "" } = {}) {
  const state = {
    createCalls: [],
    resumeCalls: [],
    delivered: [],
    disposed: [],
    tools: new Map(),
    presets: [],
    prompts: [],
  };
  function handleFor(sessionId, options) {
    const session = { id: sessionId, log: [] };
    const agent = {
      session,
      followup: async (message) => {
        const text = Array.isArray(message?.content)
          ? message.content.map((block) => (block?.type === "text" ? block.text : "")).join("")
          : String(message ?? "");
        state.delivered.push({ sessionId, text });
      },
    };
    const handle = { agent, dispose: async () => state.disposed.push(sessionId) };
    const agentCtx = {
      tools: {
        register(tool) {
          state.tools.set(sessionId, [...(state.tools.get(sessionId) || []), tool]);
          return () => {};
        },
      },
      systemPrompt: { section: (section) => state.prompts.push({ sessionId, ...section }) },
      get(name) {
        if (name !== "permissionPresets") return undefined;
        return { set: (_session, preset) => state.presets.push({ sessionId, preset }) };
      },
    };
    options.setup?.(agentCtx, agent);
    return handle;
  }
  const agents = {
    async create(options) {
      if (createError) throw new Error(createError);
      state.createCalls.push(options);
      return handleFor(options.sessionId, options);
    },
    async resume(options) {
      if (resumeError) throw new Error(resumeError);
      state.resumeCalls.push(options);
      return handleFor(options.resumeSessionId, options);
    },
  };
  return { ctx: { logger: { info() {}, warn() {} }, agents }, state };
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

async function withService(fn, { ctx } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "iicp-kanban-agents-"));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  let service;
  try {
    service = createKanbanService({ ctx: ctx || { logger: { info() {}, warn() {} } } });
    service.start();
    return await fn(service, home);
  } finally {
    service?.stop();
    process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

async function seedTeam(service) {
  const team = await call(service, "/team");
  const leadId = team.json.team.lead.id;
  const created = await call(service, "/member.create", {
    method: "POST",
    body: { name: "青岚", title: "执行", leadId },
  });
  return { leadId, workerId: created.json.member.id };
}

async function createTask(service, body = {}) {
  const res = await call(service, "/task.create", {
    method: "POST",
    body: { title: "实现登录", projectId: "", ...body },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.task;
}

function taskOf(service, id) {
  return service.store.state.tasks.find((task) => task.id === id);
}

function toolNames(state, sessionId) {
  return (state.tools.get(sessionId) || []).map((tool) => tool.name).sort();
}

test("dispatch starts a worker session with role tools, permissions and a brief", async () => {
  const fake = createFakeAgents();
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const task = await createTask(service);
    const res = await call(service, "/member.dispatch", {
      method: "POST",
      body: { taskId: task.id, memberId: workerId },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.agent.available, true);
    assert.equal(res.json.agent.state, "running");
    assert.equal(fake.state.createCalls.length, 1);
    const created = fake.state.createCalls[0];
    assert.equal(created.meta.cwd, process.cwd());
    assert.equal(created.meta.parentSession, undefined);
    assert.deepEqual(fake.state.presets[0], { sessionId: taskOf(service, task.id).agentSessionId, preset: "workspace-write" });
    assert.deepEqual(toolNames(fake.state, created.sessionId), ["artifact_add", "report", "task_get"]);
    assert.equal(fake.state.delivered.length, 1);
    assert.match(fake.state.delivered[0].text, new RegExp(task.id));
    assert.match(fake.state.delivered[0].text, /实现登录/);
    const stored = taskOf(service, task.id);
    assert.equal(stored.agentState, "running");
    assert.equal(stored.agentSessionId, created.sessionId);

    const lead = await call(service, "/agent/lead", { method: "POST", body: {} });
    assert.equal(lead.status, 200);
    assert.equal(lead.json.available, true);
    assert.deepEqual(toolNames(fake.state, lead.json.sessionId), [
      "board_read",
      "dispatch",
      "member_list",
      "review",
      "task_create",
      "task_update",
    ]);
  }, { ctx: fake.ctx });
});

test("resume reuses the mapped session and create rebuilds after a resume failure", async () => {
  const fake = createFakeAgents();
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const worker = service.store.state.members.find((member) => member.id === workerId);
    worker.sessions = { "": "s_old" };
    service.store.save();
    const task = await createTask(service);
    const res = await call(service, "/member.dispatch", {
      method: "POST",
      body: { taskId: task.id, memberId: workerId },
    });
    assert.equal(res.status, 200);
    assert.equal(fake.state.resumeCalls.length, 1);
    assert.equal(fake.state.createCalls.length, 0);
    assert.equal(fake.state.delivered[0].sessionId, "s_old");
  }, { ctx: fake.ctx });

  const broken = createFakeAgents({ resumeError: "archived session" });
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const worker = service.store.state.members.find((member) => member.id === workerId);
    worker.sessions = { "": "s_gone" };
    service.store.save();
    const task = await createTask(service);
    const res = await call(service, "/member.dispatch", {
      method: "POST",
      body: { taskId: task.id, memberId: workerId },
    });
    assert.equal(res.status, 200);
    assert.equal(broken.state.createCalls.length, 1);
    const stored = taskOf(service, task.id);
    assert.equal(stored.agentState, "running");
    assert.ok(stored.history.some((entry) => entry.note.includes("会话已重建")));
  }, { ctx: broken.ctx });
});

test("dispatch degrades to manual when agents are unavailable", async () => {
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const task = await createTask(service);
    const res = await call(service, "/member.dispatch", {
      method: "POST",
      body: { taskId: task.id, memberId: workerId },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.agent.available, false);
    assert.equal(res.json.agent.state, "queued");
    const stored = taskOf(service, task.id);
    assert.equal(stored.assigneeId, workerId);
    assert.equal(stored.agentState, "queued");
    const worker = service.store.state.members.find((member) => member.id === workerId);
    assert.equal(worker.agentState, "unavailable");
  });
});

test("same workspace runs one task at a time and the queue advances on report", async () => {
  const fake = createFakeAgents();
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const first = await createTask(service, { title: "任务一" });
    const second = await createTask(service, { title: "任务二" });
    await call(service, "/member.dispatch", { method: "POST", body: { taskId: first.id, memberId: workerId } });
    await call(service, "/member.dispatch", { method: "POST", body: { taskId: second.id, memberId: workerId } });
    assert.equal(taskOf(service, first.id).agentState, "running");
    assert.equal(taskOf(service, second.id).agentState, "queued");
    assert.equal(fake.state.delivered.length, 1);

    const report = await call(service, "/member.report", {
      method: "POST",
      body: { taskId: first.id, memberId: workerId, status: "done", note: "完成" },
    });
    assert.equal(report.status, 200);
    assert.equal(taskOf(service, second.id).agentState, "running");
    assert.equal(fake.state.delivered.length, 2);
    assert.match(fake.state.delivered[1].text, /任务二/);
    assert.equal(taskOf(service, first.id).agentState, "");
  }, { ctx: fake.ctx });
});

test("a second member queues behind the running task in the same workspace", async () => {
  const fake = createFakeAgents();
  await withService(async (service) => {
    const team = await call(service, "/team");
    const leadId = team.json.team.lead.id;
    const one = await call(service, "/member.create", { method: "POST", body: { name: "甲", leadId } });
    const two = await call(service, "/member.create", { method: "POST", body: { name: "乙", leadId } });
    const first = await createTask(service, { title: "同一工作区一" });
    const second = await createTask(service, { title: "同一工作区二" });
    await call(service, "/member.dispatch", { method: "POST", body: { taskId: first.id, memberId: one.json.member.id } });
    await call(service, "/member.dispatch", { method: "POST", body: { taskId: second.id, memberId: two.json.member.id } });
    assert.equal(taskOf(service, second.id).agentState, "queued");

    await call(service, "/member.report", {
      method: "POST",
      body: { taskId: first.id, memberId: one.json.member.id, status: "done", note: "完成" },
    });
    assert.equal(taskOf(service, second.id).agentState, "running");
  }, { ctx: fake.ctx });
});

test("done wakes the lead once per member within the window", async () => {
  const fake = createFakeAgents();
  await withService(async (service) => {
    const { leadId, workerId } = await seedTeam(service);
    const lead = await call(service, "/agent/lead", { method: "POST", body: {} });
    assert.equal(lead.status, 200);
    const task = await createTask(service);
    await call(service, "/member.dispatch", { method: "POST", body: { taskId: task.id, memberId: workerId } });
    await call(service, "/member.report", {
      method: "POST",
      body: { taskId: task.id, memberId: workerId, status: "done", note: "做完了" },
    });
    const before = fake.state.delivered.length;
    await service.agentTick(Date.now() + 31_000);
    const leadMessages = fake.state.delivered.slice(before).filter((entry) => entry.sessionId === lead.json.sessionId);
    assert.equal(leadMessages.length, 1);
    assert.match(leadMessages[0].text, /【事件】/);
    assert.match(leadMessages[0].text, /做完了|提交验收/);
    const leadMember = service.store.state.members.find((member) => member.id === leadId);
    assert.ok(leadMember);
  }, { ctx: fake.ctx });
});

test("watchdog blocks a running task past the timeout", async () => {
  const fake = createFakeAgents();
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const task = await createTask(service);
    await call(service, "/member.dispatch", { method: "POST", body: { taskId: task.id, memberId: workerId } });
    const stored = taskOf(service, task.id);
    stored.updatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    service.store.save();
    await service.agentTick(Date.now());
    const after = taskOf(service, task.id);
    assert.equal(after.status, "blocked");
    assert.equal(after.agentState, "");
    assert.ok(after.history.some((entry) => entry.note.includes("执行超时")));
  }, { ctx: fake.ctx });
});

test("review changes requeues the task with the feedback in the brief", async () => {
  const fake = createFakeAgents();
  await withService(async (service) => {
    const { workerId } = await seedTeam(service);
    const task = await createTask(service);
    await call(service, "/member.dispatch", { method: "POST", body: { taskId: task.id, memberId: workerId } });
    await call(service, "/member.report", {
      method: "POST",
      body: { taskId: task.id, memberId: workerId, status: "done", note: "第一版" },
    });
    const review = await call(service, "/member.review", {
      method: "POST",
      body: { taskId: task.id, decision: "changes", note: "补测试" },
    });
    assert.equal(review.status, 200);
    const stored = taskOf(service, task.id);
    assert.equal(stored.status, "in_progress");
    assert.equal(stored.reviewStatus, "changes");
    assert.ok(fake.state.delivered.at(-1).text.includes("打回意见：补测试"));
  }, { ctx: fake.ctx });
});

test("worker tools reject tasks assigned to someone else", async () => {
  const fake = createFakeAgents();
  await withService(async (service) => {
    const team = await call(service, "/team");
    const leadId = team.json.team.lead.id;
    const one = await call(service, "/member.create", { method: "POST", body: { name: "甲", leadId } });
    const two = await call(service, "/member.create", { method: "POST", body: { name: "乙", leadId } });
    const first = await createTask(service, { title: "甲的活" });
    const second = await createTask(service, { title: "乙的活" });
    await call(service, "/member.dispatch", { method: "POST", body: { taskId: first.id, memberId: one.json.member.id } });
    await call(service, "/member.dispatch", { method: "POST", body: { taskId: second.id, memberId: two.json.member.id } });
    const sessionId = taskOf(service, first.id).agentSessionId;
    const taskGet = fake.state.tools.get(sessionId).find((tool) => tool.name === "task_get");
    await assert.rejects(async () => taskGet.execute({ taskId: second.id }), /只能操作指派给自己的任务/);
  }, { ctx: fake.ctx });
});

test("lead task_create is atomic and validates every card first", async () => {
  const fake = createFakeAgents();
  await withService(async (service) => {
    await seedTeam(service);
    const lead = await call(service, "/agent/lead", { method: "POST", body: {} });
    const create = fake.state.tools.get(lead.json.sessionId).find((tool) => tool.name === "task_create");
    const before = service.store.state.tasks.length;
    await assert.rejects(
      async () =>
        create.execute({
          tasks: [
            { title: "好卡", priority: "P1" },
            { title: "坏卡", priority: "P9" },
          ],
        }),
      /invalid priority/,
    );
    assert.equal(service.store.state.tasks.length, before);
    const ok = await create.execute({ tasks: [{ title: "好卡", priority: "P1" }] });
    assert.equal(ok.created.length, 1);
    assert.equal(service.store.state.tasks.length, before + 1);
    assert.equal(service.store.state.tasks.at(-1).origin, "session");
  }, { ctx: fake.ctx });
});
