/**
 * The persisted query cache lives in localStorage, so anything the allowlist
 * lets through survives a reload and is readable by the next person on that
 * browser until logout clears it. These tests pin the allowlist: adding a
 * privileged key root should fail here, not in review.
 */

import { describe, it, expect } from "vitest";
import { QueryClient, type Query } from "@tanstack/react-query";
import { queryPersistOptions } from "../queryPersist";

const shouldPersist = queryPersistOptions.dehydrateOptions!.shouldDehydrateQuery!;

function queryFor(queryKey: readonly unknown[], status: "success" | "error" = "success"): Query {
  const client = new QueryClient();
  const cache = client.getQueryCache();
  const query = cache.build(client, { queryKey });
  if (status === "success") {
    query.setData({ ok: true });
  } else {
    query.setState({ status: "error", error: new Error("boom") } as never);
  }
  return query as Query;
}

describe("queryPersistOptions.shouldDehydrateQuery", () => {
  it("persists the ecosystem/uju read caches that cause the blank-panel wait", () => {
    for (const key of [
      ["ecosystem", "score", "id-1"],
      ["ecosystem-all-time-percentile", "id-1"],
      ["ecosystem-leaderboard", "current"],
      ["uju", "bonus-feed", "id-1"],
      ["ujuFeed", 10],
      ["nasun-standing", "0xabc"],
      ["nasun-stats-meta"],
    ]) {
      expect(shouldPersist(queryFor(key)), `${key[0]} should persist`).toBe(true);
    }
  });

  it("never persists privileged or fast-moving caches", () => {
    for (const key of [
      ["admin", "users", "list", 1],
      ["admin-bug-reports"],
      ["bug-reports", "my-reports"],
      ["creator-posts", "admin"],
      ["aer", "req-1"],
      ["nasun-ai", "budgets", "0xabc"],
      ["balance", "sui-testnet", "0xabc"],
      ["drift-positions", "0xabc"],
      ["vaults", "list"],
      ["pado-balance-summary", "bm", "addr", true],
    ]) {
      expect(shouldPersist(queryFor(key)), `${key[0]} must not persist`).toBe(false);
    }
  });

  it("does not persist failed queries even on allowlisted keys", () => {
    expect(shouldPersist(queryFor(["ecosystem", "score", "id-1"], "error"))).toBe(false);
  });
});
