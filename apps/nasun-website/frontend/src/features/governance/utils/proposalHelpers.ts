/**
 * Shared proposal helper functions
 *
 * Extracted from ProposalItem.tsx and ProposalDetailPage.tsx
 * to eliminate duplication.
 */

import { SuiObjectData } from "@mysten/sui/client";
import { Proposal, ProposalFields, ProposalType } from "../types/voting";

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
    expiration: Number(fields.expiration),
    creator: fields.creator,
    voters: fields.voters?.fields?.id?.id || "",
  };
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
      ? { bg: "bg-nasun-c4/20 border-nasun-c4/30", text: "text-nasun-c4", label: "Passed" }
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
