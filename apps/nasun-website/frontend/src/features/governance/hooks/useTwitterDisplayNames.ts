import { useState, useEffect, useMemo } from "react";
import { extractTweetHandle } from "../utils/proposalHelpers";
import { getAccountByUsername } from "@/features/leaderboard-v3/services/leaderboardV3Api";

export interface TwitterProfile {
  displayName: string;
  profileImageUrl?: string;
}

/**
 * Resolves Twitter handles from choice URLs to profiles via batch API lookup.
 * Returns both a profiles Map (with displayName + profileImageUrl) and
 * a displayNames Map (string only) for backwards compatibility with getChoiceLabel.
 */
export function useTwitterDisplayNames(choices: string[]) {
  const [profiles, setProfiles] = useState<Map<string, TwitterProfile>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const displayNames = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((v, k) => map.set(k, v.displayName));
    return map;
  }, [profiles]);

  const handles = useMemo(() => {
    const result: { idx: number; handle: string }[] = [];
    for (let i = 0; i < choices.length; i++) {
      const handle = extractTweetHandle(choices[i]);
      if (handle) result.push({ idx: i, handle: handle.toLowerCase() });
    }
    return result;
  }, [choices]);

  useEffect(() => {
    if (handles.length === 0) return;

    const uniqueHandles = [...new Set(handles.map((h) => h.handle))];

    setIsLoading(true);

    Promise.allSettled(
      uniqueHandles.map(async (handle) => {
        const result = await getAccountByUsername(handle, "twitter");
        if (result.found && result.account) {
          const name =
            result.account.displayName ||
            result.account.originalUsername ||
            result.account.username;
          return {
            handle,
            name,
            profileImageUrl: result.account.profileImageUrl,
          };
        }
        return { handle, name: null, profileImageUrl: undefined };
      })
    ).then((results) => {
      const map = new Map<string, TwitterProfile>();
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.name) {
          map.set(result.value.handle, {
            displayName: result.value.name,
            profileImageUrl: result.value.profileImageUrl,
          });
        }
      }
      setProfiles(map);
      setIsLoading(false);
    });
  }, [handles]);

  return { displayNames, profiles, isLoading };
}
