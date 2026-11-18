/**
 * IICP Kanban — persistence (state.json).
 *
 * Atomic writes (tmp + rename), corruption recovery, and shape migration.
 * Layout: $DSH_HOME/storages/iicp-kanban/state.json
 */

import fs from "node:fs";
import path from "node:path";

import {
  LIST_LIMITS,
  LOCKABLE_FIELDS,
  MEMBER_KINDS,
  MEMBER_ROLES,
  MEMBER_STATUSES,
  PRIORITIES,
  REVIEW_STATUSES,
  STATUSES,
  TEXT_LIMITS,
  clip,
  normalizeArtifact,
  normalizeDateOnly,
  normalizeGoal,
  normalizeSubtask,
} from "./limits.mjs";

const STATE_VERSION = 1;

/** Build an empty board state with sane defaults. */
export function emptyState() {
  return {
    version: STATE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workspaces: [], // discovered from DSH workspace.json; inclusion flags live here
    projects: [],
    members: [],
    tasks: [],
    settings: {
      defaultAssigneeId: "",
      showArchived: false,
    },
    counters: { task: 0 },
  };
}

/**
 * Create the store bound to a DSH home directory.
 * @param {{dshHome: string, logger?: object}} options
 */
export function createStore({ dshHome, logger } = {}) {
  if (!dshHome) throw new Error("createStore requires dshHome");
  const dir = path.join(dshHome, "storages", "iicp-kanban");
  const file = path.join(dir, "state.json");
  let state = null;

  function log(level, message) {
    try {
      logger?.[level]?.(`[iicp-kanban] ${message}`);
    } catch {
      /* logging must never break the store */
    }
  }

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** Load state from disk, or fall back to a fresh state. */
  function load() {
    ensureDir();
    if (state) return state;
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, "utf8");
        state = migrate(JSON.parse(raw));
        log("info", `state loaded (${state.tasks.length} tasks, ${state.members.length} members)`);
        return state;
      }
    } catch (error) {
      // Corrupt state must not brick the plugin: back it up and start fresh.
      const backup = `${file}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(file, backup);
        log("warn", `state.json corrupted, backed up to ${backup}: ${String(error?.message || error)}`);
      } catch {
        log("warn", `state.json corrupted and could not be backed up: ${String(error?.message || error)}`);
      }
    }
    state = emptyState();
    save();
    return state;
  }

  /** Persist the current state atomically. */
  function save() {
    if (!state) return;
    ensureDir();
    state.updatedAt = new Date().toISOString();
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
      fs.renameSync(tmp, file);
    } catch (error) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* best effort cleanup */
      }
      throw error;
    }
  }

  return {
    get file() {
      return file;
    },
    get state() {
      return load();
    },
    save,
    /** Test hook: replace in-memory state. */
    _setState(next) {
      state = migrate(next);
    },
  };
}

/**
 * Normalize + migrate any older/partial state shape into the current one.
 * Unknown fields are dropped; invalid values fall back to defaults.
 */
export function migrate(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;

  const state = base;
  if (Array.isArray(raw.workspaces)) state.workspaces = raw.workspaces.map(normalizeWorkspace).filter(Boolean);
  if (Array.isArray(raw.projects)) state.projects = raw.projects.map(normalizeProject).filter(Boolean);
  if (Array.isArray(raw.members)) state.members = raw.members.map(normalizeMember).filter(Boolean);
  if (Array.isArray(raw.tasks)) state.tasks = raw.tasks.map(normalizeTask).filter(Boolean);
  if (raw.settings && typeof raw.settings === "object") {
    const allowed = new Set(Object.keys(base.settings));
    for (const key of Object.keys(raw.settings)) {
      if (!allowed.has(key)) continue;
      state.settings[key] = raw.settings[key];
    }
  }
  if (raw.counters && typeof raw.counters === "object") {
    state.counters = { ...base.counters, ...raw.counters };
  }
  if (typeof raw.createdAt === "string") state.createdAt = raw.createdAt;
  state.updatedAt = new Date().toISOString();
  return state;
}

function normalizeWorkspace(raw) {
  if (!raw || typeof raw !== "object") return null;
  const workspace = {
    id: String(raw.id ?? ""),
    title: clip(raw.title, TEXT_LIMITS.workspaceTitle),
    path: typeof raw.path === "string" ? raw.path : "",
    included: raw.included !== false,
    source: raw.source === "discovered" ? "discovered" : "registry",
    sessionCount: Number.isInteger(raw.sessionCount) ? raw.sessionCount : 0,
    lastActivityAt: Number.isFinite(raw.lastActivityAt) ? raw.lastActivityAt : 0,
  };
  return workspace.id ? workspace : null;
}

function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const project = {
    id: String(raw.id ?? ""),
    name: clip(raw.name, TEXT_LIMITS.projectName),
    notes: clip(raw.notes, TEXT_LIMITS.projectNotes),
    dueDate: normalizeDateOnly(raw.dueDate),
    workspaceId: typeof raw.workspaceId === "string" ? raw.workspaceId : "",
    archived: raw.archived === true,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
  return project.id && project.name ? project : null;
}

function normalizeMember(raw) {
  if (!raw || typeof raw !== "object") return null;
  const role = MEMBER_ROLES.includes(raw.role) ? raw.role : "member";
  // v0.3 team model: every member is either the team lead or a worker.
  // Legacy member lists (pre-0.3) had no kind; they migrate as workers, and
  // the service promotes/settles the lead so old data keeps working.
  const kind = MEMBER_KINDS.includes(raw.kind) ? raw.kind : "worker";
  const status = MEMBER_STATUSES.includes(raw.status) ? raw.status : "idle";
  const member = {
    id: String(raw.id ?? ""),
    name: clip(raw.name, TEXT_LIMITS.memberName),
    title: clip(raw.title, TEXT_LIMITS.memberTitle),
    contact: clip(raw.contact, TEXT_LIMITS.memberContact),
    role,
    kind,
    leadId: typeof raw.leadId === "string" ? raw.leadId : "",
    personality: clip(raw.personality, TEXT_LIMITS.memberPersonality),
    skills: Array.isArray(raw.skills)
      ? raw.skills
          .map((skill) => clip(skill, TEXT_LIMITS.memberSkill))
          .filter(Boolean)
          .slice(0, LIST_LIMITS.skillsPerMember)
      : [],
    provider: clip(raw.provider, TEXT_LIMITS.memberProvider),
    model: clip(raw.model, TEXT_LIMITS.memberModel),
    status,
    sessionId: clip(raw.sessionId, TEXT_LIMITS.memberSessionId),
    archived: raw.archived === true,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
  return member.id && member.name ? member : null;
}

function normalizeTask(raw) {
  if (!raw || typeof raw !== "object") return null;
  const status = STATUSES.includes(raw.status) ? raw.status : "backlog";
  const task = {
    id: String(raw.id ?? ""),
    title: clip(raw.title, TEXT_LIMITS.taskTitle),
    // v2 model: goal is an object {text, status, source} tied to task.status.
    goal: normalizeGoal(raw.goal, { status }),
    acceptanceCriteria: clip(raw.acceptanceCriteria, TEXT_LIMITS.taskAcceptance),
    notes: clip(raw.notes, TEXT_LIMITS.taskNotes),
    dueDate: clip(raw.dueDate, TEXT_LIMITS.taskDueDate),
    status,
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : "P2",
    tags: Array.isArray(raw.tags)
      ? raw.tags.slice(0, LIST_LIMITS.tagsPerTask).map((tag) => clip(tag, TEXT_LIMITS.tagName)).filter(Boolean)
      : [],
    workspaceId: typeof raw.workspaceId === "string" ? raw.workspaceId : "",
    projectId: typeof raw.projectId === "string" ? raw.projectId : "",
    assigneeId: typeof raw.assigneeId === "string" ? raw.assigneeId : "",
    origin: raw.origin === "session" ? "session" : "manual",
    sourceSessionId: typeof raw.sourceSessionId === "string" ? raw.sourceSessionId : "",
    pinned: raw.pinned === true,
    archived: raw.archived === true,
    progress: clampProgress(raw.progress),
    subtasks: Array.isArray(raw.subtasks)
      ? raw.subtasks
          .slice(0, LIST_LIMITS.subtasksPerTask)
          .map((item, index) => normalizeSubtask(item, index))
          .filter(Boolean)
      : [],
    artifacts: Array.isArray(raw.artifacts)
      ? raw.artifacts
          .slice(0, LIST_LIMITS.artifactsPerTask)
          .map((item, index) => normalizeArtifact(item, index))
          .filter(Boolean)
      : [],
    lockedFields: Array.isArray(raw.lockedFields)
      ? [...new Set(raw.lockedFields.filter((field) => LOCKABLE_FIELDS.includes(field)))]
      : [],
    // v0.3 lead/worker gate: a worker's submission waits for the lead's verdict.
    reviewStatus: REVIEW_STATUSES.includes(raw.reviewStatus) ? raw.reviewStatus : "none",
    reviewNote: clip(raw.reviewNote, TEXT_LIMITS.historyNote),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    history: Array.isArray(raw.history) ? raw.history.slice(-LIST_LIMITS.historyPerTask) : [],
  };
  return task.id && task.title ? task : null;
}

/** Clamp progress to 0-100 integer; null/absent stays null (manual progress). */
function clampProgress(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, Math.round(number)));
}

/** Generate a stable task id (t_ + 8 hex chars). */
export function newTaskId(counters) {
  counters.task = (counters.task || 0) + 1;
  const hex = Date.now().toString(16).slice(-6) + counters.task.toString(16).padStart(2, "0");
  return `t_${hex}${Math.floor(Math.random() * 16).toString(16)}`;
}

/** Generate ids for members/projects (prefix + 8 random chars). */
export function newId(prefix) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}_${out}`;
}
