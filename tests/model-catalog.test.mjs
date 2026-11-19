/**
 * Tests: the model directory the member form picks provider/model from.
 *
 * The directory always comes from the live DSH `llm` service, so these cases
 * drive it with fake llm/agentDefaultModel services instead of the Host.
 * An empty provider + model pair is the "inherit the workspace" state and must
 * survive a save/read round trip unchanged — it is a value, not a missing one.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { buildModelCatalog } from "../server/model-catalog.mjs";
import { createKanbanService } from "../server/service.mjs";

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

/** Run `fn(service)` against a throwaway DSH home and the given ctx. */
async function withService(fn, { ctx } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "iicp-kanban-models-"));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const service = createKanbanService({ ctx: ctx || { logger: { info() {}, warn() {} } } });
    service.start();
    return await fn(service, home);
  } finally {
    process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function fakeLlm(providers) {
  return {
    listProviders: () => providers.map(({ id, name }) => ({ id, name })),
    listModels: async (id) => {
      const row = providers.find((provider) => provider.id === id);
      if (row?.throws) throw new Error(`adapter ${id} is offline`);
      return row?.models || [];
    },
  };
}

test("/models degrades to available:false when the llm service is missing", async () => {
  await withService(async (service) => {
    const res = await call(service, "/models");
    // Not an HTTP error: the form must stay usable and fall back to free text.
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.available, false);
    assert.deepEqual(res.json.providers, []);
    assert.equal(res.json.defaultModel, null);
    assert.equal(res.json.error.code, "E_RUNTIME_UNAVAILABLE");
  });
});

test("/models lists every provider with its models and the host default", async () => {
  const ctx = {
    logger: { info() {}, warn() {} },
    llm: fakeLlm([
      { id: "deepseek", name: "DeepSeek", models: [{ id: "deepseek-v4.1-flash", name: "V4.1 Flash" }, { id: "deepseek-v4.1" }] },
      { id: "local", name: "Local", models: [{ id: "qwen3" }] },
    ]),
    agentDefaultModel: { currentSelection: () => ({ provider: "deepseek", model: "deepseek-v4.1-flash", reasoningEffort: "high" }) },
  };
  await withService(
    async (service) => {
      const res = await call(service, "/models");
      assert.equal(res.status, 200);
      assert.equal(res.json.available, true);
      assert.deepEqual(res.json.defaultModel, { provider: "deepseek", model: "deepseek-v4.1-flash" });
      assert.equal(res.json.providerCount, 2);
      assert.equal(res.json.modelCount, 3);
      const deepseek = res.json.providers.find((row) => row.id === "deepseek");
      assert.equal(deepseek.name, "DeepSeek");
      assert.equal(deepseek.modelCount, 2);
      // A model without a display name falls back to its id and drops `name`.
      assert.deepEqual(deepseek.models[1], { id: "deepseek-v4.1" });
    },
    { ctx },
  );
});

test("/models keeps a provider whose model list fails instead of hiding it", async () => {
  const ctx = {
    logger: { info() {}, warn() {} },
    llm: fakeLlm([
      { id: "broken", name: "Broken", throws: true },
      { id: "deepseek", models: [{ id: "deepseek-v4.1" }] },
    ]),
  };
  await withService(
    async (service) => {
      const res = await call(service, "/models");
      assert.equal(res.json.available, true);
      const broken = res.json.providers.find((row) => row.id === "broken");
      assert.ok(broken, "the provider row survives a listModels failure");
      assert.deepEqual(broken.models, []);
      assert.match(broken.error, /offline/);
    },
    { ctx },
  );
});

test("buildModelCatalog skips unusable rows and defaults name to id", async () => {
  const catalog = await buildModelCatalog(
    {
      listProviders: () => [{ id: "deepseek" }, { name: "no id" }, null, { id: "" }],
      listModels: async () => [{ id: "a", name: "A" }, { id: "a", name: "again" }, { name: "no id" }, { id: "b" }],
    },
    { currentSelection: () => null },
  );
  assert.equal(catalog.ok, true);
  assert.equal(catalog.defaultModel, null);
  assert.equal(catalog.providerCount, 1);
  assert.equal(catalog.providers[0].id, "deepseek");
  // `name` defaults to the id so it is omitted rather than duplicated.
  assert.equal(catalog.providers[0].name, "deepseek");
  assert.deepEqual(catalog.providers[0].models, [{ id: "a", name: "A" }, { id: "b" }]);
  assert.equal(catalog.modelCount, 2);
});

test("buildModelCatalog reports E_MODEL_DIRECTORY when listProviders throws", async () => {
  const catalog = await buildModelCatalog(
    {
      listProviders: () => {
        throw new Error("llm runtime not started");
      },
    },
    null,
  );
  assert.equal(catalog.ok, false);
  assert.equal(catalog.error.code, "E_MODEL_DIRECTORY");
  assert.match(catalog.error.message, /not started/);
});

test("an ignored default selection is reported as null, not as an empty model", async () => {
  const cases = [
    { currentSelection: () => ({ provider: "", model: "" }) },
    { currentSelection: () => ({ provider: "deepseek" }) },
    { currentSelection: () => ({ provider: 1, model: "x" }) },
    {
      currentSelection: () => {
        throw new Error("config editor missing");
      },
    },
  ];
  for (const agentDefaultModel of cases) {
    const catalog = await buildModelCatalog({ listProviders: () => [], listModels: async () => [] }, agentDefaultModel);
    assert.equal(catalog.defaultModel, null);
    assert.equal(catalog.ok, true);
    assert.deepEqual(catalog.providers, []);
  }
});

test("empty provider and model survive a save and read back as inherit", async () => {
  await withService(async (service) => {
    const created = await call(service, "/member.create", { method: "POST", body: { name: "墨渊", provider: "", model: "" } });
    assert.equal(created.status, 200);
    assert.equal(created.json.member.provider, "");
    assert.equal(created.json.member.model, "");

    const state = await call(service, "/state");
    const stored = state.json.members.find((member) => member.id === created.json.member.id);
    assert.equal(stored.provider, "");
    assert.equal(stored.model, "");
  });
});

test("an explicit provider/model pair is stored untouched", async () => {
  await withService(async (service) => {
    const created = await call(service, "/member.create", {
      method: "POST",
      body: { name: "墨渊", provider: "deepseek", model: "deepseek-v4.1-flash" },
    });
    assert.equal(created.json.member.provider, "deepseek");
    assert.equal(created.json.member.model, "deepseek-v4.1-flash");

    const updated = await call(service, "/member.update", {
      method: "POST",
      body: { id: created.json.member.id, provider: "local", model: "qwen3" },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.member.provider, "local");
    assert.equal(updated.json.member.model, "qwen3");
  });
});
