/**
 * IICP Kanban — read the model directory from the live DSH `llm` service.
 *
 * Why this module exists: a team member's provider/model must be picked from the
 * providers and models the Host already has configured (accounts, adapters and
 * local endpoints change over time), never typed by hand. An empty provider and
 * model pair means "inherit the workspace": the member follows whatever default
 * model the Host currently runs (DSH `agentDefaultModel`), which is the same
 * selection a new session in this workspace would use.
 *
 * Both reads are lazy on purpose: the kanban service is constructed long before
 * the llm service is ready, so every call resolves the service again.
 */

/**
 * Resolve a DSH service: cordis injects services as properties (`ctx.llm`), and
 * `ctx.get(name)` is a second lookup path. Property access throws for services
 * that are not mounted on this Context proxy, hence the try/catch.
 */
export function resolveService(ctx, name) {
  try {
    const direct = ctx?.[name];
    if (direct !== undefined && direct !== null) return direct;
  } catch {
    /* not injected on this Context: fall back to ctx.get */
  }
  try {
    return ctx?.get?.(name);
  } catch {
    return undefined;
  }
}

/** Host default selection, shaped for the client; null when unavailable. */
function safeDefault(agentDefaultModel) {
  try {
    const selection = agentDefaultModel?.currentSelection?.();
    if (selection === null || typeof selection !== "object") return null;
    if (typeof selection.provider !== "string" || typeof selection.model !== "string") return null;
    if (selection.provider === "" || selection.model === "") return null;
    return { provider: selection.provider, model: selection.model };
  } catch {
    return null;
  }
}

function modelRows(models) {
  const seen = new Set();
  const rows = [];
  for (const model of Array.isArray(models) ? models : []) {
    if (model === null || typeof model !== "object") continue;
    const id = typeof model.id === "string" ? model.id : "";
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    const name = typeof model.name === "string" && model.name !== "" ? model.name : id;
    rows.push(name === id ? { id } : { id, name });
  }
  return rows;
}

/**
 * `{ok, defaultModel, providers:[{id,name?,models:[{id,name?}],modelCount}], providerCount, modelCount}`
 *
 * `ok:false` means the directory could not be read at all (llm service missing or
 * throwing); `ok:true` with an empty provider list means the Host really has no
 * providers configured. The client renders those two states differently.
 */
export async function buildModelCatalog(llm, agentDefaultModel) {
  const defaultModel = safeDefault(agentDefaultModel);
  if (llm === undefined || llm === null || typeof llm.listProviders !== "function") {
    return {
      ok: false,
      defaultModel,
      providers: [],
      providerCount: 0,
      modelCount: 0,
      error: { code: "E_RUNTIME_UNAVAILABLE", message: "the DSH llm service is unavailable" },
    };
  }
  let providers;
  try {
    providers = llm.listProviders();
  } catch (error) {
    return {
      ok: false,
      defaultModel,
      providers: [],
      providerCount: 0,
      modelCount: 0,
      error: { code: "E_MODEL_DIRECTORY", message: String(error?.message || error) },
    };
  }
  const rows = await Promise.all(
    (Array.isArray(providers) ? providers : []).map(async (provider) => {
      const id = typeof provider?.id === "string" ? provider.id : "";
      if (id === "") return null;
      const name = typeof provider?.name === "string" && provider.name !== "" ? provider.name : id;
      let models = [];
      let failed = "";
      try {
        models = modelRows(await llm.listModels(id));
      } catch (error) {
        failed = String(error?.message || error);
      }
      const row = { id, name, models, modelCount: models.length };
      // A provider whose models cannot be listed is kept: the member may still
      // carry a model id for it, and dropping it would silently rewrite data.
      if (failed) row.error = failed;
      return row;
    }),
  );
  const available = rows.filter((row) => row !== null);
  return {
    ok: true,
    defaultModel,
    providers: available,
    providerCount: available.length,
    modelCount: available.reduce((total, row) => total + row.models.length, 0),
  };
}
