/**
 * IICP Kanban — agent session registry.
 *
 * One live DSH session per member × workspace (design D2). The registry owns
 * only the session lifecycle: create / resume / rebuild, permission pinning,
 * role tools, transcript buffering, and disposal. Board mutations stay in
 * service.mjs; this module calls back through the `hooks` it is given.
 *
 * Sessions are root sessions (D1): no parentSession, so the host's subagent
 * archived-session gate never applies. The lead's planning conversation is
 * simply the lead member's session in the default workspace.
 */

import path from "node:path";

import { newId } from "./store.mjs";
import { resolveService } from "./model-catalog.mjs";

export const PERMISSION_PRESET = "workspace-write";
export const TRANSCRIPT_LIMIT = 80;
const BUFFER_LIMIT = 200;

function sessionKey(memberId, workspaceId) {
  return `${memberId}:${workspaceId || ""}`;
}

/** Flatten one message's text blocks for the chat drawer. */
function messageText(message) {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter((block) => block && (block.type === "text" || block.type === "tool-call"))
    .map((block) => (block.type === "text" ? block.text : `【工具】${block.name || "tool"}`))
    .join("");
}

export function createSessionRegistry({ ctx, logger, store, hooks }) {
  /** key -> {memberId, workspaceId, sessionId, handle, agent} */
  const live = new Map();
  /** sessionId -> record (live only) */
  const bySession = new Map();
  /** sessionId -> chat entries when no live session is available */
  const buffers = new Map();
  /** sessionId -> {role, text} currently streaming */
  const streaming = new Map();
  /** subscriber callbacks: {sessionId, send} */
  const subscribers = new Set();
  let listening = false;

  function agents() {
    const service = resolveService(ctx, "agents");
    return service && typeof service.create === "function" ? service : null;
  }

  function available() {
    return Boolean(agents());
  }

  function emit(sessionId, payload) {
    for (const sub of subscribers) {
      if (sub.sessionId && sub.sessionId !== sessionId) continue;
      try {
        sub.send(payload);
      } catch {
        /* a broken SSE client must not break the agent */
      }
    }
  }

  function pushBuffer(sessionId, entry) {
    let list = buffers.get(sessionId);
    if (!list) {
      list = [];
      buffers.set(sessionId, list);
    }
    list.push(entry);
    if (list.length > BUFFER_LIMIT) list.splice(0, list.length - BUFFER_LIMIT);
  }

  function listen() {
    if (listening || typeof ctx?.on !== "function") return;
    listening = true;
    ctx.on("agent/assistant-stream", (payload) => {
      const agent = payload?.agent;
      const sessionId = agent?.session?.id;
      const frame = payload?.frame;
      if (!sessionId || !frame) return;
      if (frame.type === "start") {
        streaming.set(sessionId, { role: "assistant", text: "" });
        emit(sessionId, { type: "assistant-start" });
        return;
      }
      if (frame.type === "chunk") {
        if (frame.chunk?.type !== "text-delta" || !frame.chunk.text) return;
        const current = streaming.get(sessionId) || { role: "assistant", text: "" };
        current.text += frame.chunk.text;
        streaming.set(sessionId, current);
        emit(sessionId, { type: "chunk", text: frame.chunk.text });
        return;
      }
      if (frame.type === "end") {
        const current = streaming.get(sessionId);
        streaming.delete(sessionId);
        if (current && current.text) pushBuffer(sessionId, { ...current, at: Date.now() });
        emit(sessionId, { type: "assistant-end" });
      }
    });
    ctx.on("agent/status", (payload) => {
      const sessionId = payload?.agent?.session?.id;
      if (!sessionId) return;
      emit(sessionId, { type: "status", status: payload.status });
    });
  }

  function workspaceCwd(workspaceId) {
    let resolved = "";
    try {
      resolved = hooks.workspacePath?.(workspaceId) || "";
    } catch {
      resolved = "";
    }
    return resolved && path.isAbsolute(resolved) ? resolved : process.cwd();
  }

  function agentOptionsFor(member) {
    const options = {};
    if (member.provider) options.provider = member.provider;
    if (member.model) options.model = member.model;
    return options;
  }

  /** Persist the workspace → session mapping and enforce the LRU cap. */
  function remember(member, workspaceId, sessionId) {
    member.sessions = member.sessions && typeof member.sessions === "object" ? member.sessions : {};
    if (member.sessions[workspaceId] !== sessionId) {
      delete member.sessions[workspaceId];
      member.sessions[workspaceId] = sessionId;
    }
    const entries = Object.entries(member.sessions);
    if (entries.length > 4) {
      for (const [oldWorkspace, oldSession] of entries.slice(0, entries.length - 4)) {
        delete member.sessions[oldWorkspace];
        drop(member.id, oldWorkspace, oldSession);
      }
    }
    hooks.onSessionChanged?.(member, workspaceId, sessionId);
  }

  function adopt(member, workspaceId, sessionId, handle) {
    const record = { memberId: member.id, workspaceId, sessionId, handle, agent: handle.agent };
    live.set(sessionKey(member.id, workspaceId), record);
    bySession.set(sessionId, record);
    remember(member, workspaceId, sessionId);
    listen();
    return record;
  }

  /** Evict one live handle without touching member.sessions (caller already did). */
  function drop(memberId, workspaceId, sessionId) {
    const key = sessionKey(memberId, workspaceId);
    const record = live.get(key);
    if (!record) return;
    live.delete(key);
    bySession.delete(record.sessionId);
    Promise.resolve(record.handle.dispose()).catch((error) => {
      logger?.warn?.(`[iicp-kanban] dispose failed: ${String(error?.message || error)}`);
    });
  }

  function dispose(memberId, workspaceId, sessionId) {
    const key = sessionKey(memberId, workspaceId);
    const record = live.get(key);
    if (!record) return Promise.resolve();
    live.delete(key);
    bySession.delete(record.sessionId);
    if (memberId && store?.state) {
      const member = store.state.members.find((entry) => entry.id === memberId);
      if (member?.sessions && member.sessions[workspaceId] === sessionId) {
        delete member.sessions[workspaceId];
        hooks.onSessionChanged?.(member, workspaceId, "");
      }
    }
    return Promise.resolve(record.handle.dispose()).catch((error) => {
      logger?.warn?.(`[iicp-kanban] dispose failed: ${String(error?.message || error)}`);
    });
  }

  function buildSetup(member) {
    return (agentCtx, agent) => {
      try {
        agentCtx.get("permissionPresets")?.set(agent.session, PERMISSION_PRESET);
      } catch (error) {
        logger?.warn?.(`[iicp-kanban] permission preset failed: ${String(error?.message || error)}`);
      }
      try {
        agentCtx.systemPrompt?.section({
          name: `iicp-kanban-role-${member.id}`,
          order: 900,
          text: hooks.promptFor?.(member) || "",
        });
      } catch (error) {
        logger?.warn?.(`[iicp-kanban] prompt section failed: ${String(error?.message || error)}`);
      }
      for (const tool of hooks.toolsFor?.(member) || []) {
        try {
          agentCtx.tools.register(tool);
        } catch (error) {
          logger?.warn?.(`[iicp-kanban] tool ${tool?.name} registration failed: ${String(error?.message || error)}`);
        }
      }
    };
  }

  /**
   * Reuse the mapped session, else create one; a failed resume rebuilds the
   * session and reports `rebuilt` so the caller can re-send the brief.
   * Returns {record, rebuilt} or {error} — never throws.
   */
  async function ensureSession(member, workspaceId) {
    if (!member) return { error: "member not found" };
    const service = agents();
    if (!service) return { error: "agents service unavailable" };
    const key = sessionKey(member.id, workspaceId || "");
    const existing = live.get(key);
    if (existing) return { record: existing, rebuilt: false };

    const sessionId = (member.sessions && member.sessions[workspaceId || ""]) || "";
    const setup = buildSetup(member);
    const agentOptions = agentOptionsFor(member);
    const cwd = workspaceCwd(workspaceId);
    if (sessionId) {
      try {
        const handle = await service.resume({ resumeSessionId: sessionId, agentOptions, setup });
        return { record: adopt(member, workspaceId || "", sessionId, handle), rebuilt: false };
      } catch (error) {
        logger?.warn?.(`[iicp-kanban] resume failed (${member.name}/${workspaceId || "default"}): ${String(error?.message || error)}`);
      }
    }
    try {
      const nextId = newId("s");
      const handle = await service.create({
        sessionId: nextId,
        meta: { cwd },
        agentOptions,
        setup,
      });
      return { record: adopt(member, workspaceId || "", nextId, handle), rebuilt: Boolean(sessionId) };
    } catch (error) {
      logger?.warn?.(`[iicp-kanban] create failed (${member.name}): ${String(error?.message || error)}`);
      return { error: String(error?.message || error) };
    }
  }

  async function deliver(record, text) {
    if (!record?.agent) return false;
    const sessionId = record.sessionId;
    pushBuffer(sessionId, { role: "user", text, at: Date.now() });
    emit(sessionId, { type: "user", text });
    try {
      await record.agent.followup({
        id: newId("u"),
        role: "user",
        content: [{ type: "text", text }],
        source: { kind: "user" },
      });
      return true;
    } catch (error) {
      logger?.warn?.(`[iicp-kanban] followup failed: ${String(error?.message || error)}`);
      return false;
    }
  }

  /** Live session log first, buffered chat second. */
  function transcript(sessionId) {
    const record = bySession.get(sessionId);
    const log = record?.agent?.session?.log;
    if (Array.isArray(log)) {
      const out = [];
      for (const event of log) {
        if (event?.type === "user/message") {
          const text = messageText(event.data);
          if (text) out.push({ role: "user", text, at: event.time });
        } else if (event?.type === "assistant/message") {
          const text = messageText(event.data?.message);
          if (text) out.push({ role: "assistant", text, at: event.time });
        }
      }
      return out.slice(-TRANSCRIPT_LIMIT);
    }
    return (buffers.get(sessionId) || []).slice(-TRANSCRIPT_LIMIT);
  }

  function subscribe(sessionId, send) {
    const sub = { sessionId, send };
    subscribers.add(sub);
    return () => subscribers.delete(sub);
  }

  async function disposeMember(memberId) {
    const records = [...live.values()].filter((record) => record.memberId === memberId);
    await Promise.all(records.map((record) => dispose(memberId, record.workspaceId, record.sessionId)));
  }

  async function disposeAll() {
    await Promise.all([...live.values()].map((record) => dispose(record.memberId, record.workspaceId, record.sessionId)));
  }

  return {
    available,
    ensureSession,
    deliver,
    transcript,
    subscribe,
    disposeMember,
    disposeAll,
    get: (memberId, workspaceId) => live.get(sessionKey(memberId, workspaceId || "")) || null,
    bySessionId: (sessionId) => bySession.get(sessionId) || null,
  };
}
