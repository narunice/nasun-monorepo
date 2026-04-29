// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the sui-client module BEFORE importing the hook
const mockQueryEvents = vi.fn();
const mockQueryTransactionBlocks = vi.fn();

vi.mock("@/lib/sui-client", () => ({
  suiClient: {
    queryEvents: (...args: unknown[]) => mockQueryEvents(...args),
    queryTransactionBlocks: (...args: unknown[]) => mockQueryTransactionBlocks(...args),
  },
}));

// Mock env for fetch URL
vi.stubGlobal("import.meta.env", { VITE_EXPLORER_API_URL: "https://api.test" });

import {
  detectEventMissions,
  detectTxMissions,
  detectAllWallets,
} from "../useDailyMissions";

const PKG_DEX = "0xdeeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const PKG_LOTTERY = "0xaaaa";
const PKG_FAUCET = "0xf0";
const WALLET_A = "0xa".padEnd(66, "a");
const WALLET_B = "0xb".padEnd(66, "b");

const TODAY_START = Date.UTC(2026, 3, 12); // 2026-04-12 UTC
const TODAY_NOON = TODAY_START + 12 * 3600_000;
const YESTERDAY = TODAY_START - 3600_000;

function makeEvent(type: string, timestampMs: number) {
  return {
    id: { txDigest: "0x" + Math.random().toString(16).slice(2), eventSeq: "0" },
    type,
    timestampMs: String(timestampMs),
    parsedJson: {},
  };
}

function emptyEventsPage(data: unknown[] = []) {
  return { data, hasNextPage: false, nextCursor: null };
}

function makeTx({
  ts,
  commands,
  failure = false,
}: {
  ts: number;
  commands: unknown[];
  failure?: boolean;
}) {
  return {
    timestampMs: String(ts),
    effects: { status: { status: failure ? "failure" : "success" } },
    transaction: {
      data: {
        transaction: {
          kind: "ProgrammableTransaction",
          transactions: commands,
        },
      },
    },
  };
}

function emptyTxPage(data: unknown[] = []) {
  return { data, hasNextPage: false, nextCursor: null };
}

