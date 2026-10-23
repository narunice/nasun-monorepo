/**
 * Classification of recycled-connection failures, which the HTTP error handler
 * answers with 503 + Retry-After instead of 500.
 *
 * Run with:
 *   npx --no-install tsx --test apps/network-explorer/api-server/src/lib/__tests__/transient-pg-error.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  isTransientPgError,
  pgErrorCode,
  TRANSIENT_PG_CODES,
} from "../transient-pg-error.js";

// Shaped like the error postgres.js raised on 2026-10-23 04:41:12 CEST.
function connectionDestroyed(): Error {
  const err = new Error("write CONNECTION_DESTROYED localhost:5432");
  Object.assign(err, {
    code: "CONNECTION_DESTROYED",
    errno: "CONNECTION_DESTROYED",
    address: ["localhost"],
    port: [5432],
  });
  return err;
}

describe("transient postgres connection errors", () => {
  test("the three pool-recycling codes are transient", () => {
    assert.equal(isTransientPgError(connectionDestroyed()), true);
    for (const code of TRANSIENT_PG_CODES) {
      assert.equal(isTransientPgError(Object.assign(new Error(code), { code })), true);
    }
  });

  test("a real defect stays a defect", () => {
    // Query errors, timeouts and constraint violations must not be softened
    // into a retry: the caller would retry forever on a permanent failure.
    for (const code of [
      "23505", // unique_violation
      "42703", // undefined_column
      "57014", // query_canceled (statement_timeout)
      "MAX_PARAMETERS_EXCEEDED",
      "CONNECT_TIMEOUT",
    ]) {
      assert.equal(
        isTransientPgError(Object.assign(new Error(code), { code })),
        false,
        `${code} must not be treated as transient`,
      );
    }
    assert.equal(isTransientPgError(new Error("plain failure")), false);
  });

  test("survives values that are not error objects", () => {
    // onError and unhandledRejection both receive unknown, and a thrown string
    // or a rejected undefined must not crash the handler itself.
    for (const value of [undefined, null, "CONNECTION_DESTROYED", 42, []]) {
      assert.equal(isTransientPgError(value), false);
    }
    // A non-string code is not a code.
    assert.equal(isTransientPgError({ code: 500 }), false);
  });

  test("pgErrorCode reports the code for logging, or nothing", () => {
    assert.equal(pgErrorCode(connectionDestroyed()), "CONNECTION_DESTROYED");
    assert.equal(pgErrorCode(new Error("no code")), undefined);
    assert.equal(pgErrorCode(null), undefined);
  });
});
