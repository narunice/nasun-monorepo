/**
 * Alliance NFT API Client
 *
 * Server-side minting via governance-api Lambda.
 * Uses existing VITE_GOVERNANCE_API_URL endpoint.
 */

const API_BASE = import.meta.env.VITE_GOVERNANCE_API_URL;

export interface AllianceWallet {
  walletAddress: string;
  label?: string;
  index: number;
}

export interface AllianceStatusResponse {
  minted: boolean;
  data: {
    imageIndex: number;
    walletAddress: string;
    txDigest: string;
    nftObjectId: string;
    mintedAt: string;
  } | null;
  wallets: AllianceWallet[];
}

export interface AllianceMintResponse {
  success: boolean;
  data?: { txDigest: string; nftObjectId: string };
  error?: string;
  code?: string;
}

export class AllianceNftApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
  ) {
    super(message);
    this.name = "AllianceNftApiError";
  }
}

export async function getAllianceStatus(cognitoToken: string): Promise<AllianceStatusResponse> {
  if (!API_BASE) throw new AllianceNftApiError("Alliance API is not configured");

  const response = await fetch(`${API_BASE}/alliance/status`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cognitoToken}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new AllianceNftApiError(
      data.message || data.error || "Failed to check alliance status",
      response.status,
      data.code,
    );
  }
  return data as AllianceStatusResponse;
}

export async function mintAllianceNft(
  cognitoToken: string,
  imageIndex: number,
  walletIndex: number,
): Promise<AllianceMintResponse> {
  if (!API_BASE) throw new AllianceNftApiError("Alliance API is not configured");

  const response = await fetch(`${API_BASE}/alliance/mint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cognitoToken}`,
    },
    body: JSON.stringify({ imageIndex, walletIndex }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new AllianceNftApiError(
      data.message || data.error || "Failed to mint Alliance NFT",
      response.status,
      data.code,
    );
  }
  return data as AllianceMintResponse;
}

export function isAllianceApiConfigured(): boolean {
  return Boolean(API_BASE);
}
