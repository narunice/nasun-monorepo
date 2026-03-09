/**
 * Genesis NFT API Client
 *
 * @description
 * Genesis NFT 이벤트 API 클라이언트
 */

import {
  VerifyEligibilityRequest,
  VerifyEligibilityResponse,
  RegisterUserRequest,
  RegisterUserResponse,
  WithdrawUserRequest,
  WithdrawUserResponse,
  GenesisNftStatusResponse,
  ApiError,
} from "../types/genesis-nft";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const API_BASE_URL = import.meta.env.VITE_GENESIS_NFT_API || "";

// Verify eligibility may invoke 3-Tier X API flow (up to 30s)
const VERIFY_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 15_000;

if (!API_BASE_URL) {
  console.warn("[genesisNftApi] VITE_GENESIS_NFT_API is not configured");
}

/**
 * API 에러 처리 헬퍼
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: Record<string, unknown>;

    try {
      errorData = (await response.json()) as Record<string, unknown>;

      if (errorData.errorCode && !errorData.code) {
        errorData.code = errorData.errorCode;
      }

      if (errorData.message && !errorData.error) {
        errorData.error = errorData.message;
      }
    } catch {
      errorData = {
        success: false,
        error: `HTTP ${response.status}`,
        code: "NETWORK_ERROR",
        message: response.statusText || "Unknown error occurred",
      };
    }

    throw errorData;
  }

  return response.json();
}

/**
 * 참여 자격 검증 API
 */
export async function verifyEligibilityApi(
  request: VerifyEligibilityRequest,
): Promise<VerifyEligibilityResponse> {
  try {
    if (import.meta.env.DEV) console.log("[genesisNftApi] Verifying eligibility:", request);

    const response = await fetchWithTimeout(`${API_BASE_URL}/event/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }, VERIFY_TIMEOUT_MS);

    const data = await handleResponse<VerifyEligibilityResponse>(response);

    if (import.meta.env.DEV) console.log("[genesisNftApi] Verification result:", data);
    return data;
  } catch (error: unknown) {
    console.error("[genesisNftApi] Verification error:", error);

    if (error && typeof error === "object" && "code" in error) {
      throw error;
    }

    throw {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: "NETWORK_ERROR",
      message: "A network error occurred. Please try again later.",
    } as ApiError;
  }
}

/**
 * 화이트리스트 등록 API
 */
export async function registerUserApi(request: RegisterUserRequest): Promise<RegisterUserResponse> {
  try {
    if (import.meta.env.DEV) console.log("[genesisNftApi] Registering user:", request);

    const response = await fetchWithTimeout(`${API_BASE_URL}/event/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }, DEFAULT_TIMEOUT_MS);

    const data = await handleResponse<RegisterUserResponse>(response);

    if (import.meta.env.DEV) console.log("[genesisNftApi] Registration result:", data);
    return data;
  } catch (error: unknown) {
    console.error("[genesisNftApi] Registration error:", error);

    if (error && typeof error === "object" && "code" in error) {
      throw error;
    }

    throw {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: "NETWORK_ERROR",
      message: "A network error occurred. Please try again later.",
    } as ApiError;
  }
}

/**
 * Genesis NFT 등록 상태 조회 API
 */
export async function checkGenesisNftStatus(
  walletAddress?: string,
  xUserId?: string,
): Promise<GenesisNftStatusResponse> {
  try {
    if (import.meta.env.DEV) console.log("[genesisNftApi] Checking Genesis NFT status:", { walletAddress, xUserId });

    const params = new URLSearchParams();
    if (walletAddress) {
      params.set("walletAddress", walletAddress.toLowerCase());
    }
    if (xUserId) {
      params.set("xUserId", xUserId);
    }
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/event/status?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
      DEFAULT_TIMEOUT_MS,
    );

    const data = await handleResponse<GenesisNftStatusResponse>(response);

    if (import.meta.env.DEV) console.log("[genesisNftApi] Status check result:", data);
    return data;
  } catch (error: unknown) {
    console.error("[genesisNftApi] Status check error:", error);

    if (error && typeof error === "object" && "code" in error) {
      throw error;
    }

    throw {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: "NETWORK_ERROR",
      message: "An error occurred while checking status.",
    } as ApiError;
  }
}

/**
 * 화이트리스트 참여 취소 API
 */
export async function withdrawUserApi(request: WithdrawUserRequest, cognitoToken?: string): Promise<WithdrawUserResponse> {
  try {
    if (import.meta.env.DEV) console.log("[genesisNftApi] Withdrawing user:", request.walletAddress);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cognitoToken) {
      headers["Authorization"] = `Bearer ${cognitoToken}`;
    }

    const response = await fetchWithTimeout(`${API_BASE_URL}/event/withdraw`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    }, DEFAULT_TIMEOUT_MS);

    const data = await handleResponse<WithdrawUserResponse>(response);

    if (import.meta.env.DEV) console.log("[genesisNftApi] Withdraw result:", data);
    return data;
  } catch (error: unknown) {
    console.error("[genesisNftApi] Withdraw error:", error);

    if (error && typeof error === "object" && "code" in error) {
      throw error;
    }

    throw {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: "NETWORK_ERROR",
      message: "A network error occurred. Please try again later.",
    } as ApiError;
  }
}

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
