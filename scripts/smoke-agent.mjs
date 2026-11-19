/**
 * End-to-end smoke for the agent team (v0.5).
 *
 * Boots the service with a fake `agents` service, seeds a lead + worker,
 * creates a task, dispatches it (session + brief), reports done through the
 * worker's own tool, then accepts the review as the lead.
 *
 * Run: node scripts/smoke-agent.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { createKanbanService } from "../server/service.mjs";

function createFakeAgents() {
  const state = { createCalls: [], delivered: [], disposed: [], tools: new Map(), presets: [], prompts: [] };
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
  return {
    state,
    ctx: {
      logger: { info() {}, warn() {} },
      agents: {
        async create(options) {
          state.createCalls.push(options);
          return handleFor(options.sessionId, options);
        },
        async resume(options) {
          return handleFor(options.resumeSessionId, options);
        },
      },
    },
  };
}

function makeReq(method, body) {
  const req = new PassThrough();
  req.method = method;
  req.url = "/";
  req.end(body === undefined ? undefined : JSON.stringify(body));
  return req;
}

function makeRes() {
  const res = new PassThrough();
  res.statusCode = 200;
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.finished = new Promise((resolve) => res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))));
  res.writeHead = (status) => {
    res.statusCode = status;
    return res;
  };
  return res;
}

async function call(service, route, { method = "GET", body } = {}) {
  const req = makeReq(method, body);
  const res = makeRes();
  const url = new URL(`http://localhost${route}`);
  await service.handle(req, res, { route: url.pathname, url, method });
  const text = await res.finished;
  return { status: res.statusCode, json: text ? JSON.parse(text) : {} };
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), "iicp-kanban-smoke-agent-"));
process.env.DSH_HOME = home;
const fake = createFakeAgents();
const service = createKanbanService({ ctx: fake.ctx });
service.start();

try {
  const team = await call(service, "/team");
  const leadId = team.json.team.lead.id;
  const worker = await call(service, "/member.create", { method: "POST", body: { name: "青岚", title: "执行", leadId } });
  const workerId = worker.json.member.id;
  const created = await call(service, "/task.create", { method: "POST", body: { title: "实现登录", assigneeId: "" } });
  const taskId = created.json.task.id;

  const dispatched = await call(service, "/member.dispatch", { method: "POST", body: { taskId, memberId: workerId } });
  if (dispatched.status !== 200) throw new Error(`dispatch failed: ${JSON.stringify(dispatched.json)}`);
  const task = service.store.state.tasks.find((entry) => entry.id === taskId);
  if (task.status !== "in_progress" || task.agentState !== "running") throw new Error("dispatch did not start the task");
  const sessionId = task.agentSessionId;
  if (!sessionId) throw new Error("no agent session recorded");
  const tools = fake.state.tools.get(sessionId) || [];
  const report = tools.find((entry) => entry.name === "report");
  if (!report) throw new Error("worker session has no report tool");
  if (fake.state.presets.find((entry) => entry.sessionId === sessionId)?.preset !== "workspace-write") {
    throw new Error("workspace-write preset not pinned");
  }
  if (!fake.state.delivered.find((entry) => entry.sessionId === sessionId && entry.text.includes("实现登录"))) {
    throw new Error("task brief not delivered");
  }

  const reported = await report.execute({ taskId, status: "done", note: "登录已完成，已自测" });
  if (!reported?.ok) throw new Error("report tool failed");
  if (task.reviewStatus !== "pending") throw new Error("done did not enter review queue");

  const reviewed = await call(service, "/member.review", { method: "POST", body: { taskId, decision: "accepted", note: "通过", reviewerId: leadId } });
  if (reviewed.status !== 200) throw new Error(`review failed: ${JSON.stringify(reviewed.json)}`);
  if (task.status !== "done" || task.reviewStatus !== "accepted") throw new Error("review did not complete the task");

  console.log("AGENT-SMOKE-PASS");
} finally {
  service.stop();
  process.env.DSH_HOME = undefined;
  fs.rmSync(home, { recursive: true, force: true });
}