beforeEach(() => {
  mockQueryEvents.mockReset();
  mockQueryTransactionBlocks.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── detectEventMissions ───────────────────────────────────────────

describe("detectEventMissions", () => {
  it("detects pado-dex from OrderFilled (taker/market-order) — regression test for aa3e7a7b drift", async () => {
    mockQueryEvents.mockResolvedValueOnce(
      emptyEventsPage([
        makeEvent(`${PKG_DEX}::order_info::OrderFullyFilled`, TODAY_NOON),
        makeEvent(`${PKG_DEX}::order_info::OrderFilled`, TODAY_NOON),
      ]),
    );

    const result = await detectEventMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("pado-dex")).toBe(true);
  });

  it("detects pado-dex from OrderPlaced (maker/limit-order)", async () => {
    mockQueryEvents.mockResolvedValueOnce(
      emptyEventsPage([
        makeEvent(`${PKG_DEX}::order_info::OrderPlaced`, TODAY_NOON),
      ]),
    );

    const result = await detectEventMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("pado-dex")).toBe(true);
  });

  it("detects each gostop game as its own mission id", async () => {
    mockQueryEvents.mockResolvedValueOnce(
      emptyEventsPage([
        makeEvent(`${PKG_DEX}::order_info::OrderFilled`, TODAY_NOON),
        makeEvent(`${PKG_LOTTERY}::lottery::TicketPurchased`, TODAY_NOON),
        makeEvent(`${PKG_DEX}::scratchcard::ScratchCardPurchased`, TODAY_NOON),
        makeEvent(`${PKG_DEX}::numbermatch::NumberMatchPlayed`, TODAY_NOON),
        makeEvent(`${PKG_DEX}::mines::SessionFinished`, TODAY_NOON),
        makeEvent(`${PKG_DEX}::crash::BetPlaced`, TODAY_NOON),
      ]),
    );

    const result = await detectEventMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("pado-dex")).toBe(true);
    expect(result.has("gostop-lottery")).toBe(true);
    expect(result.has("gostop-scratchcard")).toBe(true);
    expect(result.has("gostop-numbermatch")).toBe(true);
    expect(result.has("gostop-mines")).toBe(true);
    expect(result.has("gostop-crash")).toBe(true);
  });

  it("crash CashOutRecorded also credits gostop-crash (cap dedups bet+cashout)", async () => {
    mockQueryEvents.mockResolvedValueOnce(
      emptyEventsPage([
        makeEvent(`${PKG_DEX}::crash::CashOutRecorded`, TODAY_NOON),
      ]),
    );

    const result = await detectEventMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("gostop-crash")).toBe(true);
  });

  it("excludes events from yesterday (stops scan on first past-today event)", async () => {
    mockQueryEvents.mockResolvedValueOnce(
      emptyEventsPage([
        makeEvent(`${PKG_DEX}::order_info::OrderFilled`, TODAY_NOON),
        makeEvent(`${PKG_DEX}::lottery::TicketPurchased`, YESTERDAY),
      ]),
    );

    const result = await detectEventMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("pado-dex")).toBe(true);
    expect(result.has("gostop-lottery")).toBe(false);
  });

  it("ignores unrelated event types (no false positives)", async () => {
    mockQueryEvents.mockResolvedValueOnce(
      emptyEventsPage([
        makeEvent(`${PKG_DEX}::unrelated::RandomEvent`, TODAY_NOON),
        makeEvent(`${PKG_DEX}::order_info::OrderCanceled`, TODAY_NOON),
      ]),
    );

    const result = await detectEventMissions(WALLET_A, TODAY_START, new Set());
    expect(result.size).toBe(0);
  });

  it("skips query when all event missions already found", async () => {
    const alreadyFound = new Set([
      "pado-dex",
      "gostop-lottery",
      "gostop-scratchcard",
      "gostop-numbermatch",
      "gostop-mines",
      "gostop-crash",
    ] as const);

    const result = await detectEventMissions(
      WALLET_A,
      TODAY_START,
      alreadyFound as unknown as Set<never>,
    );

    expect(mockQueryEvents).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("paginates across pages until today boundary reached", async () => {
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [makeEvent(`${PKG_DEX}::order_info::OrderFilled`, TODAY_NOON)],
        hasNextPage: true,
        nextCursor: { txDigest: "cursor1", eventSeq: "0" },
      })
      .mockResolvedValueOnce(
        emptyEventsPage([
          makeEvent(`${PKG_DEX}::lottery::TicketPurchased`, TODAY_NOON),
        ]),
      );

    const result = await detectEventMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("pado-dex")).toBe(true);
    expect(result.has("gostop-lottery")).toBe(true);
    expect(mockQueryEvents).toHaveBeenCalledTimes(2);
  });

  it("returns empty set on RPC error without throwing", async () => {
    mockQueryEvents.mockRejectedValueOnce(new Error("RPC down"));
    const result = await detectEventMissions(WALLET_A, TODAY_START, new Set());
    expect(result.size).toBe(0);
  });
});

// ── detectTxMissions ──────────────────────────────────────────────

describe("detectTxMissions", () => {
  it("detects faucet from MoveCall to faucet::request_*", async () => {
    mockQueryTransactionBlocks.mockResolvedValueOnce(
      emptyTxPage([
        makeTx({
          ts: TODAY_NOON,
          commands: [
            {
              MoveCall: {
                package: PKG_FAUCET,
                module: "faucet",
                function: "request_nasun",
              },
            },
          ],
        }),
      ]),
    );

    const result = await detectTxMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("faucet")).toBe(true);
  });

  it("detects faucet_v2 variant", async () => {
    mockQueryTransactionBlocks.mockResolvedValueOnce(
      emptyTxPage([
        makeTx({
          ts: TODAY_NOON,
          commands: [
            {
              MoveCall: {
                package: PKG_FAUCET,
                module: "faucet_v2",
                function: "request_tokens",
              },
            },
          ],
        }),
      ]),
    );

    const result = await detectTxMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("faucet")).toBe(true);
  });

  it("detects wallet-transfer from TransferObjects command", async () => {
    mockQueryTransactionBlocks.mockResolvedValueOnce(
      emptyTxPage([
        makeTx({
          ts: TODAY_NOON,
          commands: [{ TransferObjects: {} }],
        }),
      ]),
    );

    const result = await detectTxMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("wallet-transfer")).toBe(true);
    expect(result.has("faucet")).toBe(false);
  });

  it("does NOT credit wallet-transfer when TransferObjects is part of a faucet TX", async () => {
    mockQueryTransactionBlocks.mockResolvedValueOnce(
      emptyTxPage([
        makeTx({
          ts: TODAY_NOON,
          commands: [
            {
              MoveCall: {
                package: PKG_FAUCET,
                module: "faucet",
                function: "request_sui",
              },
            },
            { TransferObjects: {} },
          ],
        }),
      ]),
    );

    const result = await detectTxMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("faucet")).toBe(true);
    expect(result.has("wallet-transfer")).toBe(false);
  });

  it("excludes failed transactions", async () => {
    mockQueryTransactionBlocks.mockResolvedValueOnce(
      emptyTxPage([
        makeTx({
          ts: TODAY_NOON,
          failure: true,
          commands: [{ TransferObjects: {} }],
        }),
      ]),
    );

    const result = await detectTxMissions(WALLET_A, TODAY_START, new Set());
    expect(result.size).toBe(0);
  });

  it("excludes transactions from yesterday", async () => {
    mockQueryTransactionBlocks.mockResolvedValueOnce(
      emptyTxPage([
        makeTx({
          ts: YESTERDAY,
          commands: [{ TransferObjects: {} }],
        }),
      ]),
    );

    const result = await detectTxMissions(WALLET_A, TODAY_START, new Set());
    expect(result.size).toBe(0);
  });

  it("skips query when both TX missions already found", async () => {
    const alreadyFound = new Set(["faucet", "wallet-transfer"] as const);
    const result = await detectTxMissions(
      WALLET_A,
      TODAY_START,
      alreadyFound as unknown as Set<never>,
    );
    expect(mockQueryTransactionBlocks).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("rejects faucet match with wrong function prefix", async () => {
    mockQueryTransactionBlocks.mockResolvedValueOnce(
      emptyTxPage([
        makeTx({
          ts: TODAY_NOON,
          commands: [
            {
              MoveCall: {
                package: PKG_FAUCET,
                module: "faucet",
                function: "admin_drain",
              },
            },
          ],
        }),
      ]),
    );

    const result = await detectTxMissions(WALLET_A, TODAY_START, new Set());
    expect(result.has("faucet")).toBe(false);
  });
});

