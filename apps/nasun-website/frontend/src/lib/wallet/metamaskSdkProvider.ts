/**
 * MetaMask SDK Provider (Mobile Only)
 *
 * Provides wallet connection via MetaMask's official SDK for mobile browsers.
 * Desktop browsers should use window.ethereum directly (see metamaskUtils.ts).
 *
 * Mobile: deep links to MetaMask app via SDK's Socket.io relay.
 * Replaces WalletConnect v2 which was unreliable on iOS Safari.
 */

import { MetaMaskSDK } from "@metamask/sdk";
import { isMobileBrowser } from "../../utils/mobileDetect";

let sdkInstance: MetaMaskSDK | null = null;
let initPromise: Promise<MetaMaskSDK> | null = null;

// Guard: only redirect to MetaMask app when a user-initiated operation is active.
// Prevents spurious display_uri events (e.g. session recovery after app switch)
// from causing unwanted redirects on iOS Safari.
let _activeOperation = false;

// Per-operation redirect guard: allows max 1 deep link redirect per SDK operation.
// MetaMask SDK v0.29.1+ re-emits display_uri on channel state changes and Socket.io
// reconnections (frequent on iOS app switching). Without this, duplicate redirects
// cause stale "Open in MetaMask?" dialogs after the flow completes.
let _redirectedForCurrentOp = false;

const INIT_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 120_000;
const SIGN_TIMEOUT_MS = 60_000;

/**
 * Race a promise against a timeout. On timeout, rejects with given message.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeoutId),
  );
}

/**
 * Initialize and return singleton MetaMask SDK.
 * Async — sdk.init() must be called before use.
 * Uses dedup guard to prevent concurrent initialization.
 */
async function getSDK(): Promise<MetaMaskSDK> {
  if (!isMobileBrowser()) {
    throw new Error(
      "MetaMask SDK is only supported on mobile. Use window.ethereum for desktop.",
    );
  }

  if (sdkInstance) return sdkInstance;
  if (initPromise) return initPromise;

  initPromise = withTimeout(
    (async () => {
      const sdk = new MetaMaskSDK({
        dappMetadata: {
          name: "Nasun",
          url: window.location.href,
        },
        extensionOnly: false,
        headless: true,
        shouldShimWeb3: false,
        enableAnalytics: false,
        checkInstallationImmediately: false,
      });
      await sdk.init();

      // Headless mode: handle mobile deep links via display_uri event.
      // Only redirect when _activeOperation is true to avoid spurious
      // redirects from SDK session recovery after iOS app switching.
      const provider = sdk.getProvider();
      if (provider && isMobileBrowser()) {
        provider.on("display_uri", ((...args: unknown[]) => {
          const uri = args[0] as string;
          if (_activeOperation && uri && !_redirectedForCurrentOp) {
            _redirectedForCurrentOp = true;
            window.location.href = uri;
          }
        }) as (...args: unknown[]) => void);
      }

      sdkInstance = sdk;
      initPromise = null;
      return sdk;
    })(),
    INIT_TIMEOUT_MS,
    "MetaMask SDK initialization timed out.",
  ).catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

/**
 * Connect to MetaMask via SDK. Mobile: deep links to MetaMask app.
 * @returns Connected wallet address (lowercase)
 */
export async function connectMetaMaskSDK(): Promise<string> {
  const sdk = await getSDK();
  _activeOperation = true;
  _redirectedForCurrentOp = false;
  try {
    const accounts = await withTimeout(
      sdk.connect(),
      CONNECT_TIMEOUT_MS,
      "Wallet connection timed out. Please try again.",
    );
    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts returned from MetaMask");
    }
    return accounts[0].toLowerCase();
  } finally {
    _activeOperation = false;
  }
}

/**
 * Sign a message via MetaMask SDK provider (personal_sign / EIP-191).
 * @param message - Plain text message to sign
 * @param address - Wallet address that will sign
 * @returns Hex-encoded signature
 */
export async function signMessageViaSDK(
  message: string,
  address: string,
): Promise<string> {
  const sdk = await getSDK();
  const provider = sdk.getProvider();
  if (!provider) throw new Error("MetaMask provider not available");

  const msgHex =
    "0x" +
    Array.from(new TextEncoder().encode(message))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  _activeOperation = true;
  _redirectedForCurrentOp = false;
  try {
    return (await withTimeout(
      provider.request({
        method: "personal_sign",
        params: [msgHex, address.toLowerCase()],
      }),
      SIGN_TIMEOUT_MS,
      "Signature request timed out. Please try again.",
    )) as string;
  } finally {
    _activeOperation = false;
  }
}

/**
 * Disconnect MetaMask SDK session and reset singleton.
 */
export async function disconnectMetaMaskSDK(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.terminate();
    } catch {
      // Ignore terminate errors during cleanup
    }
    sdkInstance = null;
  }
  initPromise = null;
}

/**
 * Check if SDK has an active connected account.
 * @returns address (lowercase) or null
 */
export async function getConnectedAccount(): Promise<string | null> {
  try {
    const sdk = await getSDK();
    const provider = sdk.getProvider();
    if (!provider) return null;
    const accounts = (await provider.request({
      method: "eth_accounts",
      params: [],
    })) as string[];
    return accounts.length > 0 ? accounts[0].toLowerCase() : null;
  } catch {
    return null;
  }
}
