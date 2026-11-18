/**
 * IICP Kanban — DSH workspace discovery (read-only).
 *
 * Reads $DSH_HOME/storages/workspace.json to list known workspaces. Never
 * writes; failures degrade to an empty list so the board keeps working with
 * manually-assigned workspaces.
 */

import fs from "node:fs";
import path from "node:path";

import { TEXT_LIMITS, clip } from "./limits.mjs";

/**
 * @param {{dshHome: string, logger?: object}} options
 * @returns {{list(): Array<{id,title,path,source}>}}
 */
export function createWorkspaceSource({ dshHome, logger } = {}) {
  if (!dshHome) throw new Error("createWorkspaceSource requires dshHome");
  const file = path.join(dshHome, "storages", "workspace.json");

  function list() {
    try {
      if (!fs.existsSync(file)) return [];
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      return normalizeWorkspaces(parsed);
    } catch (error) {
      logger?.warn?.(`[iicp-kanban] workspace discovery failed: ${String(error?.message || error)}`);
      return [];
    }
  }

  return { list };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Accept a few known shapes of DSH workspace.json and emit normalized rows. */
export function normalizeWorkspaces(parsed) {
  let entries = [];
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (Array.isArray(parsed?.workspaces)) {
    entries = parsed.workspaces;
  } else if (isPlainObject(parsed?.tables?.workspaces)) {
    // Live DSH layout: registries live under tables; only the workspace table
    // describes workspaces, so other tables must not leak in as fake rows.
    entries = Object.entries(parsed.tables.workspaces).map(([id, value]) => ({
      id,
      ...(value && typeof value === "object" ? value : {}),
    }));
  } else if (isPlainObject(parsed?.workspaces)) {
    entries = Object.entries(parsed.workspaces).map(([id, value]) => ({
      id,
      ...(value && typeof value === "object" ? value : {}),
    }));
  } else if (parsed && typeof parsed === "object") {
    // Legacy map of id -> {path,title,...}
    entries = Object.entries(parsed).map(([id, value]) => ({ id, ...(value && typeof value === "object" ? value : {}) }));
  }
  const out = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" && entry.id ? entry.id : "";
    const cwd = typeof entry.cwd === "string" ? entry.cwd : typeof entry.path === "string" ? entry.path : "";
    if (!id && !cwd) continue;
    out.push({
      id: id || cwd,
      title: clip(entry.title || entry.name || path.basename(cwd || id), TEXT_LIMITS.workspaceTitle),
      path: cwd,
      source: "registry",
    });
  }
  return out;
}
