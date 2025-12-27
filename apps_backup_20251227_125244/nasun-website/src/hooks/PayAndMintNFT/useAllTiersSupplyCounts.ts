import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface SupplyCounts {
  [tier: string]: number;
}

interface SupplyResponse {
  success: boolean;
  counts: SupplyCounts;
}

// This endpoint URL will be populated from the environment variables.
// It should correspond to the `GetAllSupplyCountsApiUrl` output from the CDK deployment.
const ALL_SUPPLY_COUNTS_ENDPOINT = import.meta.env.VITE_ALL_SUPPLY_COUNTS_API_ENDPOINT;

const fetchAllSupplyCounts = async (): Promise<SupplyCounts> => {
  if (!ALL_SUPPLY_COUNTS_ENDPOINT) {
    throw new Error("VITE_ALL_SUPPLY_COUNTS_API_ENDPOINT is not configured in .env file");
  }

  const response = await axios.get<SupplyResponse>(ALL_SUPPLY_COUNTS_ENDPOINT);
  if (response.data && response.data.success) {
    return response.data.counts;
  }
  throw new Error("Failed to fetch supply counts or API returned an error.");
};

export const useAllTiersSupplyCounts = () => {
  const {
    data: counts,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<SupplyCounts, Error>({
    queryKey: ["allSupplyCounts"], // A single key for all tiers
    queryFn: fetchAllSupplyCounts,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60, // Refetch every 1 minute
  });

  return {
    counts,
    isLoading,
    isError,
    error: error ? error.message : null,
    refetch
  };
};