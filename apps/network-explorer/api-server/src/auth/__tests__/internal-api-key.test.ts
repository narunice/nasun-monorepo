/**
 * Internal API key middleware — timing-safe equality + edge cases.
 *
 * Run with:
 *   npx --no-install tsx --test apps/network-explorer/api-server/src/auth/__tests__/internal-api-key.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

import { requireInternalApiKey } from "../internal-api-key.js";

const ENV_VAR = "TEST_INTERNAL_KEY";
const SECRET = "abcdef-0123456789-deadbeef";

function buildApp(): Hono {
  const app = new Hono();
  app.get("/protected", requireInternalApiKey(ENV_VAR), (c) =>
    c.json({ ok: true }),
  );
  return app;
}

before(() => {
  process.env[ENV_VAR] = SECRET;
});

after(() => {
  delete process.env[ENV_VAR];
});

describe("requireInternalApiKey", () => {
  test("accepts matching key", async () => {
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { "x-api-key": SECRET },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test("rejects missing key with 401", async () => {
    const app = buildApp();
    const res = await app.request("/protected");
    assert.equal(res.status, 401);
  });

  test("rejects empty key with 401", async () => {
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { "x-api-key": "" },
    });
    assert.equal(res.status, 401);
  });

  test("rejects wrong key of same length", async () => {
    const app = buildApp();
    const wrong = "x".repeat(SECRET.length);
    const res = await app.request("/protected", {
      headers: { "x-api-key": wrong },
    });
    assert.equal(res.status, 401);
  });

  test("rejects wrong key of different length", async () => {
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { "x-api-key": "short" },
    });
    assert.equal(res.status, 401);
  });

  test("rejects when env var unset", async () => {
    const original = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
    try {
      const app = buildApp();
      const res = await app.request("/protected", {
        headers: { "x-api-key": SECRET },
      });
      assert.equal(res.status, 401);
    } finally {
      if (original !== undefined) process.env[ENV_VAR] = original;
    }
  });
});
