/**
 * useDropPageState - State machine for the Genesis Pass Drop page.
 *
 * Manages the gated experience: DISCONNECTED -> CHECKING -> GATED/MINT_READY/ERROR.
 * Uses useReducer for explicit state transitions.
 */

import { useReducer, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import { useGenesisPassStatus } from "@/hooks/useGenesisPassStatus";
import { MINT_CLOSE_TIME } from "@/constants/nft-drop";

// -- Types --

export interface EligibilityData {
  eligible: boolean;
  registered: boolean;
  eligibleStage: number | null;
  eligibleStageLabel: string | null;
  currentStageLabel: string | null;
}

export type Phase =
  | { type: "DISCONNECTED" }
  | { type: "CHECKING" }
  | { type: "GATED"; eligible: boolean; modalOpen: boolean; eligibility: EligibilityData }
  | { type: "MINT_READY" }
  | { type: "ERROR"; message: string };

type Action =
  | { type: "START_CHECK" }
  | { type: "RESOLVE_ELIGIBLE"; eligibility: EligibilityData }
  | { type: "RESOLVE_INELIGIBLE"; eligibility: EligibilityData }
  | { type: "RESOLVE_OWNED" }
  | { type: "RESOLVE_ERROR"; message: string }
  | { type: "PROCEED_TO_MINT" }
  | { type: "CLOSE_MODAL" }
  | { type: "DISCONNECT" }
  | { type: "RETRY" };

// -- Reducer --

function reducer(state: Phase, action: Action): Phase {
  switch (action.type) {
    case "DISCONNECT":
      return { type: "DISCONNECTED" };

    case "START_CHECK":
      return { type: "CHECKING" };

    case "RESOLVE_ELIGIBLE":
      return { type: "GATED", eligible: true, modalOpen: true, eligibility: action.eligibility };

    case "RESOLVE_INELIGIBLE":
      return { type: "GATED", eligible: false, modalOpen: true, eligibility: action.eligibility };

    case "RESOLVE_OWNED":
      return { type: "MINT_READY" };

    case "RESOLVE_ERROR":
      return { type: "ERROR", message: action.message };

    case "PROCEED_TO_MINT":
      if (state.type === "GATED" && state.eligible) {
        return { type: "MINT_READY" };
      }
      return state;

    case "CLOSE_MODAL":
      if (state.type === "GATED" && !state.eligible) {
        return { ...state, modalOpen: false };
      }
      return state;

    case "RETRY":
      if (state.type === "ERROR") {
        return { type: "CHECKING" };
      }
      return state;

    default:
      return state;
  }
}

// -- SessionStorage helpers --

const GATE_PASSED_PREFIX = "nasun:gate-passed:";

function isGatePassed(address: string): boolean {
  try {
    return sessionStorage.getItem(`${GATE_PASSED_PREFIX}${address.toLowerCase()}`) === "1";
  } catch {
    return false;
  }
}

function markGatePassed(address: string): void {
  try {
    sessionStorage.setItem(`${GATE_PASSED_PREFIX}${address.toLowerCase()}`, "1");
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

// -- Hook --

interface UseDropPageStateParams {
  currentStage: number;
  hasMinted: boolean;
  hasReachedLimit: boolean;
  ownershipLoading: boolean;
  address: string | undefined;
}

export function useDropPageState({
  currentStage,
  hasMinted,
  hasReachedLimit,
  ownershipLoading,
  address,
}: UseDropPageStateParams) {
  const { isConnected } = useAccount();
  const [phase, dispatch] = useReducer(reducer, { type: "DISCONNECTED" });

  // Lock: once eligible user enters MINT_READY, prevent re-evaluation
  const lockedRef = useRef(false);
  // Track the stage at which ineligible was determined, so stage changes trigger re-check
  const lastCheckedStageRef = useRef<number | null>(null);

  // Use public mode only (no cognitoToken) so /check endpoint returns eligible fields
  const {
    eligible,
    eligibleStage,
    eligibleStageLabel,
    currentStageLabel,
    isRegistered,
    isLoading: statusLoading,
    error: statusError,
  } = useGenesisPassStatus(
    isConnected ? address : null,
    null, // force public mode
  );

  const isDropEnded = currentStage === 0 && Date.now() >= MINT_CLOSE_TIME.getTime();

  // -- Disconnect handler --
  useEffect(() => {
    if (!isConnected) {
      lockedRef.current = false;
      lastCheckedStageRef.current = null;
      dispatch({ type: "DISCONNECT" });
    }
  }, [isConnected]);

  // -- Main state transition logic --
  useEffect(() => {
    if (!isConnected || !address) return;
    if (lockedRef.current) return;

    // SessionStorage bypass for re-visits
    if (phase.type === "DISCONNECTED" || phase.type === "CHECKING") {
      if (isGatePassed(address)) {
        lockedRef.current = true;
        dispatch({ type: "RESOLVE_OWNED" });
        return;
      }
    }

    // Transition to CHECKING on connect
    if (phase.type === "DISCONNECTED") {
      dispatch({ type: "START_CHECK" });
      return;
    }

    // Wait for ownership check to complete
    if (phase.type === "CHECKING") {
      if (ownershipLoading) return;

      // Already owns or reached limit -> bypass
      if (hasMinted || hasReachedLimit) {
        lockedRef.current = true;
        markGatePassed(address);
        dispatch({ type: "RESOLVE_OWNED" });
        return;
      }

      // Wait for eligibility API
      if (statusLoading) return;

      if (statusError) {
        dispatch({ type: "RESOLVE_ERROR", message: "Failed to check eligibility. Please try again." });
        return;
      }

      const eligibilityData: EligibilityData = {
        eligible,
        registered: isRegistered,
        eligibleStage: eligibleStage ?? null,
        eligibleStageLabel: eligibleStageLabel ?? null,
        currentStageLabel: currentStageLabel ?? null,
      };

      // Paused (stage 0) -> nobody can enter regardless of API eligibility
      // Public stage (4) or eligible -> show gate modal (eligible path)
      if (currentStage > 0 && (currentStage === 4 || eligible)) {
        lastCheckedStageRef.current = currentStage;
        dispatch({ type: "RESOLVE_ELIGIBLE", eligibility: eligibilityData });
      } else {
        lastCheckedStageRef.current = currentStage;
        dispatch({ type: "RESOLVE_INELIGIBLE", eligibility: eligibilityData });
      }
    }
  }, [
    isConnected, address, phase.type, ownershipLoading,
    hasMinted, hasReachedLimit, statusLoading, statusError,
    eligible, isRegistered, eligibleStage, eligibleStageLabel,
    currentStageLabel, currentStage,
  ]);

  // -- Auto re-evaluate ineligible users when stage changes --
  useEffect(() => {
    if (phase.type !== "GATED" || phase.eligible) return;
    if (lastCheckedStageRef.current === null) return;
    if (currentStage !== lastCheckedStageRef.current) {
      lastCheckedStageRef.current = null;
      dispatch({ type: "START_CHECK" });
    }
  }, [phase, currentStage]);

  // -- Actions --
  const proceedToMint = useCallback(() => {
    if (address) {
      lockedRef.current = true;
      markGatePassed(address);
      try { sessionStorage.setItem("nasun:lore-seen", "1"); } catch {}
    }
    dispatch({ type: "PROCEED_TO_MINT" });
  }, [address]);

  const closeGateModal = useCallback(() => {
    dispatch({ type: "CLOSE_MODAL" });
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: "RETRY" });
  }, []);

  return {
    phase,
    proceedToMint,
    closeGateModal,
    retry,
    isDropEnded,
  };
}
