/**
 * IICP Kanban — shared constants and clipping helpers.
 *
 * Split from domain.mjs so store.mjs can import without cycles.
 */

export const STATUSES = ["backlog", "in_progress", "blocked", "done"];
export const PRIORITIES = ["P0", "P1", "P2", "P3"];
export const MEMBER_ROLES = ["owner", "admin", "member", "guest"];
export const TASK_SOURCES = ["manual", "session"];

/** Agent rank inside the team: one lead drives many workers (v0.3). */
export const MEMBER_KINDS = ["lead", "worker"];
/** Runtime state of an agent member; the lead flips it on dispatch/report. */
export const MEMBER_STATUSES = ["idle", "working", "blocked"];
/** Acceptance gate: work done by someone else must be reviewed by the lead. */
export const REVIEW_STATUSES = ["none", "pending", "accepted", "changes"];
/** Execution queue state of a dispatched task ("" means not queued). */
export const AGENT_TASK_STATES = ["queued", "running"];
/** Why a member has no live agent session; "" means the host is usable. */
export const MEMBER_AGENT_STATES = ["unavailable"];

/** goal.status follows task.status (super-kanban semantics). */
export const GOAL_STATUSES = ["active", "done", "none"];
/** Who authored the goal: an agent session or the user's task form. */
export const GOAL_SOURCES = ["session", "task"];
/** Subtask origin: AI analysis, imported TODO plan, or manual user entry. */
export const SUBTASK_SOURCES = ["ai", "todo", "manual"];
/** Artifact kinds: the deliverable itself vs a file the agent touched. */
export const ARTIFACT_KINDS = ["deliverable", "modified"];
/** Fields an agent analysis must not overwrite when locked. */
export const LOCKABLE_FIELDS = [
  "title",
  "goal",
  "status",
  "progress",
  "priority",
  "tags",
  "notes",
  "subtasks",
  "artifacts",
  "dependsOn",
];

export const TEXT_LIMITS = Object.freeze({
  workspaceTitle: 80,
  projectName: 80,
  projectNotes: 600,
  projectDueDate: 10,
  memberName: 40,
  memberTitle: 60,
  memberContact: 80,
  memberPersonality: 200,
  memberProvider: 60,
  memberModel: 60,
  memberSkill: 20,
  memberSessionId: 200,
  agentSessionId: 200,
  taskTitle: 80,
  taskGoal: 280,
  taskAcceptance: 600,
  taskNotes: 280,
  taskDueDate: 10,
  subtaskText: 60,
  artifactName: 120,
  artifactPath: 260,
  tagName: 12,
  historyNote: 160,
});

export const LIST_LIMITS = Object.freeze({
  tagsPerTask: 4,
  historyPerTask: 20,
  subtasksPerTask: 12,
  artifactsPerTask: 10,
  dependsOnPerTask: 8,
  sessionsPerMember: 4,
  skillsPerMember: 8,
});

export function isStatus(value) {
  return STATUSES.includes(value);
}

export function isPriority(value) {
  return PRIORITIES.includes(value);
}

export function isMemberRole(value) {
  return MEMBER_ROLES.includes(value);
}

/** Agent rank: "lead" runs the team, "worker" does the tasks. */
export function isMemberKind(value) {
  return MEMBER_KINDS.includes(value);
}

/** idle = no claim, working = owns an in-flight task, blocked = asks the lead. */
export function isMemberStatus(value) {
  return MEMBER_STATUSES.includes(value);
}

export function isReviewStatus(value) {
  return REVIEW_STATUSES.includes(value);
}

export function isAgentTaskState(value) {
  return value === "" || AGENT_TASK_STATES.includes(value);
}

export function isMemberAgentState(value) {
  return value === "" || MEMBER_AGENT_STATES.includes(value);
}

/** Clip a text field to a max length; non-strings become "". */
export function clip(value, maxLength) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\r\n/g, "\n").trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

/**
 * Accept only a real YYYY-MM-DD date (rejects 2026-02-31 and friends).
 * Anything else becomes "" so the field simply disappears.
 */
export function normalizeDateOnly(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10) === text ? text : "";
}

/** Normalize goal into the super-kanban object shape; strings migrate in. */
export function normalizeGoal(value, { status = "done" } = {}) {
  // status here is the task status: a finished task keeps its goal "done".
  const fallbackStatus = status === "done" ? "done" : "active";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const text = clip(value.text, TEXT_LIMITS.taskGoal);
    let goalStatus = GOAL_STATUSES.includes(value.status) ? value.status : fallbackStatus;
    if (!text) goalStatus = "none";
    const source = GOAL_SOURCES.includes(value.source) ? value.source : "task";
    return { text, status: goalStatus, source };
  }
  const text = clip(typeof value === "string" ? value : "", TEXT_LIMITS.taskGoal);
  return { text, status: text ? fallbackStatus : "none", source: "task" };
}

/** Normalize one subtask entry; strings from old plans migrate as manual. */
export function normalizeSubtask(value, index) {
  let text = "";
  let done = false;
  let source = "ai";
  let id = "";
  if (typeof value === "string") {
    text = clip(value, TEXT_LIMITS.subtaskText);
    source = "manual";
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    text = clip(value.text, TEXT_LIMITS.subtaskText);
    done = value.done === true;
    source = SUBTASK_SOURCES.includes(value.source) ? value.source : "ai";
    id = typeof value.id === "string" ? value.id : "";
  }
  if (!text) return null;
  return { id: id || `s_${index + 1}`, text, done, source };
}

/** Normalize prerequisite ids: strings only, deduped, capped, order kept. */
export function normalizeDependsOn(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= LIST_LIMITS.dependsOnPerTask) break;
  }
  return out;
}

/** Normalize one artifact entry (deliverable path from an agent run). */
export function normalizeArtifact(value, index) {
  let name = "";
  let artifactPath = "";
  let kind = "deliverable";
  let time = 0;
  if (typeof value === "string") {
    artifactPath = clip(value, TEXT_LIMITS.artifactPath);
    name = artifactPath.split(/[\\/]/).pop() || artifactPath;
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    name = clip(value.name, TEXT_LIMITS.artifactName);
    artifactPath = clip(value.path, TEXT_LIMITS.artifactPath);
    kind = ARTIFACT_KINDS.includes(value.kind) ? value.kind : "deliverable";
    time = Number.isFinite(value.time) ? value.time : 0;
  }
  const id = value && typeof value === "object" && typeof value.id === "string" ? value.id : `a_${index + 1}`;
  if (!name && !artifactPath) return null;
  if (!name) name = artifactPath.split(/[\\/]/).pop() || artifactPath;
  return { id, name, path: artifactPath, kind, time };
}
