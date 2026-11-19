/**
 * IICP Kanban — host service: teams, projects, tasks, workspaces.
 *
 * Orchestrates the whole host half:
 *   - workspace discovery (read-only, from DSH workspace.json)
 *   - team member CRUD + task assignment
 *   - project CRUD and task grouping
 *   - kanban task CRUD with status transitions + history
 *   - persistence via store.mjs
 *
 * Public surface (also the contract with index.mjs):
 *   createKanbanService({ ctx }) -> { handle(req,res,{route,url,method}), start(), stop() }
 */

import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

import {
  LOCKABLE_FIELDS,
  LIST_LIMITS,
  TEXT_LIMITS,
  clip,
  isMemberKind,
  isMemberRole,
  isMemberStatus,
  isPriority,
  isReviewStatus,
  isStatus,
  normalizeArtifact,
  normalizeDateOnly,
  normalizeDependsOn,
  normalizeGoal,
  normalizeSubtask,
} from "./domain.mjs";
import { badRequest, clipText, conflict, isStringArray, json, notFound, readJsonBody, validId } from "./http.mjs";
import { buildModelCatalog, resolveService } from "./model-catalog.mjs";
import { createSessionRegistry } from "./sessions.mjs";
import { createStore, newId, newTaskId } from "./store.mjs";
import { createWorkspaceSource } from "./workspaces.mjs";

