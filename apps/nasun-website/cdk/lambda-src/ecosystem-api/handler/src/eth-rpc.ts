/**
 * Minimal Ethereum RPC helpers for on-demand ownership checks.
 *
 * Uses Alchemy's eth_call (26 CU) instead of getNFTsForOwner (480 CU)
 * because activate flow only needs holding count, not token IDs.
 */

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const ALCHEMY_BASE_URL =
  process.env.ALCHEMY_BASE_URL || "https://eth-mainnet.g.alchemy.com/v2";
const TIMEOUT_MS = 8_000;

// ERC-721 / ERC-20 balanceOf(address) selector
const BALANCE_OF_SELECTOR = "0x70a08231";

interface JsonRpcResponse {
  result?: string;
  error?: { code: number; message: string };
}

/**
 * Call ERC-721 balanceOf(owner) and return the holding count.
 * Throws if the RPC call fails. Returns 0 for non-holders.
 */
export async function getErc721Balance(
  wallet: string,
  contractAddress: string,
): Promise<number> {
  if (!ALCHEMY_API_KEY) {
    throw new Error("ALCHEMY_API_KEY not configured");
  }

  const owner = wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = `${BALANCE_OF_SELECTOR}${owner}`;

  const res = await fetch(`${ALCHEMY_BASE_URL}/${ALCHEMY_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`eth_call HTTP ${res.status}`);
  }

  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) {
    throw new Error(`eth_call error: ${json.error.message}`);
  }
  if (!json.result) {
    throw new Error("eth_call returned empty result");
  }

  // result is "0x" + 64 hex chars; parseInt handles up to 53 bits which is
  // far beyond any realistic ERC-721 balance.
  const count = Number.parseInt(json.result, 16);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`eth_call returned invalid balance: ${json.result}`);
  }
  return count;
}
