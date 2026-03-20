/**
 * useProposalType Hook
 *
 * Queries the ProposalTypeRegistry to determine if a proposal is
 * Governance (user pays gas) or Poll (sponsored/zero gas).
 */

import { useSuiClientQuery } from "@mysten/dapp-kit";
import { ProposalType } from "../types/voting";

const PROPOSAL_TYPE_REGISTRY_ID = import.meta.env.VITE_PROPOSAL_TYPE_REGISTRY_ID;

interface UseProposalTypeResult {
  proposalType: ProposalType;
  isSponsored: boolean;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Get proposal type from the ProposalTypeRegistry
 * Defaults to "Governance" if not found or registry not configured
 */
export function useProposalType(proposalId: string): UseProposalTypeResult {
  const isRegistryConfigured = !!PROPOSAL_TYPE_REGISTRY_ID;

  // Get the registry to find the types table ID
  const {
    data: registryData,
    isPending: isRegistryPending,
    error: registryError,
  } = useSuiClientQuery("getObject", {
    id: PROPOSAL_TYPE_REGISTRY_ID || "0x0", // Dummy ID when not configured
    options: { showContent: true },
  }, {
    enabled: isRegistryConfigured,
    retry: false,
    throwOnError: false,
  });

  // Extract types table ID from registry
  const typesTableId = registryData?.data?.content?.dataType === "moveObject"
    ? (registryData.data.content.fields as Record<string, unknown>)?.types
      ? ((registryData.data.content.fields as Record<string, unknown>).types as { fields: { id: { id: string } } })?.fields?.id?.id
      : null
    : null;

  // Query dynamic field for proposal type
  // retry: false - missing entries should not be retried (proposal may predate the registry)
  // throwOnError: false - never crash the component for a missing type entry
  const {
    data: dynamicFieldData,
    isPending: isFieldPending,
    error: fieldError,
  } = useSuiClientQuery("getDynamicFieldObject", {
    parentId: typesTableId || "",
    name: { type: "0x2::object::ID", value: proposalId },
  }, {
    enabled: !!typesTableId && !!proposalId,
    retry: false,
    throwOnError: false,
  });

  // Determine proposal type from dynamic field
  let proposalType: ProposalType = "Governance"; // Default

  if (dynamicFieldData?.data?.content?.dataType === "moveObject") {
    const fields = dynamicFieldData.data.content.fields as Record<string, unknown>;
    const value = fields.value as { variant: string } | undefined;
    if (value?.variant === "Poll") {
      proposalType = "Poll";
    }
  }

  // Only consider loading if registry is configured and queries are actually pending
  const isLoading = isRegistryConfigured && (isRegistryPending || isFieldPending);
  const error = registryError || fieldError;

  return {
    proposalType,
    isSponsored: proposalType === "Poll",
    isLoading,
    error,
  };
}

export default useProposalType;
