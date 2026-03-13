import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchAccounts } from "../leaderboardV3Api";

// Mock fetchWithTimeout
const mockFetch = vi.fn();
vi.mock("@/utils/fetchWithTimeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));

// Mock import.meta.env
vi.stubEnv("VITE_LEADERBOARD_V3_API_URL", "https://api.test.nasun.io");

describe("searchAccounts", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // ── Short-circuit for invalid queries ──────────────────────

  it("returns empty result for query shorter than 2 chars", async () => {
    const result = await searchAccounts({ query: "a" });

    expect(result).toEqual({ accounts: [], total: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty result for empty string query", async () => {
    const result = await searchAccounts({ query: "" });

    expect(result).toEqual({ accounts: [], total: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── URL Construction ───────────────────────────────────────

  it("constructs correct URL with all parameters", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accounts: [], total: 0 }),
    });

    await searchAccounts({
      query: "nasun",
      limit: 8,
      seasonId: "season_1",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("q=nasun"),
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("limit=8"),
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("seasonId=season_1"),
      expect.any(Object)
    );
  });

  it("uses default limit of 10 when not specified", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accounts: [], total: 0 }),
    });

    await searchAccounts({ query: "nasun" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("limit=10"),
      expect.any(Object)
    );
  });

  it("omits seasonId from URL when not provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accounts: [], total: 0 }),
    });

    await searchAccounts({ query: "nasun" });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain("seasonId");
  });

  // ── Response Handling ──────────────────────────────────────

  it("returns parsed response on success", async () => {
    const mockData = {
      accounts: [
        { accountId: "1", username: "nasun_io", rank: 1 },
      ],
      total: 1,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await searchAccounts({ query: "nasun" });

    expect(result).toEqual(mockData);
  });

  // ── Error Handling ─────────────────────────────────────────

  it("throws error with server message on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Internal server error" }),
    });

    await expect(searchAccounts({ query: "nasun" })).rejects.toThrow(
      "Internal server error"
    );
  });

  it("throws fallback error when server error response is unparseable", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("parse error")),
    });

    // .catch(() => ({ error: 'Unknown error' })) in source returns fallback object
    await expect(searchAccounts({ query: "nasun" })).rejects.toThrow(
      "Unknown error"
    );
  });

  // ── Edge Case: Query with special URL characters ───────────

  it("properly encodes special characters in query parameter", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accounts: [], total: 0 }),
    });

    await searchAccounts({ query: "user&name=test" });

    const url = mockFetch.mock.calls[0][0] as string;
    // URLSearchParams should encode & and = properly
    expect(url).toContain("q=user%26name%3Dtest");
  });

  // ── Edge Case: Boundary - exactly 2 char query ─────────────

  it("makes API call for exactly 2 character query", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accounts: [], total: 0 }),
    });

    await searchAccounts({ query: "ab" });

    expect(mockFetch).toHaveBeenCalled();
  });

  // ── HTTP Method ────────────────────────────────────────────

  it("uses GET method with correct headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accounts: [], total: 0 }),
    });

    await searchAccounts({ query: "nasun" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })
    );
  });
});
