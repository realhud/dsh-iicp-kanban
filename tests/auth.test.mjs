/**
 * Tests: auth.mjs — fail-closed owner admission.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ownerAdmission } from "../server/auth.mjs";

function connectionWith(admitImpl) {
  return { admit: admitImpl };
}

test("owner principal is admitted", () => {
  const result = ownerAdmission(connectionWith(() => ({ peer: { principal: { kind: "owner" } } })), {});
  assert.deepEqual(result, { ok: true });
});

test("non-owner principal is rejected with 403", () => {
  const result = ownerAdmission(connectionWith(() => ({ peer: { principal: { kind: "member" } } })), {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("rejection shape is normalized", () => {
  const result = ownerAdmission(connectionWith(() => ({ rejection: 401 })), {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("out-of-range rejection falls back to 403", () => {
  const result = ownerAdmission(connectionWith(() => ({ rejection: 999 })), {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("missing admit function fails closed", () => {
  assert.equal(ownerAdmission({}, {}).ok, false);
  assert.equal(ownerAdmission(null, {}).ok, false);
});

test("admit throwing fails closed with error attached", () => {
  const result = ownerAdmission(
    connectionWith(() => {
      throw new Error("boom");
    }),
    {},
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.ok(result.error);
});

test("admit returning a non-object fails closed", () => {
  assert.equal(ownerAdmission(connectionWith(() => "owner"), {}).ok, false);
  assert.equal(ownerAdmission(connectionWith(() => null), {}).ok, false);
});
