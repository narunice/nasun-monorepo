/**
 * useCoinPrice Hook
 *
 * SUI 가격 정보를 가져오는 커스텀 Hook입니다.
 * React Query를 사용하여 캐싱 및 중복 요청 방지.
 *
 * - 1차: CoinGecko API 사용
 * - 2차: CoinMarketCap API 사용 (백업)
 *
 * CORS 에러 해결 방법:
 * 개발 환경에서는 Vite 프록시를 통해 API 요청을 전달합니다.
 * - 개발: /proxy-price-api, /proxy-backup-api → Vite 프록시 → AWS API Gateway
 * - 프로덕션: 직접 AWS API Gateway 호출 (CORS 설정 완료됨)
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

// ============================================================================
// Types
// ============================================================================

interface CryptoPrice {
  coinId: string;
  usd: number;
  updatedAt: number | string;
  ttl?: number;
}

interface CoinPriceData extends CryptoPrice {
  source: "coingecko" | "coinmarketcap";
}

interface ApiResponse {
  success: boolean;
  data?: CryptoPrice[];
  [key: string]: unknown;
}

// ============================================================================
// Constants
// ============================================================================

// Fixed to SUI after multi-chain removal
const COIN_ID = "SUI";

const API_TIMEOUT = 5000;
const PRICE_STALE_THRESHOLD = 4 * 60; // 4분

// 개발 환경에서는 Vite 프록시를 사용하여 CORS 문제 회피
const isDevelopment = import.meta.env.MODE === "development";
const COINGECKO_ENDPOINT = import.meta.env.VITE_PRICE_API_ENDPOINT;
const COINMARKETCAP_ENDPOINT = import.meta.env.VITE_BACKUP_API_ENDPOINT;

// ============================================================================
// Query Key Factory
// ============================================================================

export const coinPriceKeys = {
  all: ["coinPrice"] as const,
  sui: () => [...coinPriceKeys.all, "sui"] as const,
};

// ============================================================================
// Helper Functions
// ============================================================================

const isPriceStale = (priceData: CryptoPrice | undefined): boolean => {
  if (!priceData) return true;
  const updatedAt = new Date(priceData.updatedAt).getTime() / 1000;
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return nowInSeconds - updatedAt > PRICE_STALE_THRESHOLD;
};

const fetchCoinGeckoPrice = async (): Promise<CryptoPrice | undefined> => {
  if (!COINGECKO_ENDPOINT) return undefined;

  const geckoUrl = isDevelopment
    ? "/proxy-price-api/api/prices"
    : `${COINGECKO_ENDPOINT.endsWith("/") ? COINGECKO_ENDPOINT.slice(0, -1) : COINGECKO_ENDPOINT}/api/prices`;

  const response = await axios.get<ApiResponse>(geckoUrl, {
    timeout: API_TIMEOUT,
  });

  if (!response.data.success) {
    return undefined;
  }

  return response.data.data?.find((price) => price.coinId === COIN_ID);
};

const fetchCoinMarketCapPrice = async (): Promise<CryptoPrice | undefined> => {
  if (!COINMARKETCAP_ENDPOINT) return undefined;

  const backupUrl = isDevelopment
    ? "/proxy-backup-api/BackupPrices"
    : `${COINMARKETCAP_ENDPOINT.endsWith("/") ? COINMARKETCAP_ENDPOINT.slice(0, -1) : COINMARKETCAP_ENDPOINT}/BackupPrices`;

  const response = await axios.get<ApiResponse>(backupUrl, {
    timeout: API_TIMEOUT,
  });

  if (response.data[COIN_ID]) {
    return {
      coinId: COIN_ID,
      usd: (response.data[COIN_ID] as { usd: number; updatedAt: string }).usd,
      updatedAt: (response.data[COIN_ID] as { usd: number; updatedAt: string }).updatedAt,
    };
  }
  return undefined;
};

// ============================================================================
// Main Query Function (with Fallback)
// ============================================================================

const fetchCoinPrice = async (): Promise<CoinPriceData> => {
  // 1차 시도: CoinGecko API
  try {
    const geckoData = await fetchCoinGeckoPrice();
    if (geckoData && !isPriceStale(geckoData)) {
      return { ...geckoData, source: "coingecko" };
    }
  } catch {
    // CoinGecko 실패 시 로그 (warn으로 변경하여 노이즈 감소)
    console.warn("CoinGecko API failed, trying fallback...");
  }

  // 2차 시도: CoinMarketCap API (백업)
  try {
    const cmcData = await fetchCoinMarketCapPrice();
    if (cmcData) {
      return { ...cmcData, source: "coinmarketcap" };
    }
  } catch {
    console.warn("CoinMarketCap API also failed");
  }

  throw new Error("All price sources failed");
};

// ============================================================================
// Hook
// ============================================================================

export const useCoinPrice = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: coinPriceKeys.sui(),
    queryFn: fetchCoinPrice,
    staleTime: 1000 * 60, // 1분: 가격 데이터는 자주 변경됨
    gcTime: 1000 * 60 * 5, // 5분: 캐시 유지
    refetchInterval: 1000 * 60, // 1분마다 자동 리페칭
    retry: 1, // 1회 재시도 (빠른 폴백)
    retryDelay: 500, // 0.5초 후 재시도
    refetchOnWindowFocus: false, // 창 포커스 시 리페칭 비활성화 (가격은 interval로 충분)
  });

  return {
    currentPrice: data?.usd ?? 0,
    loading: isLoading,
    error: isError ? (error?.message ?? "Price data unavailable") : null,
    dataSource: data?.source ?? "coingecko",
    fetchPrice: refetch,
  };
};
