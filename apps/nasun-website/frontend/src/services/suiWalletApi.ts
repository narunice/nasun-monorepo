const SUI_WALLET_AUTH_API = import.meta.env.VITE_SUI_WALLET_AUTH_API as string;
const WALLET_API_ENDPOINT = import.meta.env.VITE_WALLET_API_ENDPOINT as string;

export interface SuiPrepareResponse {
  nonce: string;
  message: string;
}

export interface SuiConnectVerifyResponse {
  walletAddress: string;
  identityId: string;
  token: string;
  walletProof: string;
  proofIssuedAt: string;
}

export async function suiPrepareChallenge(): Promise<SuiPrepareResponse> {
  const res = await fetch(`${SUI_WALLET_AUTH_API}auth/sui/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Prepare failed (${res.status})`);
  }

  return res.json();
}

export async function suiConnectVerify(
  signature: string,
  nonce: string,
  zkLoginParams?: { zkAddress: string; ephemeralPublicKey: string }
): Promise<SuiConnectVerifyResponse> {
  const res = await fetch(`${SUI_WALLET_AUTH_API}auth/sui/connect-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, nonce, ...zkLoginParams }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Verification failed (${res.status})`);
  }

  return res.json();
}

// --- Multi-wallet registration API ---

export interface RegisteredWallet {
  walletAddress: string;
  blockchain: string;
  label?: string;
  registeredAt: string;
}

export async function registerWallet(
  walletAddress: string,
  walletProof: string,
  proofIssuedAt: string,
  cognitoToken: string,
): Promise<RegisteredWallet> {
  const res = await fetch(`${WALLET_API_ENDPOINT}register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cognitoToken}`,
    },
    body: JSON.stringify({ walletAddress, walletProof, proofIssuedAt }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Registration failed (${res.status})`);
  }

  return res.json();
}

export async function listRegisteredWallets(
  cognitoToken: string,
): Promise<RegisteredWallet[]> {
  const res = await fetch(`${WALLET_API_ENDPOINT}list`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${cognitoToken}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `List failed (${res.status})`);
  }

  const data = await res.json();
  return data.wallets;
}

export async function removeRegisteredWallet(
  walletAddress: string,
  cognitoToken: string,
): Promise<void> {
  const res = await fetch(`${WALLET_API_ENDPOINT}remove`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cognitoToken}`,
    },
    body: JSON.stringify({ walletAddress }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Remove failed (${res.status})`);
  }
}
