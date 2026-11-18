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
  normalizeGoal,
  normalizeSubtask,
} from "./domain.mjs";
import { badRequest, clipText, conflict, isStringArray, json, notFound, readJsonBody, validId } from "./http.mjs";
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
  function refreshMemberStatus(state, member) {
    if (!member || member.kind !== "worker") return;
    const tasks = state.tasks.filter((task) => !task.archived && task.assigneeId === member.id);
    const next = tasks.some((task) => task.status === "blocked")
      ? "blocked"
      : tasks.some((task) => task.status === "in_progress" || task.status === "backlog")
        ? "working"
        : "idle";
    if (member.status !== next) member.status = next;
  }

  /** Refresh every member (called after task mutations touch assignment). */
  function refreshTeam(state) {
    for (const member of liveMembers(state)) refreshMemberStatus(state, member);
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
    if (members.length > 0 && !findLead(state)) {
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
          // Stepping down: workers keep running, just orphaned until a new lead.
          member.kind = "worker";
          member.leadId = "";
          for (const worker of liveMembers(state)) {
            if (worker.leadId === member.id) worker.leadId = "";
          }
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
    if (route === "/member.dispatch" && method === "POST") {
      // Lead hands a task to a worker: assignment + claim in one step.
      const body = await readJsonBody(req);
      requireObject(body);
      const task = findTask(state, body.taskId);
      if (!task) throw notFound(`task not found: ${body.taskId}`);
      const worker = findMember(state, typeof body.memberId === "string" ? body.memberId : "");
      if (!worker) throw badRequest(`assignee not found: ${body.memberId}`);
      const leadId = typeof body.leadId === "string" ? body.leadId : "";
      const lead = leadId ? findMember(state, leadId) : findLead(state);
      if (lead && lead.kind !== "lead") throw badRequest(`member is not a lead: ${lead.id}`);
      if (lead && worker.kind === "lead" && worker.id !== lead.id) {
        throw badRequest("队长不能把任务派给自己以外的队长");
      }
      const fromStatus = task.status;
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
      store.save();
      json(res, 200, { ok: true, task, member: worker });
      return;
    }
    if (route === "/member.report" && method === "POST") {
      // Worker submits finished work; the lead decides, so it never lands as done.
      const body = await readJsonBody(req);
      requireObject(body);
      const task = findTask(state, body.taskId);
      if (!task) throw notFound(`task not found: ${body.taskId}`);
      const member = findMember(state, typeof body.memberId === "string" ? body.memberId : "");
      if (!member) throw badRequest(`member not found: ${body.memberId}`);
      if (task.assigneeId && task.assigneeId !== member.id) {
        throw badRequest(`任务属于 ${task.assigneeId}，${member.name} 无法回报`);
      }
      if (task.reviewStatus === "pending") throw conflict("该任务已提交验收，等待队长处理");
      const note = clipText(body.note, TEXT_LIMITS.historyNote);
      if (Array.isArray(body.subtasks)) task.subtasks = normalizeSubtaskList(body.subtasks);
      if (Array.isArray(body.artifacts)) task.artifacts = normalizeArtifactList(body.artifacts);
      task.assigneeId = member.id;
      task.reviewStatus = "pending";
      task.reviewNote = note;
      if (task.status === "blocked" || task.status === "backlog") task.status = "in_progress";
      syncGoalStatus(task);
      syncProgress(task);
      task.updatedAt = now();
      addHistory(task, "review", `${member.name} 提交验收${note ? `：${note}` : ""}`);
      refreshMemberStatus(state, member);
      store.save();
      json(res, 200, { ok: true, task });
      return;
    }
    if (route === "/member.review" && method === "POST") {
      // The lead accepts (done) or sends it back (in_progress + changes).
      const body = await readJsonBody(req);
      requireObject(body);
      if (!isReviewStatus(body.decision) || body.decision === "none") {
        throw badRequest(`invalid decision: ${body.decision}`);
      }
      const task = findTask(state, body.taskId);
      if (!task) throw notFound(`task not found: ${body.taskId}`);
      if (task.reviewStatus !== "pending") throw conflict("该任务没有待验收的提交");
      const reviewer = typeof body.leadId === "string" && body.leadId ? findMember(state, body.leadId) : findLead(state);
      if (!reviewer) throw badRequest("团队没有队长，无法验收");
      if (reviewer.kind !== "lead") throw badRequest(`member is not a lead: ${reviewer.id}`);
      // The doer never accepts their own work.
      if (task.assigneeId && task.assigneeId === reviewer.id) {
        throw badRequest("自己完成的任务不能自己验收，请移交队长");
      }
      const note = clipText(body.note, TEXT_LIMITS.historyNote);
      const assignee = task.assigneeId ? findMember(state, task.assigneeId) : null;
      if (body.decision === "accepted") {
        task.reviewStatus = "accepted";
        task.reviewNote = note;
        task.status = "done";
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
      json(res, 200, { ok: true, task });
      return;
    }

    /* ---- tasks ---- */
    if (route === "/task.create" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const title = clipText(body.title, TEXT_LIMITS.taskTitle);
      if (!title) throw badRequest("task title is required");
      const status = body.status === undefined ? "backlog" : body.status;
      if (!isStatus(status)) throw badRequest(`invalid status: ${status}`);
      const priority = body.priority === undefined ? "P2" : body.priority;
      if (!isPriority(priority)) throw badRequest(`invalid priority: ${priority}`);
      const subtasks = normalizeSubtaskList(body.subtasks);
      const task = {
        id: newTaskId(state.counters),
        title,
        // v2 model: goal object tied to task.status; agent sessions pass source:"session".
        goal: normalizeGoal(body.goal, { status: status === "done" ? "done" : "backlog" }),
        acceptanceCriteria: clipText(body.acceptanceCriteria, TEXT_LIMITS.taskAcceptance),
        notes: clipText(body.notes, TEXT_LIMITS.taskNotes),
        dueDate: clipText(body.dueDate, TEXT_LIMITS.taskDueDate),
        status,
        priority,
        tags: normalizeTags(body.tags),
        workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "",
        projectId: assertProject(state, typeof body.projectId === "string" ? body.projectId : ""),
        assigneeId: assertAssignee(state, typeof body.assigneeId === "string" ? body.assigneeId : ""),
        origin: body.origin === "session" ? "session" : "manual",
        sourceSessionId: typeof body.sourceSessionId === "string" ? clipText(body.sourceSessionId, 200) : "",
        pinned: false,
        archived: false,
        progress: null, // derived below (subtasks → ratio, else status default)
        subtasks,
        artifacts: normalizeArtifactList(body.artifacts),
        lockedFields: normalizeLockedFields(body.lockedFields),
        reviewStatus: "none",
        reviewNote: "",
        createdAt: now(),
        updatedAt: now(),
        history: [],
      };
      syncGoalStatus(task);
      syncProgress(task);
      settleReviewOnStatus(state, task);
      addHistory(task, "create", "创建任务");
      state.tasks.push(task);
      refreshTeam(state);
      store.save();
      json(res, 200, { ok: true, task });
      return;
    }
    if (route === "/task.update" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const task = findTask(state, body.id);
      if (!task) throw notFound(`task not found: ${body.id}`);
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
        // Partial goal object update: merge with current text/source defaults.
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
      if (body.status !== undefined && body.status !== task.status) {
        if (!isStatus(body.status)) throw badRequest(`invalid status: ${body.status}`);
        const from = task.status;
        task.status = body.status;
        changes.push(`状态 ${from} → ${body.status}`);
        addHistory(task, "status", `状态变更`, { from, to: body.status });
        // super-kanban semantics: moving to done closes unfinished generated
        // (non-manual, non-locked) subtasks so progress stays self-consistent.
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
        // A hand-off invalidates any pending submission from the old owner.
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
        refreshTeam(state);
        store.save();
      }
      json(res, 200, { ok: true, task, changed: changes.length > 0 });
      return;
    }
    if (route === "/task.delete" && method === "POST") {
      const body = await readJsonBody(req);
      requireObject(body);
      const index = state.tasks.findIndex((t) => t.id === body.id);
      if (index < 0) throw notFound(`task not found: ${body.id}`);
      const [removed] = state.tasks.splice(index, 1);
      refreshTeam(state);
      store.save();
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
      if (body.status !== task.status) {
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
        if (autoClosed > 0) addHistory(task, "subtask", `任务完成，自动关闭 ${autoClosed} 个生成子任务`);
        refreshTeam(state);
        store.save();
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
    const tasks = state.tasks.map((task) => ({
      ...task,
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
    return () => {};
  }

  function stop() {}

  return { handle, start, stop, store };
}
