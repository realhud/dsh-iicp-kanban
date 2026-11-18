/**
 * IICP Kanban — HTTP protocol/payload helpers.
 *
 * Small, dependency-free request/response utilities shared by the service
 * router: JSON replies, bounded body reads, id/text validation.
 */

/** Send a JSON body with a status code; never throws into the caller. */
export function json(res, status, body) {
  try {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  } catch {
    /* socket already closed */
  }
}

export function badRequest(message) {
  const error = new Error(message || "bad request");
  error.statusCode = 400;
  error.code = "invalid-input";
  return error;
}

export function notFound(message) {
  const error = new Error(message || "not found");
  error.statusCode = 404;
  error.code = "not-found";
  return error;
}

export function conflict(message) {
  const error = new Error(message || "conflict");
  error.statusCode = 409;
  error.code = "conflict";
  return error;
}

/** Read a request body as a UTF-8 string with a hard size cap. */
export function readBody(req, { limitBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(badRequest("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Parse a JSON body; returns undefined on empty input. */
export async function readJsonBody(req, options) {
  const raw = await readBody(req, options);
  if (!raw || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("invalid JSON body");
  }
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Validate a plugin-generated or user-supplied id. */
export function validId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

const TEXT_LIMIT_DEFAULT = 200;

/** Clip a text field to a max length; non-strings become "". */
export function clipText(value, maxLength = TEXT_LIMIT_DEFAULT) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\r\n/g, "\n").trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

/** True when every element of the array is a string. */
export function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
