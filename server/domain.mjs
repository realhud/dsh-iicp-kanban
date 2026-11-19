/**
 * IICP Kanban — domain constants (re-exported from limits.mjs).
 *
 * Single source of truth lives in limits.mjs; this module is the stable
 * import surface for the service layer.
 */

export {
  AGENT_TASK_STATES,
  ARTIFACT_KINDS,
  GOAL_SOURCES,
  GOAL_STATUSES,
  LIST_LIMITS,
  LOCKABLE_FIELDS,
  MEMBER_AGENT_STATES,
  MEMBER_KINDS,
  MEMBER_ROLES,
  MEMBER_STATUSES,
  PRIORITIES,
  REVIEW_STATUSES,
  STATUSES,
  SUBTASK_SOURCES,
  TASK_SOURCES,
  TEXT_LIMITS,
  clip,
  isAgentTaskState,
  isMemberAgentState,
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
} from "./limits.mjs";
