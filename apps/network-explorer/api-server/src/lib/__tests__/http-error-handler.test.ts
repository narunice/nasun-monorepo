/**
 * The HTTP shape of a recycled-connection failure: 503 + Retry-After, so the
 * caller retries, while a real defect stays a 500.
 *
 * Run with:
 *   npx --no-install tsx --test apps/network-explorer/api-server/src/lib/__tests__/http-error-handler.test.ts
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

import { handleHttpError } from "../http-error-handler.js";

// Shaped like the error postgres.js raised on 2026-10-23 04:41:12 CEST, when
// GET /ecosystem/score failed in 6ms on a connection the pool had recycled.
function connectionDestroyed(): Error {
  const err = new Error("write CONNECTION_DESTROYED localhost:5432");
  Object.assign(err, { code: "CONNECTION_DESTROYED", errno: "CONNECTION_DESTROYED" });
  return err;
}

function undefinedTable(): Error {
  const err = new Error('relation "activity_points" does not exist');
  Object.assign(err, { code: "42P01" });
  return err;
}

function appThrowing(err: Error): Hono {
  const app = new Hono();
  app.onError(handleHttpError);
  app.all("*", () => {
    throw err;
  });
  return app;
}

let warned: string[];
let errored: string[];
const realWarn = console.warn;
const realError = console.error;

beforeEach(() => {
  warned = [];
  errored = [];
  console.warn = (...args: unknown[]) => void warned.push(String(args[0]));
  console.error = (...args: unknown[]) => void errored.push(String(args[0]));
});

afterEach(() => {
  console.warn = realWarn;
  console.error = realError;
});

describe("http error handler", () => {
  test("a recycled connection answers 503 with Retry-After", async () => {
    const res = await appThrowing(connectionDestroyed()).request("/boom");
    assert.equal(res.status, 503);
    // Whether a browser can READ this header depends on cors({ exposeHeaders })
    // in index.ts, which app.request() does not apply. Asserted live instead.
    assert.equal(res.headers.get("Retry-After"), "1");
    assert.deepEqual(await res.json(), {
      error: "service_unavailable",
      retryAfterMs: 1000,
    });
  });

  test("the log keeps the client's escaping instead of decoding it", async () => {
    // c.req.path is percent-decoded, so %00 would put a raw NUL in the log
    // line. Hono's router 404s %0A and %0D before the handler sees them, so a
    // whole forged line is out of reach, but the control character is not.
    await appThrowing(connectionDestroyed()).request("/a/x%00y");
    assert.equal(warned.length, 1);
    assert.ok(!warned[0].includes("\u0000"), `log line carries a NUL: ${warned[0]}`);
    assert.match(warned[0], /%00/);
  });

  test("it is logged as a warning, not an error, and names the code", async () => {
    await appThrowing(connectionDestroyed()).request("/boom");
    assert.equal(errored.length, 0);
    assert.equal(warned.length, 1);
    // The route is in the line so a recurrence can be traced without a stack.
    assert.match(warned[0], /GET \S+\/boom/);
  });

  test("a real defect stays 500 with no Retry-After", async () => {
    const res = await appThrowing(undefinedTable()).request("/boom");
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("Retry-After"), null);
    assert.deepEqual(await res.json(), { error: "internal_server_error" });
    assert.equal(errored.length, 1);
    assert.equal(warned.length, 0);
  });

  test("a throw that carries no code stays 500", async () => {
    const res = await appThrowing(new Error("something broke")).request("/boom");
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("Retry-After"), null);
  });
});