export function createKanbanService({ ctx } = {}) {
  const logger = ctx?.logger;
  const dshHome = process.env.DSH_HOME || path.join(homedir(), ".dsh");
  const store = createStore({ dshHome, logger });
  const workspaceSource = createWorkspaceSource({ dshHome, logger });

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function now() {
    return new Date().toISOString();
  }

  function addHistory(task, kind, note, extra = {}) {
    task.history = task.history || [];
    task.history.push({ at: now(), kind, note: clip(note, TEXT_LIMITS.historyNote), ...extra });
    if (task.history.length > 20) task.history = task.history.slice(-20);
  }

  function findMember(state, id) {
    return state.members.find((member) => member.id === id && !member.archived) || null;
  }

  function findProject(state, id) {
    return state.projects.find((project) => project.id === id && !project.archived) || null;
  }

  function findTask(state, id) {
    return state.tasks.find((task) => task.id === id) || null;
  }

  /** Index tasks by id for readiness and cycle checks (rebuilt per operation). */
  function taskIndex(state) {
    return new Map(state.tasks.map((task) => [task.id, task]));
  }

  const STATUS_LABELS = { backlog: "待办", in_progress: "进行中", blocked: "受阻", done: "已完成" };

  /** A task is ready when every prerequisite is done; missing ids fail closed. */
  function isReady(task, byId) {
    if (!task || !Array.isArray(task.dependsOn) || task.dependsOn.length === 0) return true;
    return task.dependsOn.every((id) => byId.get(id)?.status === "done");
  }

  /** Prerequisites that are not done yet, in declaration order. */
  function unfinishedDeps(task, byId) {
    return (task.dependsOn || [])
      .map((id) => byId.get(id))
      .filter((dep) => dep && dep.status !== "done");
  }

  /** "A（进行中）、B（待办）" capped so one error message stays readable. */
  function describeDeps(deps) {
    const shown = deps.slice(0, 3).map((dep) => `${dep.title}（${STATUS_LABELS[dep.status] || dep.status}）`);
    const more = deps.length > shown.length ? ` 等 ${deps.length} 项` : "";
    return `${shown.join("、")}${more}`;
  }

  /**
   * Validate a candidate prerequisite list: ids must exist, a task cannot
   * depend on itself, and the graph must stay acyclic. Any new cycle must
   * pass through this task, so a DFS from its new edges that reaches it
   * again is exactly the cycle case.
   */
  function validateDependsOn(taskId, nextDeps, byId) {
    for (const id of nextDeps) {
      if (id === taskId) throw badRequest("任务不能依赖自己");
      if (!byId.has(id)) throw badRequest(`前置任务不存在：${id}`);
    }
    const seen = new Set();
    const stack = nextDeps.map((id) => ({ id, path: [taskId, id] }));
    while (stack.length > 0) {
      const { id, path } = stack.pop();
      if (id === taskId) {
        const names = path.map((step) => byId.get(step)?.title || step);
        throw conflict(`任务依赖成环：${names.join(" → ")}`);
      }
      const dep = byId.get(id);
      if (!dep || seen.has(id)) continue;
      seen.add(id);
      for (const next of dep.dependsOn || []) stack.push({ id: next, path: [...path, next] });
    }
  }

  /**
   * Block moving a task into in_progress while any prerequisite is unfinished.
   * Must run before any mutation: a throw after a field change would leave the
   * in-memory singleton dirty without a save.
   */
  function assertStartable(state, task, nextStatus, nextDeps) {
    if (nextStatus !== "in_progress") return;
    const deps = nextDeps !== undefined ? nextDeps : task.dependsOn || [];
    if (deps.length === 0) return;
    const byId = taskIndex(state);
    const pending = deps.map((id) => byId.get(id)).filter((dep) => dep && dep.status !== "done");
    if (pending.length > 0) throw conflict(`前置任务未完成：${describeDeps(pending)}`);
  }

  /* ------- v0.3 team model: one lead + many workers ------- */

  /** Live (non-archived) members, in creation order. */
  function liveMembers(state) {
    return state.members.filter((member) => !member.archived);
  }

  /** The single active team lead, or null. */
  function findLead(state) {
    return liveMembers(state).find((member) => member.kind === "lead") || null;
  }

  /** Workers of one lead (or lead-less workers when leadId is ""). */
  function workersOf(state, leadId) {
    return liveMembers(state).filter((member) => member.kind === "worker" && member.leadId === leadId);
  }

  /** Validate a leadId reference: "" is allowed (worker not yet attached). */
  function assertLeadId(state, leadId) {
    if (!leadId) return "";
    const lead = liveMembers(state).find((member) => member.id === leadId);
    if (!lead) throw badRequest(`lead not found: ${leadId}`);
    if (lead.kind !== "lead") throw badRequest(`member is not a lead: ${leadId}`);
    return leadId;
  }

  /** Skills list: strings, clipped, deduped, then capped (dedupe before cap so
   *  a repeated entry never costs a slot). */
  function normalizeSkills(value) {
    if (!Array.isArray(value)) return [];
    const skills = value
      .map((skill) => clipText(skill, TEXT_LIMITS.memberSkill))
      .filter(Boolean);
    return [...new Set(skills)].slice(0, LIST_LIMITS.skillsPerMember);
  }

  /**
   * Recompute a member's runtime status from their live tasks: a worker with
   * an in-flight task is working, a worker whose task is blocked is blocked,
   * everything else idles. Only workers auto-derive; the lead is manual.
   */
  function refreshMemberStatus(state, member, byId) {
    if (!member || member.kind !== "worker") return;
    const tasks = state.tasks.filter((task) => !task.archived && task.assigneeId === member.id);
    const index = byId || taskIndex(state);
    const next = tasks.some((task) => task.status === "blocked")
      ? "blocked"
      : tasks.some(
            (task) => task.status === "in_progress" || (task.status === "backlog" && isReady(task, index)),
          )
        ? "working"
        : "idle";
    if (member.status !== next) member.status = next;
  }

  /** Refresh every member (called after task mutations touch assignment). */
  function refreshTeam(state) {
    const byId = taskIndex(state);
    for (const member of liveMembers(state)) refreshMemberStatus(state, member, byId);
  }

  /** Attach every lead-less worker to the newly appointed lead. */
  function adoptOrphanWorkers(state, lead) {
    for (const member of workersOf(state, "")) member.leadId = lead.id;
  }

  /**
   * Heal the team shape after migration: a board that already has members but
   * no lead (pre-0.3 data) promotes its oldest worker so the team stays usable
   * instead of silently reporting "no lead".
   */
  function settleTeam(state) {
    let changed = false;
    const members = liveMembers(state);
    // Seed: a brand-new board starts with a default lead so the team always
    // has exactly one lead from the very first read (protect-team-lead).
    if (members.length === 0) {
      state.members.push({
        id: newId("m"),
        name: "队长",
        title: "",
        contact: "",
        role: "owner",
        kind: "lead",
        leadId: "",
        personality: "",
        skills: [],
        provider: "",
        model: "",
        status: "idle",
        sessionId: "",
        archived: false,
        createdAt: now(),
        updatedAt: now(),
      });
      changed = true;
      logger?.info?.(`[iicp-kanban] seeded default team lead "队长" (empty roster)`);
    } else if (!findLead(state)) {
      const oldest = members
        .filter((member) => member.kind === "worker")
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
      if (oldest) {
        oldest.kind = "lead";
        oldest.leadId = "";
        oldest.updatedAt = now();
        changed = true;
        adoptOrphanWorkers(state, oldest);
        logger?.info?.(`[iicp-kanban] promoted "${oldest.name}" to team lead (v0.3 migration)`);
      }
    }
    for (const member of liveMembers(state)) {
      const lead = member.kind === "worker" && member.leadId
        ? liveMembers(state).find((candidate) => candidate.id === member.leadId)
        : null;
      // A worker pointing at a deleted/demoted lead keeps running orphaned.
      if (member.kind === "worker" && member.leadId && (!lead || lead.kind !== "lead")) {
        member.leadId = "";
        changed = true;
      }
    }
    return changed;
  }

  function assertAssignee(state, assigneeId) {
    if (!assigneeId) return ""; // unassigned is valid
    if (!findMember(state, assigneeId)) throw badRequest(`assignee not found: ${assigneeId}`);
    return assigneeId;
  }

  function assertProject(state, projectId) {
    if (!projectId) return ""; // no project is valid
    if (!findProject(state, projectId)) throw badRequest(`project not found: ${projectId}`);
    return projectId;
  }

  /* ------- workspace binding (v2.7: validate against discovery) ------- */

  /** Ids of workspaces DSH currently knows about. */
  function knownWorkspaceIds(state) {
    return new Set(listWorkspaces(state).map((workspace) => workspace.id));
  }

  /**
   * Validate a client-supplied workspaceId against discovery.
   * Discovery failures degrade to [] — in that case we must NOT reject or
   * clear bindings, so an empty known set means "accept as-is".
   */
  function normalizeWorkspaceBinding(state, value) {
    if (typeof value !== "string" || !value) return "";
    const known = knownWorkspaceIds(state);
    if (known.size === 0) return value;
    if (!known.has(value)) throw badRequest(`unknown workspace: ${value}`);
    return value;
  }

  /** Keep at most one live project per workspace (v2.7 duplicateBinding). */
  function assertWorkspaceFree(state, workspaceId, exceptId = "") {
    if (!workspaceId) return;
    const other = state.projects.find(
      (project) => project.id !== exceptId && !project.archived && project.workspaceId === workspaceId,
    );
    if (other) throw conflict(`该工作区已指定其他项目（${other.name}），请先调整项目的工作区绑定`);
  }

  /**
   * Drop project.workspaceId values that no longer resolve to a real
   * workspace (v2.7 data migration). Historical bad data came from the old
   * workspace.json parser that treated top-level keys as workspaces.
   */
  function migrateWorkspaceBindings(state) {
    const known = knownWorkspaceIds(state);
    if (known.size === 0) return false; // discovery unavailable: never strip
    let changed = false;
    for (const project of state.projects) {
      if (project.workspaceId && !known.has(project.workspaceId)) {
        logger?.warn?.(`[iicp-kanban] dropping stale project.workspaceId "${project.workspaceId}" (${project.name})`);
        project.workspaceId = "";
        changed = true;
      }
    }
    return changed;
  }

  /* ------- v2 task model helpers (super-kanban agent semantics) ------- */

  /** progress follows subtask completion when subtasks exist (v2 contract). */
  function progressFromSubtasks(subtasks) {
    if (!Array.isArray(subtasks) || subtasks.length === 0) return null;
    const done = subtasks.filter((subtask) => subtask.done).length;
    return Math.round((done / subtasks.length) * 100);
  }

  /** goal.status must follow task.status (done → done, no text → none). */
  function syncGoalStatus(task) {
    if (!task.goal || typeof task.goal !== "object") return;
    const next = task.goal.text ? (task.status === "done" ? "done" : "active") : "none";
    if (task.goal.status !== next) task.goal = { ...task.goal, status: next };
  }

  /** Keep progress coherent: derived from subtasks, else manual/status value. */
  function syncProgress(task) {
    const derived = progressFromSubtasks(task.subtasks);
    if (derived !== null) {
      task.progress = derived;
      return;
    }
    if (task.status === "done") task.progress = 100;
    else if (task.status === "backlog" && !task.progress) task.progress = 0;
  }

  /**
   * The doer never accepts their own work, but the human owner outranks the
   * gate: dragging a worker's task straight to done counts as the owner's
   * acceptance, so the board never shows a done task stuck in review.
   */
  function settleReviewOnStatus(state, task) {
    const assignee = task.assigneeId ? state.members.find((member) => member.id === task.assigneeId) : null;
    if (task.status === "done" && assignee && assignee.kind === "worker") {
      if (task.reviewStatus !== "accepted") {
        task.reviewStatus = "accepted";
        task.reviewNote = "人工直接完成（视同验收）";
      }
      return;
    }
    if (task.status !== "done" && (task.reviewStatus === "accepted" || task.reviewStatus === "pending")) {
      task.reviewStatus = "none";
      task.reviewNote = "";
    }
  }

  /** Parse subtasks from the request body: strings or {text,done,source}. */
  function normalizeSubtaskList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .slice(0, 12)
      .map((item, index) => normalizeSubtask(item, index))
      .filter(Boolean);
  }

  /** Parse artifacts from the request body: strings (paths) or objects. */
  function normalizeArtifactList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .slice(0, 10)
      .map((item, index) => normalizeArtifact(item, index))
      .filter(Boolean);
  }

  /** Only lockable fields are accepted for lockedFields. */
  function normalizeLockedFields(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((field) => LOCKABLE_FIELDS.includes(field)))];
  }

  /* ------------------------------------------------------------------ */
  /* Agent sessions & orchestration (agent-team)                         */
  /* ------------------------------------------------------------------ */

  const AGENT_WAKE_WINDOW_MS = 30 * 1000;
  const AGENT_TIMEOUT_MS = 30 * 60 * 1000;
  /** memberId -> {texts: string[], at: number}; merged wake-ups for the lead. */
  const wakePending = new Map();
  let wakeTimer = null;
  let agentTimer = null;

  const sessionRegistry = createSessionRegistry({
    ctx,
    logger,
    store,
    hooks: {
      workspacePath: (workspaceId) => workspacePath(store.state, workspaceId),
      promptFor: (member) => rolePrompt(store.state, member),
      toolsFor: (member) => (member.kind === "lead" ? leadTools(member) : workerTools(member)),
      onSessionChanged: () => store.save(),
    },
  });

  /** Absolute cwd for a workspace; no id falls back to the first included one. */
  function workspacePath(state, workspaceId) {
    const list = listWorkspaces(state);
    if (!workspaceId) {
      const fallback = list.find((workspace) => workspace.included !== false && workspace.path);
      return fallback?.path || "";
    }
    return list.find((workspace) => workspace.id === workspaceId)?.path || "";
  }

  /** A task runs in its own workspace, else the bound project's workspace. */
  function workspaceOf(state, task) {
    if (!task) return "";
    if (task.workspaceId) return task.workspaceId;
    const project = task.projectId ? state.projects.find((entry) => entry.id === task.projectId) : null;
    return project?.workspaceId || "";
  }

  function runningInWorkspace(state, workspaceId, exceptTaskId = "") {
    return (
      state.tasks.find(
        (task) =>
          task.id !== exceptTaskId &&
          task.status === "in_progress" &&
          task.agentState === "running" &&
          workspaceOf(state, task) === workspaceId,
      ) || null
    );
  }

  function runningForMember(state, memberId, exceptTaskId = "") {
    return (
      state.tasks.find(
        (task) =>
          task.id !== exceptTaskId &&
          task.assigneeId === memberId &&
          task.status === "in_progress" &&
          task.agentState === "running",
      ) || null
    );
  }

  /** The dispatch brief: everything the worker needs to start without asking. */
  function taskBrief(state, task, member, workspaceId) {
    const project = task.projectId ? state.projects.find((entry) => entry.id === task.projectId) : null;
    const deps = (task.dependsOn || [])
      .map((id) => state.tasks.find((entry) => entry.id === id))
      .filter(Boolean)
      .map((dep) => `${dep.title}（${STATUS_LABELS[dep.status] || dep.status}）`);
    const cwd = workspacePath(state, workspaceId);
    return [
      `【派单】任务 ${task.id}｜${task.title}`,
      `负责人：${member.name}`,
      `目标：${task.goal?.text || "（未填写）"}`,
      `验收标准：${task.acceptanceCriteria || "（未填写）"}`,
      `优先级：${task.priority}`,
      `前置：${deps.length > 0 ? deps.join("、") : "无"}`,
      project ? `项目：${project.name}` : "",
      `工作区：${workspaceId || "默认"}${cwd ? `（${cwd}）` : ""}`,
      task.reviewStatus === "changes" && task.reviewNote ? `打回意见：${task.reviewNote}` : "",
      "要求：直接在 workspace 内完成工作；进展用 report(status=progress)，受阻用 report(status=blocked)，完成用 report(status=done) 并附验收说明；提交后停止，等待队长验收。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** Give one task its session, mark it running, and send the brief. */
  async function deliverTask(state, task, member) {
    const workspaceId = workspaceOf(state, task);
    const result = await sessionRegistry.ensureSession(member, workspaceId);
    if (result.error) {
      if (member.agentState !== "unavailable") {
        member.agentState = "unavailable";
        member.updatedAt = now();
      }
      task.agentState = "queued";
      store.save();
      return false;
    }
    if (member.agentState === "unavailable") member.agentState = "";
    task.agentSessionId = result.record.sessionId;
    task.agentState = "running";
    task.updatedAt = now();
    if (result.rebuilt) addHistory(task, "agent", "会话已重建，重新投递简报");
    store.save();
    const ok = await sessionRegistry.deliver(result.record, taskBrief(state, task, member, workspaceId));
    if (!ok) {
      task.agentState = "queued";
      member.agentState = "unavailable";
      store.save();
    }
    return ok;
  }

  /** Work through queued tasks in updatedAt order, one running task per workspace. */
  async function pumpAgents(state) {
    const queued = state.tasks
      .filter((task) => task.agentState === "queued" && task.status === "in_progress")
      .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
    for (const task of queued) {
      const member = findMember(state, task.assigneeId);
      if (!member) {
        task.agentState = "";
        continue;
      }
      if (runningInWorkspace(state, workspaceOf(state, task), task.id)) continue;
      if (runningForMember(state, member.id, task.id)) continue;
      task.agentState = "running";
      task.updatedAt = now();
      store.save();
      await deliverTask(state, task, member).catch((error) => {
        logger?.warn?.(`[iicp-kanban] delivery failed: ${String(error?.message || error)}`);
      });
    }
  }

  function rolePrompt(state, member) {
    const lead = member.kind === "lead";
    const lines = [
      `你是 IICP 看板团队的${lead ? "队长" : "成员"}「${member.name}」。看板是团队唯一的事实来源。`,
      "所有看板操作必须通过工具完成；不要声称完成了未实际调用工具的操作。",
      "任务执行必须在被指派的工作区内进行；不得操作他人的任务。",
    ];
    if (lead) {
      lines.push(
        "职责：收集需求、把需求拆成卡片、派单、验收。",
        "计划闸门：先用文字给出计划（要建哪些卡、谁来做、依赖关系），等用户确认后再调用 task_create；确认前不得建卡。",
        "task_create 一次提交整批卡片，任一失败则整批不落库；派单后成员会收到简报并开始执行。",
        "成员提交验收后会收到通知；用 review 接受（accepted）或打回（changes），打回必须写清原因。",
      );
    } else {
      lines.push(
        "职责：只执行指派给你的任务。用 task_get 读取任务详情。",
        "进展用 report(status=progress)，受阻用 report(status=blocked)，完成用 report(status=done) 并写验收说明。",
        "调用 report(status=done) 或 report(status=blocked) 后立即停止本轮工作，等待队长处理；不要自行验收或改派。",
      );
    }
    return lines.join("\n");
  }

  function tool(name, description, properties, handler, required = []) {
    return {
      name,
      description,
      parameters: { type: "object", properties, required, additionalProperties: false },
      output: { schema: { type: "object", additionalProperties: true } },
      execute: (args) => handler(args && typeof args === "object" ? args : {}),
    };
  }

  /** Compact card shape shared by board_read and task_get. */
  function taskSummary(state, task) {
    const assignee = task.assigneeId ? state.members.find((member) => member.id === task.assigneeId) : null;
    const project = task.projectId ? state.projects.find((entry) => entry.id === task.projectId) : null;
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      assigneeName: assignee?.name || "",
      projectId: task.projectId,
      projectName: project?.name || "",
      ready: isReady(task, taskIndex(state)),
      dependsOn: task.dependsOn || [],
      agentState: task.agentState || "",
      goal: task.goal?.text || "",
      acceptanceCriteria: task.acceptanceCriteria || "",
      updatedAt: task.updatedAt,
    };
  }

  function leadTools(lead) {
    return [
      tool(
        "board_read",
        "读取看板任务（压缩字段）。可按项目或状态过滤；默认最多 30 张。",
        {
          projectId: { type: "string" },
          status: { type: "string", enum: ["backlog", "in_progress", "blocked", "done"] },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        (args) => {
          const state = store.state;
          let tasks = state.tasks.filter((task) => !task.archived);
          if (args.projectId) tasks = tasks.filter((task) => task.projectId === args.projectId);
          if (args.status) tasks = tasks.filter((task) => task.status === args.status);
          const limit = Math.min(50, Math.max(1, Number(args.limit) || 30));
          return { ok: true, count: tasks.length, tasks: tasks.slice(0, limit).map((task) => taskSummary(state, task)) };
        },
      ),
      tool(
        "member_list",
        "列出团队成员、模型配置与当前负载，用于决定派单对象。",
        {},
        () => {
          const state = store.state;
          const byId = taskIndex(state);
          return {
            ok: true,
            members: liveMembers(state).map((member) => {
              const tasks = state.tasks.filter((task) => !task.archived && task.assigneeId === member.id);
              return {
                id: member.id,
                name: member.name,
                kind: member.kind,
                role: member.role,
                status: member.status,
                agentState: member.agentState || "",
                provider: member.provider,
                model: member.model,
                inFlight: tasks.filter(
                  (task) => task.status === "in_progress" || (task.status === "backlog" && isReady(task, byId)),
                ).length,
                blocked: tasks.filter((task) => task.status === "blocked").length,
              };
            }),
          };
        },
      ),
      tool(
        "task_create",
        "原子地创建一批任务（1-30 张），可选直接指派。任一校验失败则整批不落库。",
        {
          tasks: {
            type: "array",
            minItems: 1,
            maxItems: 30,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                goal: { type: "string" },
                acceptanceCriteria: { type: "string" },
                priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
                tags: { type: "array", items: { type: "string" } },
                dependsOn: { type: "array", items: { type: "string" } },
                subtasks: { type: "array", items: { type: "string" } },
                projectId: { type: "string" },
                workspaceId: { type: "string" },
                assigneeId: { type: "string" },
              },
              required: ["title"],
              additionalProperties: false,
            },
          },
        },
        (args) => {
          const state = store.state;
          const list = Array.isArray(args.tasks) ? args.tasks : [];
          if (list.length < 1 || list.length > 30) throw badRequest("tasks 需要 1-30 张卡片");
          const prepared = list.map((item) =>
            prepareTask(state, { ...item, origin: "session", sourceSessionId: lead.sessionId || "" }),
          );
          for (const task of prepared) {
            commitTask(state, task, `由队长会话创建`);
          }
          refreshTeam(state);
          store.save();
          return {
            ok: true,
            created: prepared.map((task) => ({ id: task.id, title: task.title, assigneeId: task.assigneeId })),
          };
        },
        ["tasks"],
      ),
      tool(
        "task_update",
        "修改一张任务卡片（标题、目标、验收标准、优先级、状态、指派、备注、标签、前置）。",
        {
          taskId: { type: "string" },
          title: { type: "string" },
          goal: { type: "string" },
          acceptanceCriteria: { type: "string" },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
          status: { type: "string", enum: ["backlog", "in_progress", "blocked", "done"] },
          assigneeId: { type: "string" },
          notes: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          dependsOn: { type: "array", items: { type: "string" } },
        },
        async (args) => {
          const result = await updateTaskById(store.state, { ...args, id: args.taskId });
          return { ok: true, ...result };
        },
        ["taskId"],
      ),
      tool(
        "dispatch",
        "把一张待办任务派给成员：写入指派、进入进行中、启动或排队执行。",
        { taskId: { type: "string" }, memberId: { type: "string" } },
        async (args) => {
          const result = await dispatchTask(store.state, args);
          return { ok: true, ...result };
        },
        ["taskId", "memberId"],
      ),
      tool(
        "review",
        "验收一张成员已提交的任务：accepted 通过，changes 打回并说明原因。",
        {
          taskId: { type: "string" },
          decision: { type: "string", enum: ["accepted", "changes"] },
          note: { type: "string" },
        },
        async (args) => {
          const result = await reviewTask(store.state, { ...args, leadId: lead.id });
          return { ok: true, ...result };
        },
        ["taskId", "decision"],
      ),
    ];
  }

  function workerTools(member) {
    const assertOwn = (taskId) => {
      const task = findTask(store.state, taskId);
      if (!task) throw notFound(`task not found: ${taskId}`);
      if (task.assigneeId && task.assigneeId !== member.id) throw badRequest("只能操作指派给自己的任务");
      return task;
    };
    return [
      tool(
        "task_get",
        "读取指派给自己的任务详情（含目标、验收标准、前置、子任务、交付物）。",
        { taskId: { type: "string" } },
        (args) => {
          const state = store.state;
          const task = assertOwn(args.taskId);
          return { ok: true, task: { ...taskSummary(state, task), notes: task.notes, subtasks: task.subtasks, artifacts: task.artifacts, history: task.history.slice(-5) } };
        },
        ["taskId"],
      ),
      tool(
        "report",
        "汇报任务进展（progress）、受阻（blocked）或完成提交验收（done）。",
        {
          taskId: { type: "string" },
          status: { type: "string", enum: ["progress", "blocked", "done"] },
          note: { type: "string" },
          subtasks: { type: "array", items: { type: "string" } },
          artifacts: { type: "array", items: { type: "string" } },
        },
        async (args) => {
          const result = await reportTask(store.state, { ...args, memberId: member.id, fromAgent: true });
          return { ok: true, task: taskSummary(store.state, result.task) };
        },
        ["taskId", "status"],
      ),
      tool(
        "artifact_add",
        "给指派给自己的任务追加一个交付物或修改文件。",
        {
          taskId: { type: "string" },
          path: { type: "string" },
          name: { type: "string" },
          kind: { type: "string", enum: ["deliverable", "modified"] },
        },
        (args) => {
          const state = store.state;
          const task = assertOwn(args.taskId);
          if (!args.path) throw badRequest("path is required");
          const artifact = normalizeArtifact({ name: args.name || "", path: args.path, kind: args.kind }, task.artifacts.length);
          if (!artifact) throw badRequest("invalid artifact");
          task.artifacts = [...(task.artifacts || []), artifact].slice(0, LIST_LIMITS.artifactsPerTask);
          task.updatedAt = now();
          addHistory(task, "artifact", `新增交付物：${artifact.name || artifact.path}`);
          store.save();
          return { ok: true, artifacts: task.artifacts };
        },
        ["taskId", "path"],
      ),
    ];
  }

  /* ------- core board operations reused by HTTP and tools ------- */

  function prepareTask(state, body) {
    const title = clipText(body.title, TEXT_LIMITS.taskTitle);
    if (!title) throw badRequest("task title is required");
    const status = body.status === undefined ? "backlog" : body.status;
    if (!isStatus(status)) throw badRequest(`invalid status: ${status}`);
    const priority = body.priority === undefined ? "P2" : body.priority;
    if (!isPriority(priority)) throw badRequest(`invalid priority: ${priority}`);
    const dependsOn = normalizeDependsOn(body.dependsOn);
    const byId = taskIndex(state);
    validateDependsOn("", dependsOn, byId);
    assertStartable(state, { id: "", dependsOn }, status, dependsOn);
    const goal = normalizeGoal(body.goal, { status: status === "done" ? "done" : "backlog" });
    if (body.origin === "session" && goal.text) goal.source = "session";
    return {
      id: newTaskId(state.counters),
      title,
      goal,
      acceptanceCriteria: clipText(body.acceptanceCriteria, TEXT_LIMITS.taskAcceptance),
      notes: clipText(body.notes, TEXT_LIMITS.taskNotes),
      dueDate: clipText(body.dueDate, TEXT_LIMITS.taskDueDate),
      status,
      priority,
      tags: normalizeTags(body.tags),
      workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "",
      projectId: assertProject(state, typeof body.projectId === "string" ? body.projectId : ""),
      assigneeId: assertAssignee(state, typeof body.assigneeId === "string" ? body.assigneeId : ""),
      dependsOn,
      agentSessionId: "",
      agentState: "",
      origin: body.origin === "session" ? "session" : "manual",
      sourceSessionId: typeof body.sourceSessionId === "string" ? clipText(body.sourceSessionId, 200) : "",
      pinned: false,
      archived: false,
      progress: null,
      subtasks: normalizeSubtaskList(body.subtasks),
      artifacts: normalizeArtifactList(body.artifacts),
      lockedFields: normalizeLockedFields(body.lockedFields),
      reviewStatus: "none",
      reviewNote: "",
      createdAt: now(),
      updatedAt: now(),
      history: [],
    };
  }

  function commitTask(state, task, reason = "创建任务") {
    syncGoalStatus(task);
    syncProgress(task);
    settleReviewOnStatus(state, task);
    addHistory(task, "create", reason);
    const byId = taskIndex(state);
    const pendingDeps = unfinishedDeps(task, byId);
    if (pendingDeps.length > 0 && task.status === "done") {
      addHistory(task, "dependency", `越权完成：前置 ${describeDeps(pendingDeps)} 未完成`);
    }
    state.tasks.push(task);
  }

  async function dispatchTask(state, body) {
    const task = findTask(state, body.taskId);
    if (!task) throw notFound(`task not found: ${body.taskId}`);
    if (task.status === "backlog") assertStartable(state, task, "in_progress");
    const worker = findMember(state, typeof body.memberId === "string" ? body.memberId : "");
    if (!worker) throw badRequest(`assignee not found: ${body.memberId}`);
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    const lead = leadId ? findMember(state, leadId) : findLead(state);
    if (lead && lead.kind !== "lead") throw badRequest(`member is not a lead: ${lead.id}`);
    if (lead && worker.kind === "lead" && worker.id !== lead.id) {
      throw badRequest("队长不能把任务派给自己以外的队长");
    }
    const fromStatus = task.status;
    const wasRunning = task.agentState === "running" && task.assigneeId === worker.id;
    task.assigneeId = worker.id;
    if (task.status === "backlog") task.status = "in_progress";
    task.reviewStatus = "none";
    task.reviewNote = "";
    syncGoalStatus(task);
    syncProgress(task);
    task.updatedAt = now();
    addHistory(task, "assignee", `派单：${worker.name} 认领${fromStatus !== task.status ? `（${fromStatus} → ${task.status}）` : ""}`, {
      from: "",
      to: worker.id,
    });
    refreshMemberStatus(state, worker);
    const canRun =
      !runningInWorkspace(state, workspaceOf(state, task), task.id) && !runningForMember(state, worker.id, task.id);
    task.agentState = wasRunning || canRun ? "running" : "queued";
    store.save();
    if (task.agentState === "running" && !wasRunning) await deliverTask(state, task, worker);
    return { task, member: worker, agent: { available: sessionRegistry.available(), state: task.agentState } };
  }

  async function reportTask(state, body) {
    const task = findTask(state, body.taskId);
    if (!task) throw notFound(`task not found: ${body.taskId}`);
    const member = findMember(state, typeof body.memberId === "string" ? body.memberId : "");
    if (!member) throw badRequest(`member not found: ${body.memberId}`);
    if (task.assigneeId && task.assigneeId !== member.id) {
      throw badRequest(`任务属于 ${task.assigneeId}，${member.name} 无法回报`);
    }
    if (task.reviewStatus === "pending") throw conflict("该任务已提交验收，等待队长处理");
    const mode = body.status === "progress" || body.status === "blocked" ? body.status : "done";
    const note = clipText(body.note, TEXT_LIMITS.historyNote);
    const pendingDeps = unfinishedDeps(task, taskIndex(state));
    if (Array.isArray(body.subtasks)) task.subtasks = normalizeSubtaskList(body.subtasks);
    if (Array.isArray(body.artifacts)) task.artifacts = normalizeArtifactList(body.artifacts);
    task.assigneeId = member.id;
    if (mode === "blocked") {
      task.status = "blocked";
      addHistory(task, "agent", `${member.name} 汇报受阻${note ? `：${note}` : ""}`);
    } else if (mode === "done") {
      task.reviewStatus = "pending";
      task.reviewNote = note;
      if (task.status === "blocked" || task.status === "backlog") task.status = "in_progress";
      addHistory(task, "review", `${member.name} 提交验收${note ? `：${note}` : ""}`);
    } else {
      if (task.status === "blocked" || task.status === "backlog") task.status = "in_progress";
      addHistory(task, "agent", `${member.name} 进展${note ? `：${note}` : ""}`);
    }
    if (pendingDeps.length > 0) {
      addHistory(task, "dependency", `提交时前置未完成：${describeDeps(pendingDeps)}`);
    }
    if (mode !== "progress") task.agentState = "";
    syncGoalStatus(task);
    syncProgress(task);
    task.updatedAt = now();
    refreshMemberStatus(state, member);
    store.save();
    if (mode !== "progress") {
      scheduleWake(member.id, mode === "done"
        ? `任务 ${task.id}「${task.title}」已提交验收（${member.name}）${note ? `：${note}` : ""}`
        : `任务 ${task.id}「${task.title}」受阻（${member.name}）${note ? `：${note}` : ""}`);
      await pumpAgents(state);
    }
    return { task, mode };
  }

  async function reviewTask(state, body) {
    if (!isReviewStatus(body.decision) || body.decision === "none") {
      throw badRequest(`invalid decision: ${body.decision}`);
    }
    const task = findTask(state, body.taskId);
    if (!task) throw notFound(`task not found: ${body.taskId}`);
    if (task.reviewStatus !== "pending") throw conflict("该任务没有待验收的提交");
    const reviewer = typeof body.leadId === "string" && body.leadId ? findMember(state, body.leadId) : findLead(state);
    if (!reviewer) throw badRequest("团队没有队长，无法验收");
    if (reviewer.kind !== "lead") throw badRequest(`member is not a lead: ${reviewer.id}`);
    if (task.assigneeId && task.assigneeId === reviewer.id) {
      throw badRequest("自己完成的任务不能自己验收，请移交队长");
    }
    const note = clipText(body.note, TEXT_LIMITS.historyNote);
    const assignee = task.assigneeId ? findMember(state, task.assigneeId) : null;
    if (body.decision === "accepted") {
      task.reviewStatus = "accepted";
      task.reviewNote = note;
      task.status = "done";
      task.agentState = "";
      const subtasksLocked = (task.lockedFields || []).includes("subtasks");
      if (!subtasksLocked && Array.isArray(task.subtasks)) {
        for (const subtask of task.subtasks) {
          if (!subtask.done && subtask.source !== "manual") subtask.done = true;
        }
      }
      addHistory(task, "review", `${reviewer.name} 验收通过${note ? `：${note}` : ""}`);
    } else {
      task.reviewStatus = "changes";
      task.reviewNote = note;
      task.status = "in_progress";
      addHistory(task, "review", `${reviewer.name} 要求返工${note ? `：${note}` : ""}`);
    }
    syncGoalStatus(task);
    syncProgress(task);
    task.updatedAt = now();
    if (assignee) refreshMemberStatus(state, assignee);
    store.save();
    if (body.decision === "changes") {
      task.agentState = "queued";
      store.save();
    }
    await pumpAgents(state);
    return { task };
  }

  async function updateTaskById(state, body) {
    const task = findTask(state, body.id);
    if (!task) throw notFound(`task not found: ${body.id}`);
    const byId = taskIndex(state);
    let nextDeps;
    if (body.dependsOn !== undefined) {
      nextDeps = normalizeDependsOn(body.dependsOn);
      validateDependsOn(task.id, nextDeps, byId);
    }
    if (body.status !== undefined && body.status !== task.status) {
      if (!isStatus(body.status)) throw badRequest(`invalid status: ${body.status}`);
      assertStartable(state, task, body.status, nextDeps);
    }
    const changes = [];
    if (typeof body.title === "string") {
      const title = clipText(body.title, TEXT_LIMITS.taskTitle);
      if (!title) throw badRequest("task title cannot be empty");
      if (title !== task.title) {
        task.title = title;
        changes.push("标题");
      }
    }
    if (typeof body.goal === "string") {
      const goal = normalizeGoal(body.goal, { status: task.status });
      if (JSON.stringify(goal) !== JSON.stringify(task.goal)) {
        task.goal = goal;
        changes.push("目标");
      }
    } else if (body.goal && typeof body.goal === "object" && !Array.isArray(body.goal)) {
      const merged = normalizeGoal({ ...task.goal, ...body.goal }, { status: task.status });
      if (JSON.stringify(merged) !== JSON.stringify(task.goal)) {
        task.goal = merged;
        changes.push("目标");
      }
    }
    if (
      typeof body.acceptanceCriteria === "string" &&
      clipText(body.acceptanceCriteria, TEXT_LIMITS.taskAcceptance) !== task.acceptanceCriteria
    ) {
      task.acceptanceCriteria = clipText(body.acceptanceCriteria, TEXT_LIMITS.taskAcceptance);
      changes.push("验收标准");
    }
    if (typeof body.notes === "string" && clipText(body.notes, TEXT_LIMITS.taskNotes) !== task.notes) {
      task.notes = clipText(body.notes, TEXT_LIMITS.taskNotes);
      changes.push("备注");
    }
    if (typeof body.dueDate === "string" && clipText(body.dueDate, TEXT_LIMITS.taskDueDate) !== task.dueDate) {
      task.dueDate = clipText(body.dueDate, TEXT_LIMITS.taskDueDate);
      changes.push("到期日");
    }
    if (body.dependsOn !== undefined && JSON.stringify(nextDeps) !== JSON.stringify(task.dependsOn)) {
      task.dependsOn = nextDeps;
      changes.push("前置");
      const names = nextDeps.map((id) => byId.get(id)?.title || id);
      addHistory(task, "dependency", `前置更新：${names.length > 0 ? names.join("、") : "已清空"}`);
    }
    if (body.status !== undefined && body.status !== task.status) {
      const from = task.status;
      task.status = body.status;
      changes.push(`状态 ${from} → ${body.status}`);
      addHistory(task, "status", `状态变更`, { from, to: body.status });
      const subtasksLocked = (task.lockedFields || []).includes("subtasks");
      let autoClosed = 0;
      if (task.status === "done" && !subtasksLocked && Array.isArray(task.subtasks)) {
        for (const subtask of task.subtasks) {
          if (!subtask.done && subtask.source !== "manual") {
            subtask.done = true;
            autoClosed += 1;
          }
        }
      }
      syncGoalStatus(task);
      syncProgress(task);
      settleReviewOnStatus(state, task);
      if (task.status === "done") {
        const pendingDeps = unfinishedDeps(task, byId);
        if (pendingDeps.length > 0) {
          addHistory(task, "dependency", `越权完成：前置 ${describeDeps(pendingDeps)} 未完成`);
        }
      }
      if (autoClosed > 0) addHistory(task, "subtask", `任务完成，自动关闭 ${autoClosed} 个生成子任务`);
    }
    if (body.priority !== undefined && body.priority !== task.priority) {
      if (!isPriority(body.priority)) throw badRequest(`invalid priority: ${body.priority}`);
      task.priority = body.priority;
      changes.push("优先级");
    }
    if (body.tags !== undefined) {
      const tags = normalizeTags(body.tags);
      if (JSON.stringify(tags) !== JSON.stringify(task.tags)) {
        task.tags = tags;
        changes.push("标签");
      }
    }
    if (body.projectId !== undefined && body.projectId !== task.projectId) {
      task.projectId = assertProject(state, typeof body.projectId === "string" ? body.projectId : "");
      changes.push("项目");
    }
    if (body.assigneeId !== undefined && body.assigneeId !== task.assigneeId) {
      const assigneeId = assertAssignee(state, typeof body.assigneeId === "string" ? body.assigneeId : "");
      const previousId = task.assigneeId;
      const previous = previousId ? state.members.find((m) => m.id === previousId)?.name || previousId : "未指派";
      const next = assigneeId ? state.members.find((m) => m.id === assigneeId)?.name || assigneeId : "未指派";
      task.assigneeId = assigneeId;
      if (task.reviewStatus === "pending") {
        task.reviewStatus = "none";
        task.reviewNote = "";
      }
      changes.push("指派");
      addHistory(task, "assignee", `指派：${previous} → ${next}`, { from: previousId, to: assigneeId });
    }
    if (body.subtasks !== undefined) {
      const subtasks = normalizeSubtaskList(body.subtasks);
      if (JSON.stringify(subtasks) !== JSON.stringify(task.subtasks)) {
        task.subtasks = subtasks;
        changes.push("子任务");
        syncProgress(task);
      }
    }
    if (body.artifacts !== undefined) {
      const artifacts = normalizeArtifactList(body.artifacts);
      if (JSON.stringify(artifacts) !== JSON.stringify(task.artifacts)) {
        task.artifacts = artifacts;
        changes.push("交付物");
      }
    }
    if (body.lockedFields !== undefined) {
      const lockedFields = normalizeLockedFields(body.lockedFields);
      if (JSON.stringify(lockedFields) !== JSON.stringify(task.lockedFields)) {
        task.lockedFields = lockedFields;
        changes.push("字段锁定");
      }
    }
    if (typeof body.archived === "boolean" && body.archived !== task.archived) {
      task.archived = body.archived;
      changes.push(body.archived ? "归档" : "恢复");
      addHistory(task, "archive", body.archived ? "归档任务" : "恢复任务");
    }
    if (typeof body.pinned === "boolean" && body.pinned !== task.pinned) {
      task.pinned = body.pinned;
      changes.push(body.pinned ? "置顶" : "取消置顶");
      addHistory(task, "pin", body.pinned ? "置顶任务" : "取消置顶");
    }
    if (changes.length > 0) {
      task.updatedAt = now();
      if (!changes.some((change) => change.startsWith("状态"))) {
        addHistory(task, "edit", `编辑：${changes.join("、")}`);
      }
      if (task.status !== "in_progress") task.agentState = "";
      refreshTeam(state);
      store.save();
      await pumpAgents(state);
    }
    return { task, changed: changes.length > 0 };
  }

  /* ------- wake-ups and watchdog ------- */

  function scheduleWake(memberId, text) {
    if (!sessionRegistry.available()) return;
    const entry = wakePending.get(memberId);
    if (entry) {
      entry.texts.push(text);
      return;
    }
    wakePending.set(memberId, { texts: [text], at: Date.now() });
    if (!wakeTimer) {
      wakeTimer = setTimeout(() => {
        wakeTimer = null;
        tickAgents().catch((error) => logger?.warn?.(`[iicp-kanban] wake flush failed: ${String(error?.message || error)}`));
      }, AGENT_WAKE_WINDOW_MS);
      wakeTimer.unref?.();
    }
  }

  async function flushWakes(nowMs) {
    for (const [memberId, entry] of wakePending) {
      if (nowMs - entry.at < AGENT_WAKE_WINDOW_MS) continue;
      wakePending.delete(memberId);
      const state = store.state;
      const lead = findLead(state);
      if (!lead) continue;
      const result = await sessionRegistry.ensureSession(lead, "");
      if (result.error) {
        if (lead.agentState !== "unavailable") lead.agentState = "unavailable";
        store.save();
        continue;
      }
      if (lead.agentState === "unavailable") lead.agentState = "";
      const member = findMember(state, memberId);
      await sessionRegistry.deliver(
        result.record,
        `【事件】${member?.name || memberId}\n${entry.texts.join("\n")}`,
      );
    }
  }

  /** Testable clock: flush due wake-ups and block running tasks past the timeout. */
  async function tickAgents(nowMs = Date.now()) {
    await flushWakes(nowMs);
    const state = store.state;
    const configured = Number(process.env.IICP_AGENT_TIMEOUT_MS);
    const timeout = Number.isFinite(configured) && configured > 0 ? configured : AGENT_TIMEOUT_MS;
    let dirty = false;
    for (const task of state.tasks) {
      if (task.status !== "in_progress" || task.agentState !== "running") continue;
      const started = Date.parse(task.updatedAt) || 0;
      if (!started || nowMs - started <= timeout) continue;
      task.status = "blocked";
      task.agentState = "";
      task.updatedAt = new Date(nowMs).toISOString();
      addHistory(task, "agent", "执行超时，已置为受阻");
      dirty = true;
      scheduleWake(task.assigneeId || "", `任务 ${task.id}「${task.title}」执行超时，已置为受阻`);
    }
    if (dirty) {
      refreshTeam(state);
      store.save();
    }
    await pumpAgents(state);
  }

  /** Start the agent sessions of every in-progress assigned task (D9). */
  async function restoreAgents(state) {
    for (const task of state.tasks) {
      if (task.status !== "in_progress" || !task.assigneeId || task.agentState === "running") continue;
      if (task.agentState === "queued") continue;
      task.agentState = "queued";
      task.updatedAt = task.updatedAt || now();
    }
    await pumpAgents(state);
  }

  /* ------------------------------------------------------------------ */
  /* Route table                                                         */
  /* ------------------------------------------------------------------ */

  async function handle(req, res, { route, url, method }) {
    try {
      await dispatch(req, res, { route, url, method });
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      logger?.warn?.(`[iicp-kanban] ${method} ${route} failed: ${String(error?.message || error)}`);
      json(res, status, { ok: false, error: error?.code || "internal", message: String(error?.message || error) });
    }
  }

  async function dispatch(req, res, { route, url, method }) {
    const state = store.state;
    const query = url.searchParams;

    /* ---- health ---- */
    if (route === "/ping" && method === "GET") {
      json(res, 200, { ok: true, plugin: "dsh-iicp-kanban", dshHome, version: 2, time: now() });
      return;
    }

    /* ---- board state ---- */
    if (route === "/state" && method === "GET") {
      json(res, 200, buildStatePayload(state));
      return;
    }

    /* ---- model directory (live DSH llm service) ---- */
    // Not part of /state on purpose: /state is polled every 8s by the client and
    // walking every provider's model list on each poll would hammer the adapters.
    // A missing llm service is not an HTTP error — the form still saves a manual
    // value, so the payload stays `ok:true` and reports `available:false`.
    if (route === "/models" && method === "GET") {
      const catalog = await buildModelCatalog(resolveService(ctx, "llm"), resolveService(ctx, "agentDefaultModel"));
      json(res, 200, {
        ok: true,
        available: catalog.ok === true,
        defaultModel: catalog.defaultModel,
        providers: catalog.providers,
        providerCount: catalog.providerCount,
        modelCount: catalog.modelCount,
        ...(catalog.error ? { error: catalog.error } : {}),
        generatedAt: now(),
      });
      return;
    }

    /* ---- workspaces ---- */
    if (route === "/workspaces" && method === "GET") {
      json(res, 200, { ok: true, workspaces: listWorkspaces(state) });
      return;
    }
    if (route === "/workspace.update" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const workspace = state.workspaces.find((w) => w.id === body.id);
      if (!workspace) throw notFound(`workspace not found: ${body.id}`);
      if (typeof body.included === "boolean") workspace.included = body.included;
      store.save();
      json(res, 200, { ok: true, workspace });
      return;
    }

    /* ---- projects ---- */
    if (route === "/project.create" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const name = clipText(body.name, TEXT_LIMITS.projectName);
      if (!name) throw badRequest("project name is required");
      const workspaceId = normalizeWorkspaceBinding(state, body.workspaceId);
      assertWorkspaceFree(state, workspaceId);
      const project = {
        id: newId("p"),
        name,
        notes: clipText(body.notes, TEXT_LIMITS.projectNotes),
        dueDate: normalizeDateOnly(body.dueDate),
        workspaceId,
        archived: false,
        createdAt: now(),
        updatedAt: now(),
      };
      state.projects.push(project);
      store.save();
      json(res, 200, { ok: true, project });
      return;
    }
    if (route === "/project.update" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const project = state.projects.find((p) => p.id === body.id);
      if (!project) throw notFound(`project not found: ${body.id}`);
      // v2.7 optimistic lock: reject writes based on a stale snapshot.
      if (typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt && body.expectedUpdatedAt !== project.updatedAt) {
        throw conflict("项目已被其他窗口修改，请刷新后重试");
      }
      const next = { ...project };
      if (typeof body.name === "string") {
        const name = clipText(body.name, TEXT_LIMITS.projectName);
        if (!name) throw badRequest("project name cannot be empty");
        next.name = name;
      }
      if (typeof body.notes === "string") next.notes = clipText(body.notes, TEXT_LIMITS.projectNotes);
      if (typeof body.dueDate === "string") next.dueDate = normalizeDateOnly(body.dueDate);
      if (typeof body.workspaceId === "string") next.workspaceId = normalizeWorkspaceBinding(state, body.workspaceId);
      if (typeof body.archived === "boolean") next.archived = body.archived;
      // Only a live project can own a workspace binding.
      if (!next.archived) assertWorkspaceFree(state, next.workspaceId, project.id);
      const changed = Object.keys(next).some((field) => !Object.is(next[field], project[field]));
      if (!changed) {
        json(res, 200, { ok: true, project, changed: false });
        return;
      }
      Object.assign(project, next);
      project.updatedAt = now();
      store.save();
      json(res, 200, { ok: true, project, changed: true });
      return;
    }
    if (route === "/project.delete" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const index = state.projects.findIndex((p) => p.id === body.id);
      if (index < 0) throw notFound(`project not found: ${body.id}`);
      const [removed] = state.projects.splice(index, 1);
      // Detach tasks and leave a trail in their history (mirrors member.delete).
      for (const task of state.tasks) {
        if (task.projectId !== removed.id) continue;
        task.projectId = "";
        addHistory(task, "project", `项目已删除，任务改为无项目（原项目：${removed.name}）`);
        task.updatedAt = now();
      }
      store.save();
      json(res, 200, { ok: true, deleted: removed.id });
      return;
    }

    /* ---- members (team management) ---- */
    if (route === "/member.create" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const name = clipText(body.name, TEXT_LIMITS.memberName);
      if (!name) throw badRequest("member name is required");
      const role = body.role === undefined ? "member" : body.role;
      if (!isMemberRole(role)) throw badRequest(`invalid role: ${role}`);
      const requestedKind = body.kind === undefined ? "" : body.kind;
      if (requestedKind && !isMemberKind(requestedKind)) throw badRequest(`invalid kind: ${requestedKind}`);
      const existingLead = findLead(state);
      // A team always has exactly one lead: the very first member becomes it,
      // and a second lead is rejected until the first steps down.
      const kind = requestedKind ? requestedKind : existingLead ? "worker" : "lead";
      if (kind === "lead" && existingLead) {
        throw conflict(`团队已经有队长（${existingLead.name}），请先解除再指定新队长`);
      }
      // A worker with no explicit lead joins the current one; an explicit ""
      // keeps it orphaned on purpose.
      const requestedLeadId = typeof body.leadId === "string" ? body.leadId : existingLead ? existingLead.id : "";
      const leadId = kind === "lead" ? "" : assertLeadId(state, requestedLeadId);
      const status = body.status === undefined ? "idle" : body.status;
      if (!isMemberStatus(status)) throw badRequest(`invalid status: ${status}`);
      const member = {
        id: newId("m"),
        name,
        title: clipText(body.title, TEXT_LIMITS.memberTitle),
        contact: clipText(body.contact, TEXT_LIMITS.memberContact),
        role,
        kind,
        leadId,
        personality: clipText(body.personality, TEXT_LIMITS.memberPersonality),
        skills: normalizeSkills(body.skills),
        provider: clipText(body.provider, TEXT_LIMITS.memberProvider),
        model: clipText(body.model, TEXT_LIMITS.memberModel),
        status,
        sessionId: "",
        sessions: {},
        agentState: "",
        archived: false,
        createdAt: now(),
        updatedAt: now(),
      };
      state.members.push(member);
      if (kind === "lead") adoptOrphanWorkers(state, member);
      refreshMemberStatus(state, member);
      store.save();
      json(res, 200, { ok: true, member });
      return;
    }
    if (route === "/member.update" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const member = state.members.find((m) => m.id === body.id);
      if (!member) throw notFound(`member not found: ${body.id}`);
      if (typeof body.name === "string") {
        const name = clipText(body.name, TEXT_LIMITS.memberName);
        if (!name) throw badRequest("member name cannot be empty");
        member.name = name;
      }
      if (typeof body.title === "string") member.title = clipText(body.title, TEXT_LIMITS.memberTitle);
      if (typeof body.contact === "string") member.contact = clipText(body.contact, TEXT_LIMITS.memberContact);
      if (body.role !== undefined) {
        if (!isMemberRole(body.role)) throw badRequest(`invalid role: ${body.role}`);
        member.role = body.role;
      }
      if (typeof body.personality === "string") {
        member.personality = clipText(body.personality, TEXT_LIMITS.memberPersonality);
      }
      if (body.skills !== undefined) member.skills = normalizeSkills(body.skills);
      if (typeof body.provider === "string") member.provider = clipText(body.provider, TEXT_LIMITS.memberProvider);
      if (typeof body.model === "string") member.model = clipText(body.model, TEXT_LIMITS.memberModel);
      if (body.status !== undefined) {
        if (!isMemberStatus(body.status)) throw badRequest(`invalid status: ${body.status}`);
        member.status = body.status;
      }
      if (body.kind !== undefined) {
        if (!isMemberKind(body.kind)) throw badRequest(`invalid kind: ${body.kind}`);
        if (body.kind === "lead" && member.kind !== "lead") {
          const existingLead = findLead(state);
          if (existingLead && existingLead.id !== member.id) {
            throw conflict(`团队已经有队长（${existingLead.name}），请先解除再指定新队长`);
          }
          member.kind = "lead";
          member.leadId = "";
          adoptOrphanWorkers(state, member);
        } else if (body.kind === "worker" && member.kind === "lead") {
          // The lead is a permanent role: stepping down is no longer allowed
          // (protect-team-lead). Workers keep their lead instead of orphaning.
          throw badRequest("队长不可被卸任");
        } else {
          member.kind = body.kind;
        }
      }
      if (body.leadId !== undefined) {
        if (member.kind === "lead") throw badRequest("队长不能挂靠到其他成员");
        member.leadId = assertLeadId(state, typeof body.leadId === "string" ? body.leadId : "");
      }
      if (typeof body.archived === "boolean") member.archived = body.archived;
      member.updatedAt = now();
      store.save();
      json(res, 200, { ok: true, member });
      return;
    }
    if (route === "/member.delete" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const index = state.members.findIndex((m) => m.id === body.id);
      if (index < 0) throw notFound(`member not found: ${body.id}`);
      // The lead is a permanent role: it cannot be removed, only its profile
      // fields can be edited (see protect-team-lead).
      if (state.members[index].kind === "lead") throw badRequest("队长不可被删除");
      await sessionRegistry.disposeMember(state.members[index].id);
      const [removed] = state.members.splice(index, 1);
      // Unassign their tasks; history keeps the former assignee name.
      for (const task of state.tasks) {
        if (task.assigneeId === removed.id) {
          task.assigneeId = "";
          addHistory(task, "assignee", `成员已移除，任务改为未指派（原成员：${removed.name}）`);
          task.updatedAt = now();
        }
      }
      // A removed lead orphans the team instead of cascading deletions: the
      // workers stay, tasks stay assigned, and the next lead adopts them.
      for (const member of state.members) {
        if (member.leadId === removed.id) member.leadId = "";
      }
      if (state.settings.defaultAssigneeId === removed.id) state.settings.defaultAssigneeId = "";
      store.save();
      await pumpAgents(state);
      json(res, 200, { ok: true, deleted: removed.id });
      return;
    }
    if (route === "/member.workload" && method === "GET") {
      json(res, 200, { ok: true, workload: memberWorkload(state) });
      return;
    }

    /* ---- team: lead + workers view (v0.3) ---- */
    if (route === "/team" && method === "GET") {
      json(res, 200, { ok: true, team: buildTeamPayload(state) });
      return;
    }
    /* ---- agent sessions (v0.5) ---- */
    if (route === "/agent/lead" && method === "POST") {
      // Opening the chat drawer must be side-effect free when agents are absent.
      const lead = findLead(state);
      if (!lead) throw badRequest("团队没有队长");
      if (!sessionRegistry.available()) {
        json(res, 200, { ok: true, available: false, memberId: lead.id, sessionId: "", transcript: [] });
        return;
      }
      const result = await sessionRegistry.ensureSession(lead, "");
      if (result.error) {
        json(res, 200, { ok: true, available: false, memberId: lead.id, sessionId: "", error: result.error });
        return;
      }
      json(res, 200, {
        ok: true,
        available: true,
        memberId: lead.id,
        memberName: lead.name,
        sessionId: result.record.sessionId,
        rebuilt: result.rebuilt,
        transcript: sessionRegistry.transcript(result.record.sessionId),
      });
      return;
    }
    if (route === "/agent/transcript" && method === "GET") {
      const sessionId = url.searchParams.get("sessionId") || "";
      if (!sessionId) throw badRequest("sessionId is required");
      json(res, 200, { ok: true, entries: sessionRegistry.transcript(sessionId) });
      return;
    }
    if (route === "/agent/message" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
      const text = clipText(body.text, 4000);
      if (!sessionId || !text) throw badRequest("sessionId and text are required");
      const record = sessionRegistry.bySessionId(sessionId);
      if (!record) throw notFound("agent session is not running");
      const ok = await sessionRegistry.deliver(record, text);
      if (!ok) throw conflict("消息投递失败，请重试");
      json(res, 200, { ok: true });
      return;
    }
    if (route === "/agent/stream" && method === "GET") {
      const sessionId = url.searchParams.get("sessionId") || "";
      if (!sessionId) throw badRequest("sessionId is required");
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`);
      const off = sessionRegistry.subscribe(sessionId, (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      });
      const keepAlive = setInterval(() => res.write(": ping\n\n"), 15 * 1000);
      keepAlive.unref?.();
      req.on("close", () => {
        clearInterval(keepAlive);
        off();
      });
      return;
    }

    if (route === "/member.dispatch" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const result = await dispatchTask(state, body);
      json(res, 200, { ok: true, ...result });
      return;
    }
    if (route === "/member.report" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const result = await reportTask(state, body);
      json(res, 200, { ok: true, task: result.task, mode: result.mode });
      return;
    }
    if (route === "/member.review" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const result = await reviewTask(state, body);
      json(res, 200, { ok: true, task: result.task });
      return;
    }

    /* ---- tasks ---- */
    if (route === "/task.create" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const task = prepareTask(state, body);
      commitTask(state, task, "创建任务");
      refreshTeam(state);
      store.save();
      json(res, 200, { ok: true, task });
      return;
    }
    if (route === "/task.update" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const result = await updateTaskById(state, body);
      json(res, 200, { ok: true, task: result.task, changed: result.changed });
      return;
    }
    if (route === "/task.delete" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const index = state.tasks.findIndex((t) => t.id === body.id);
      if (index < 0) throw notFound(`task not found: ${body.id}`);
      const [removed] = state.tasks.splice(index, 1);
      // Prerequisite edges must not dangle: detach the deleted id everywhere and
      // leave a trace on the dependent card (visible in its history drawer).
      for (const task of state.tasks) {
        if (!Array.isArray(task.dependsOn) || !task.dependsOn.includes(removed.id)) continue;
        task.dependsOn = task.dependsOn.filter((id) => id !== removed.id);
        task.updatedAt = now();
        addHistory(task, "dependency", `前置任务已删除：${removed.title}`);
      }
      refreshTeam(state);
      store.save();
      await pumpAgents(state);
      json(res, 200, { ok: true, deleted: removed.id });
      return;
    }
    if (route === "/task.move" && method === "POST") {
      // Kanban drag-and-drop: status change with source column tracking.
      const body = await readJsonBody(req);
      requireObject(body);
      const task = findTask(state, body.id);
      if (!task) throw notFound(`task not found: ${body.id}`);
      if (!isStatus(body.status)) throw badRequest(`invalid status: ${body.status}`);
      const byId = taskIndex(state);
      if (body.status !== task.status) {
        // Guard before mutating so a rejected move leaves the card untouched.
        assertStartable(state, task, body.status);
        const from = task.status;
        task.status = body.status;
        task.updatedAt = now();
        addHistory(task, "status", `看板拖拽：${from} → ${body.status}`, { from, to: body.status });
        const subtasksLocked = (task.lockedFields || []).includes("subtasks");
        let autoClosed = 0;
        if (task.status === "done" && !subtasksLocked && Array.isArray(task.subtasks)) {
          for (const subtask of task.subtasks) {
            if (!subtask.done && subtask.source !== "manual") {
              subtask.done = true;
              autoClosed += 1;
            }
          }
        }
        syncGoalStatus(task);
        syncProgress(task);
        settleReviewOnStatus(state, task);
        if (task.status === "done") {
          const pendingDeps = unfinishedDeps(task, byId);
          if (pendingDeps.length > 0) {
            addHistory(task, "dependency", `越权完成：前置 ${describeDeps(pendingDeps)} 未完成`);
          }
        }
        if (autoClosed > 0) addHistory(task, "subtask", `任务完成，自动关闭 ${autoClosed} 个生成子任务`);
        if (task.status !== "in_progress") task.agentState = "";
        refreshTeam(state);
        store.save();
        await pumpAgents(state);
      }
      json(res, 200, { ok: true, task });
      return;
    }

    throw notFound(`no route: ${method} ${route}`);
  }

  /* ------------------------------------------------------------------ */
  /* Payload builders                                                    */
  /* ------------------------------------------------------------------ */

  function buildStatePayload(state) {
    const memberById = new Map(state.members.map((member) => [member.id, member]));
    const projectById = new Map(state.projects.map((project) => [project.id, project]));
    const taskById = taskIndex(state);
    const tasks = state.tasks.map((task) => ({
      ...task,
      ready: isReady(task, taskById),
      assigneeName: task.assigneeId ? memberById.get(task.assigneeId)?.name || "" : "",
      projectName: task.projectId ? projectById.get(task.projectId)?.name || "" : "",
    }));
    return {
      ok: true,
      generatedAt: now(),
      tasks,
      members: state.members,
      projects: state.projects,
      workspaces: listWorkspaces(state),
      settings: state.settings,
      stats: buildStats(state),
      team: buildTeamPayload(state),
    };
  }

  function listWorkspaces(state) {
    const discovered = workspaceSource.list();
    const byId = new Map(state.workspaces.map((w) => [w.id, w]));
    const merged = [];
    for (const workspace of discovered) {
      const existing = byId.get(workspace.id);
      merged.push({
        ...workspace,
        included: existing ? existing.included : true,
        sessionCount: existing?.sessionCount || 0,
        lastActivityAt: existing?.lastActivityAt || 0,
        source: "registry",
      });
    }
    for (const workspace of state.workspaces) {
      if (!merged.some((w) => w.id === workspace.id)) merged.push(workspace);
    }
    return merged;
  }

  function buildStats(state) {
    const activeTasks = state.tasks.filter((task) => !task.archived);
    const byStatus = { backlog: 0, in_progress: 0, blocked: 0, done: 0 };
    for (const task of activeTasks) byStatus[task.status] += 1;
    const assigned = activeTasks.filter((task) => task.assigneeId).length;
    return {
      total: activeTasks.length,
      archived: state.tasks.length - activeTasks.length,
      byStatus,
      assigned,
      unassigned: activeTasks.length - assigned,
      members: state.members.filter((member) => !member.archived).length,
      projects: state.projects.filter((project) => !project.archived).length,
    };
  }

  function memberWorkload(state) {
    const activeTasks = state.tasks.filter((task) => !task.archived);
    return state.members
      .filter((member) => !member.archived)
      .map((member) => {
        const tasks = activeTasks.filter((task) => task.assigneeId === member.id);
        return {
          memberId: member.id,
          name: member.name,
          role: member.role,
          kind: member.kind,
          leadId: member.leadId,
          status: member.status,
          total: tasks.length,
          reviewing: tasks.filter((task) => task.reviewStatus === "pending").length,
          byStatus: {
            backlog: tasks.filter((task) => task.status === "backlog").length,
            in_progress: tasks.filter((task) => task.status === "in_progress").length,
            blocked: tasks.filter((task) => task.status === "blocked").length,
            done: tasks.filter((task) => task.status === "done").length,
          },
        };
      })
      .concat({
        memberId: "",
        name: "未指派",
        role: "",
        kind: "",
        leadId: "",
        status: "",
        total: activeTasks.filter((task) => !task.assigneeId).length,
        reviewing: 0,
        byStatus: {},
      });
  }

  /**
   * Team view: the lead, its workers and the queue that needs the lead's
   * attention (unassigned tasks, pending reviews, blocked work).
   */
  function buildTeamPayload(state) {
    const lead = findLead(state);
    const members = liveMembers(state);
    const activeTasks = state.tasks.filter((task) => !task.archived);
    const taskById = taskIndex(state);
    const workers = members
      .filter((member) => member.kind === "worker")
      .map((member) => {
        const tasks = activeTasks.filter((task) => task.assigneeId === member.id);
        return {
          ...member,
          taskTotal: tasks.length,
          inFlight: tasks.filter((task) => task.status === "in_progress" || task.status === "backlog").length,
          blocked: tasks.filter((task) => task.status === "blocked").length,
          awaitingReview: tasks.filter((task) => task.reviewStatus === "pending").length,
          waiting: tasks.filter((task) => task.status === "backlog" && !isReady(task, taskById)).length,
          orphan: !member.leadId,
        };
      });
    const pendingReviews = activeTasks
      .filter((task) => task.reviewStatus === "pending")
      .map((task) => ({
        taskId: task.id,
        title: task.title,
        assigneeId: task.assigneeId,
        assigneeName: task.assigneeId ? members.find((m) => m.id === task.assigneeId)?.name || "" : "",
        note: task.reviewNote,
        updatedAt: task.updatedAt,
      }));
    return {
      lead: lead ? { ...lead, workerCount: workers.filter((worker) => worker.leadId === lead.id).length } : null,
      workers,
      pendingReviews,
      unassigned: activeTasks.filter((task) => !task.assigneeId).length,
      blocked: activeTasks.filter((task) => task.status === "blocked").length,
      inFlight: activeTasks.filter((task) => task.status === "in_progress").length,
      waiting: activeTasks.filter(
        (task) => task.assigneeId && task.status === "backlog" && !isReady(task, taskById),
      ).length,
      orphanWorkers: workers.filter((worker) => worker.orphan).length,
      generatedAt: now(),
    };
  }

  function normalizeTags(value) {
    if (!isStringArray(value)) return [];
    return value
      .map((tag) => clipText(tag, TEXT_LIMITS.tagName))
      .filter(Boolean)
      .slice(0, 4);
  }

  function requireObject(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("JSON object body required");
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  function start() {
    const state = store.state; // eager load + migration so first request is fast
    let dirty = false;
    // v2.7: heal bindings written by the old workspace parser.
    if (migrateWorkspaceBindings(state)) dirty = true;
    // v0.3: a pre-existing member list gains a lead + worker attachments.
    if (settleTeam(state)) dirty = true;
    refreshTeam(state);
    if (dirty) store.save();
    // v0.5: resume sessions for work that was in flight before the restart (D9).
    void restoreAgents(state).catch((error) =>
      logger?.warn?.(`[iicp-kanban] restore agents failed: ${String(error?.message || error)}`),
    );
    agentTimer = setInterval(() => {
      void tickAgents().catch((error) =>
        logger?.warn?.(`[iicp-kanban] agent tick failed: ${String(error?.message || error)}`),
      );
    }, 60 * 1000);
    agentTimer.unref?.();
    return () => {};
  }

  function stop() {
    if (agentTimer) clearInterval(agentTimer);
    agentTimer = null;
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = null;
    wakePending.clear();
    void sessionRegistry.disposeAll();
  }

  return { handle, start, stop, store, agentTick: tickAgents };
}
