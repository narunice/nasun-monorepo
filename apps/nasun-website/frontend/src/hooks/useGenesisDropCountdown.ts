/**
 * useGenesisDropCountdown Hook
 *
 * State machine that determines the countdown target and display text
 * based on the user's allowlist status and mint ownership.
 */

import { useState, useEffect } from "react";
import {
  STAGE_START_TIMES,
  MINT_CLOSE_TIME,
  calcTimeLeft,
  type TimeLeft,
} from "@/constants/nft-drop";

type DropPhase = "BEFORE" | "DURING" | "AFTER_STAGE" | "MINTED" | "ENDED";

interface GenesisDropCountdown {
  title: string;
  subtitle: string;
  countdownLabel: string | null;
  timeLeft: TimeLeft | null;
  phase: DropPhase;
}

function getUserStage(
  mintType: string | null,
  isRegistered: boolean,
): number {
  if (mintType === "FREE_MINT") return 1;
  if (mintType === "GUARANTEED") return 2;
  if (isRegistered) return 3; // FCFS
  return 4; // Public
}

function getEligibilityText(stage: number): string {
  switch (stage) {
    case 1: return "You are eligible for Free Mint.";
    case 2: return "You are eligible for GTD Allowlist.";
    case 3: return "You are eligible for FCFS Allowlist.";
    default: return "You can mint in public stage.";
  }
}

function getStageName(stage: number): string {
  switch (stage) {
    case 1: return "Free Mint";
    case 2: return "GTD Allowlist";
    case 3: return "FCFS Allowlist";
    default: return "Public";
  }
}

function getNextStageStart(stage: number): Date {
  // The end of a stage is the start of the next stage
  // Stage 4 (public) ends at MINT_CLOSE_TIME
  return STAGE_START_TIMES[stage + 1] ?? MINT_CLOSE_TIME;
}

function computeState(
  userStage: number,
  hasMinted: boolean,
  now: number,
): GenesisDropCountdown {
  const mintCloseMs = MINT_CLOSE_TIME.getTime();

  // All minting ended
  if (now >= mintCloseMs) {
    return {
      title: "GENESIS PASS DROP ENDED",
      subtitle: "Minting has closed.",
      countdownLabel: null,
      timeLeft: null,
      phase: "ENDED",
    };
  }

  // User already minted - show mint close countdown
  if (hasMinted) {
    const tl = calcTimeLeft(MINT_CLOSE_TIME, now);
    return {
      title: "GENESIS PASS DROP LIVE",
      subtitle: "Minted.",
      countdownLabel: "Mint closes in",
      timeLeft: tl,
      phase: "MINTED",
    };
  }

  const stageStart = STAGE_START_TIMES[userStage];
  const stageEnd = getNextStageStart(userStage);

  // Before user's stage
  if (now < stageStart.getTime()) {
    const tl = calcTimeLeft(stageStart, now);
    return {
      title: "GENESIS PASS DROP SOON",
      subtitle: getEligibilityText(userStage),
      countdownLabel: "Starts in",
      timeLeft: tl,
      phase: "BEFORE",
    };
  }

  // During user's stage
  if (now < stageEnd.getTime()) {
    // Public stage has no "next stage" boundary, countdown to mint close
    if (userStage === 4) {
      const tl = calcTimeLeft(MINT_CLOSE_TIME, now);
      return {
        title: "GENESIS PASS DROP LIVE",
        subtitle: "Public mint is now open.",
        countdownLabel: "Mint closes in",
        timeLeft: tl,
        phase: "DURING",
      };
    }
    const tl = calcTimeLeft(stageEnd, now);
    return {
      title: "GENESIS PASS DROP LIVE",
      subtitle: getEligibilityText(userStage),
      countdownLabel: "Stage ends in",
      timeLeft: tl,
      phase: "DURING",
    };
  }

  // After user's stage ended
  const tl = calcTimeLeft(MINT_CLOSE_TIME, now);
  return {
    title: "GENESIS PASS DROP LIVE",
    subtitle: `${getStageName(userStage)} stage has ended.`,
    countdownLabel: "Mint closes in",
    timeLeft: tl,
    phase: "AFTER_STAGE",
  };
}

export function useGenesisDropCountdown(
  mintType: string | null,
  isRegistered: boolean,
  hasMinted: boolean,
): GenesisDropCountdown {
  const userStage = getUserStage(mintType, isRegistered);

  const [state, setState] = useState<GenesisDropCountdown>(() =>
    computeState(userStage, hasMinted, Date.now()),
  );

  useEffect(() => {
    const tick = () => setState(computeState(userStage, hasMinted, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [userStage, hasMinted]);

  return state;
}
