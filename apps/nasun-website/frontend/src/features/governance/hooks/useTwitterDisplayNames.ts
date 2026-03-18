import { useState, useEffect, useMemo } from "react";
import { extractTweetHandle } from "../utils/proposalHelpers";
import { getAccountByUsername } from "@/features/leaderboard-v3/services/leaderboardV3Api";

/**
 * Resolves Twitter handles from choice URLs to display names via batch API lookup.
 * Uses Promise.allSettled for resilience (one failure won't break others).
 * Falls back to @handle if display name is not found.
 */
export function useTwitterDisplayNames(choices: string[]) {
  const [displayNames, setDisplayNames] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

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
          return { handle, name };
        }
        return { handle, name: null };
      })
    ).then((results) => {
      const map = new Map<string, string>();
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.name) {
          map.set(result.value.handle, result.value.name);
        }
      }
      setDisplayNames(map);
      setIsLoading(false);
    });
  }, [handles]);

  return { displayNames, isLoading };
}
