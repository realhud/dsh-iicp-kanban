/**
 * IICP Kanban — domain constants (re-exported from limits.mjs).
 *
 * Single source of truth lives in limits.mjs; this module is the stable
 * import surface for the service layer.
 */

export {
  ARTIFACT_KINDS,
  GOAL_SOURCES,
  GOAL_STATUSES,
  LIST_LIMITS,
  LOCKABLE_FIELDS,
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
} from "./limits.mjs";
