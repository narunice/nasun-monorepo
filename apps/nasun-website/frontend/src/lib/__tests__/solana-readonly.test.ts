// @vitest-environment node
import { describe, it, expect } from "vitest";
import { SOL_MAINNET_READ_RPC, solReadCall } from "../solana-readonly";

// Read-only mainnet RPC host invariant. Companion file `solana.ts` holds the
// devnet-only invariant for tx signing.
describe("SOL_MAINNET_READ_RPC is mainnet read-only host", () => {
  it("does not contain 'devnet' or 'testnet'", () => {
    expect(SOL_MAINNET_READ_RPC).not.toContain("devnet");
    expect(SOL_MAINNET_READ_RPC).not.toContain("testnet");
  });

  it("is a mainnet-shaped host (Solana Foundation public; mainnet-* providers OK)", () => {
    const host = new URL(SOL_MAINNET_READ_RPC).host;
    const isMainnetShaped = /mainnet|solana\.com$/.test(host);
    expect(isMainnetShaped).toBe(true);
  });

  it("is the chosen Solana Foundation public RPC endpoint", () => {
    // Foundation RPC was chosen over PublicNode because PublicNode times out on
    // getTokenAccountsByOwner (mint filter), which is the main read path.
    expect(SOL_MAINNET_READ_RPC).toBe("https://api.mainnet-beta.solana.com");
  });
});

describe("solReadCall refuses tx-sending methods", () => {
  it("rejects sendTransaction", async () => {
    await expect(solReadCall("sendTransaction", [])).rejects.toThrow(/forbidden/);
  });
  it("rejects simulateTransaction", async () => {
    await expect(solReadCall("simulateTransaction", [])).rejects.toThrow(/forbidden/);
  });
  it("rejects requestAirdrop", async () => {
    await expect(solReadCall("requestAirdrop", [])).rejects.toThrow(/forbidden/);
  });
});