// ── detectAllWallets (multi-wallet) ──────────────────────────────────────────
// PR3b: chat mission removed from MissionId. Backend still credits ecosystem
// points for chat, but the daily-mission UI no longer shows a chat checkbox.

describe("detectAllWallets", () => {
  it("aggregates missions across multiple wallets", async () => {
    // Wallet A: market-order
    mockQueryEvents.mockResolvedValueOnce(
      emptyEventsPage([
        makeEvent(`${PKG_DEX}::order_info::OrderFilled`, TODAY_NOON),
      ]),
    );
    mockQueryTransactionBlocks.mockResolvedValueOnce(emptyTxPage());

    // Wallet B: lottery + faucet
    mockQueryEvents.mockResolvedValueOnce(
      emptyEventsPage([
        makeEvent(`${PKG_LOTTERY}::lottery::TicketPurchased`, TODAY_NOON),
      ]),
    );
    mockQueryTransactionBlocks.mockResolvedValueOnce(
      emptyTxPage([
        makeTx({
          ts: TODAY_NOON,
          commands: [
            {
              MoveCall: {
                package: PKG_FAUCET,
                module: "faucet",
                function: "request_nasun",
              },
            },
          ],
        }),
      ]),
    );

    const result = await detectAllWallets(
      [WALLET_A, WALLET_B],
      TODAY_START,
      new Set(),
      "identity-1",
    );

    expect(result.has("pado-dex")).toBe(true);
    expect(result.has("gostop-lottery")).toBe(true);
    expect(result.has("faucet")).toBe(true);
  });

  it("preserves existing missions passed in (union semantics)", async () => {
    mockQueryEvents.mockResolvedValueOnce(emptyEventsPage());
    mockQueryTransactionBlocks.mockResolvedValueOnce(emptyTxPage());

    const prior = new Set(["faucet"] as const);
    const result = await detectAllWallets(
      [WALLET_A],
      TODAY_START,
      prior as unknown as Set<never>,
      "identity-1",
    );

    expect(result.has("faucet")).toBe(true);
  });

  it("does not fetch chat from explorer API (chat mission removed in PR3b)", async () => {
    mockQueryEvents.mockResolvedValueOnce(emptyEventsPage());
    mockQueryTransactionBlocks.mockResolvedValueOnce(emptyTxPage());

    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await detectAllWallets(
      [WALLET_A],
      TODAY_START,
      new Set(),
      "identity-1",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles empty wallet list gracefully", async () => {
    const result = await detectAllWallets(
      [],
      TODAY_START,
      new Set(),
      "identity-1",
    );

    expect(result.size).toBe(0);
    expect(mockQueryEvents).not.toHaveBeenCalled();
    expect(mockQueryTransactionBlocks).not.toHaveBeenCalled();
  });
});
