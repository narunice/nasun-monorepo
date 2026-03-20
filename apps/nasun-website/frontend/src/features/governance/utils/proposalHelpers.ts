/**
 * Shared proposal helper functions
 *
 * Extracted from ProposalItem.tsx and ProposalDetailPage.tsx
 * to eliminate duplication.
 */

import { SuiObjectData } from "@mysten/sui/client";
import { Proposal, ProposalFields, ProposalType } from "../types/voting";
import {
  MultiChoiceProposal,
  MultiChoiceProposalFields,
} from "../types/multiChoice";

export function parseProposal(data: SuiObjectData, proposalType: ProposalType): Proposal | null {
  if (data.content?.dataType !== "moveObject") return null;

  const fields = data.content.fields as ProposalFields;

  if (!fields.title || !fields.description || !fields.status || !fields.creator || !fields.voters) {
    console.error("Missing required proposal fields", fields);
    return null;
  }

  return {
    id: { id: data.objectId },
    title: fields.title,
    description: fields.description,
    status: fields.status,
    proposalType,
    yesVotes: (Number(fields.total_power_yes) || 0).toString(),
    noVotes: (Number(fields.total_power_no) || 0).toString(),
    yesCount: Number(fields.vote_count_yes) || 0,
    noCount: Number(fields.vote_count_no) || 0,
    expiration: Number(fields.expiration),
    creator: fields.creator,
    voters: fields.voters?.fields?.id?.id || "",
  };
}

/**
 * Check if an on-chain object is a MultiChoiceProposal by inspecting its type string.
 * Type string format: "{packageId}::multi_choice_proposal::MultiChoiceProposal"
 */
export function isMultiChoiceProposal(objectType: string): boolean {
  return objectType.includes("::multi_choice_proposal::MultiChoiceProposal");
}

export function parseMultiChoiceProposal(
  data: SuiObjectData,
  proposalType: ProposalType
): MultiChoiceProposal | null {
  if (data.content?.dataType !== "moveObject") return null;

  const fields = data.content.fields as MultiChoiceProposalFields;

  if (!fields.title || !fields.description || !fields.status || !fields.creator || !fields.voters) {
    console.error("Missing required multi-choice proposal fields", fields);
    return null;
  }

  return {
    id: { id: data.objectId },
    title: fields.title,
    description: fields.description,
    choices: fields.choices || [],
    choicePowers: (fields.choice_powers || []).map(Number),
    choiceCounts: (fields.choice_counts || []).map(Number),
    useEqualWeight: fields.use_equal_weight ?? false,
    expiration: Number(fields.expiration),
    creator: fields.creator,
    status: fields.status,
    proposalType,
    voters: fields.voters?.fields?.id?.id || "",
  };
}

/**
 * Calculate percentage for each choice in a multi-choice proposal.
 * Returns array of percentages (0-100) in the same order as choices.
 */
export function getChoicePercentages(choicePowers: number[]): number[] {
  const total = choicePowers.reduce((sum, p) => sum + p, 0);
  if (total === 0) return choicePowers.map(() => 0);
  return choicePowers.map((p) => Math.round((p / total) * 100));
}

/**
 * Extract tweet ID from a Twitter/X URL.
 * Supports both twitter.com and x.com domains.
 */
export function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract Twitter handle from a tweet URL (e.g., "pigrichh" from "https://x.com/pigrichh/status/123")
 */
export function extractTweetHandle(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/\d+/);
  return match ? match[1] : null;
}

/**
 * Get a display label for a choice: @handle if it's a tweet URL, otherwise the raw text.
 */
export function getChoiceLabel(
  choice: string,
  displayNames?: Map<string, string>
): string {
  const handle = extractTweetHandle(choice);
  if (!handle) return choice;
  return displayNames?.get(handle.toLowerCase()) || `@${handle}`;
}

/**
 * Check if ALL choices in a multi-choice proposal are Twitter URLs.
 * All-or-nothing: returns true only if every choice has a valid tweet ID.
 */
export function isTwitterChoiceProposal(choices: string[]): boolean {
  return choices.length > 0 && choices.every((c) => extractTweetId(c) !== null);
}

export function isUnixTimeExpired(unixTimeMs: number): boolean {
  return new Date(unixTimeMs) < new Date();
}

export function formatTimeRemaining(expirationMs: number): string {
  const remaining = expirationMs - Date.now();
  if (remaining <= 0) return "Ended";

  const d = Math.floor(remaining / 86400000);
  const h = Math.floor((remaining % 86400000) / 3600000);

  if (d > 0) return `${d}d ${h}h left`;

  const m = Math.floor((remaining % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export interface StatusBadge {
  bg: string;
  text: string;
  label: string;
}

export function getStatusBadge(isDelisted: boolean, isExpired: boolean, hasPassed: boolean): StatusBadge {
  if (isDelisted) {
    return { bg: "bg-gray-500/20 border-gray-500/30", text: "text-gray-400", label: "Delisted" };
  }
  if (isExpired) {
    return hasPassed
      ? { bg: "bg-nasun-nw1/20 border-nasun-nw1/30", text: "text-nasun-nw1", label: "Passed" }
      : { bg: "bg-red-500/20 border-red-500/30", text: "text-red-400", label: "Failed" };
  }
  return { bg: "bg-green-500/20 border-green-500/30", text: "text-green-400", label: "Active" };
}

/**
 * Convert hex string to byte array (browser-compatible).
 * Returns empty array if input is invalid.
 */
export function hexToBytes(hex: string): number[] {
  const matches = hex.match(/.{2}/g);
  if (!matches) return [];
  return Array.from(Uint8Array.from(matches, (b) => parseInt(b, 16)));
}

/**
 * Splits "YES: ..." / "NO: ..." lines from the end of a proposal description
 * into a separate choices array for highlighted rendering.
 */
export function splitVoteChoices(description: string): {
  body: string;
  choices: { label: string; text: string }[];
} {
  const lines = description.split("\n");
  const choicePattern = /^(YES|NO)\s*:\s*(.+)/i;

  let splitIdx = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (choicePattern.test(trimmed)) {
      splitIdx = i;
    } else if (trimmed === "") {
      continue;
    } else {
      break;
    }
  }

  const bodyLines = lines.slice(0, splitIdx);
  const choiceLines = lines.slice(splitIdx).filter((l) => l.trim());

  const choices = choiceLines
    .map((line) => {
      const match = line.trim().match(choicePattern);
      return match
        ? { label: match[1].toUpperCase(), text: match[2].trim() }
        : null;
    })
    .filter((c): c is { label: string; text: string } => c !== null);

  return {
    body: bodyLines.join("\n").trimEnd(),
    choices,
  };
}
