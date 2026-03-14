/**
 * FeaturedFeedTab - Admin curation of the featured posts feed
 *
 * Allows admin to select posts, assign badges, reorder, and save
 * the curated feed that appears on the leaderboard sidebar.
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { OuterBox } from "@/components/ui/OuterBox";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import {
  getCuratedFeed,
  setCuratedFeed,
  getAccount,
  type CuratedFeedEntry,
  type EnrichedFeedItem,
} from "../../services/leaderboardV3Api";

const BADGE_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "rank-1", label: "Rank 1" },
  { value: "rank-2", label: "Rank 2" },
  { value: "rank-3", label: "Rank 3" },
  { value: "ranker", label: "Ranker" },
  { value: "climber-1", label: "Climber 1" },
  { value: "climber-2", label: "Climber 2" },
  { value: "climber-3", label: "Climber 3" },
] as const;

interface LocalFeedItem extends CuratedFeedEntry {
  // Enriched display data (from GET response)
  username?: string;
  postUrl?: string;
}

export function FeaturedFeedTab() {
  const { cognitoToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<LocalFeedItem[]>([]);
  const [postUrl, setPostUrl] = useState("");
  const [selectedBadge, setSelectedBadge] = useState("featured");
  const [showConfirm, setShowConfirm] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current curated feed
  const { data: feedData, isLoading } = useQuery({
    queryKey: ["admin", "curated-feed"],
    queryFn: () => getCuratedFeed(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 30_000,
  });

  // Sync fetched data to local state
  useEffect(() => {
    if (feedData?.items) {
      // Join by postId (not index) to handle deleted posts in enrichedItems
      const enrichedMap = new Map(
        (feedData.enrichedItems || []).map((e) => [e.postId, e])
      );
      const localItems: LocalFeedItem[] = feedData.items.map((item) => {
        const enriched = enrichedMap.get(item.postId);
        return {
          ...item,
          username: enriched?.author?.username || enriched?.author?.originalUsername,
          postUrl: enriched?.content?.postUrl,
        };
      });
      setItems(localItems);
      setHasChanges(false);
    }
  }, [feedData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (entries: CuratedFeedEntry[]) =>
      setCuratedFeed(cognitoToken!, entries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "curated-feed"] });
      setHasChanges(false);
    },
  });

  // Add post by URL
  const handleAddPost = useCallback(async () => {
    if (!postUrl.trim()) return;

    setLookupStatus("Looking up post...");

    try {
      // Extract username from X URL: https://x.com/username/status/123
      const urlMatch = postUrl.match(
        /(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/
      );
      if (!urlMatch) {
        setLookupStatus("Invalid X post URL format");
        return;
      }

      const username = urlMatch[1];

      // Look up the account to find the post
      const accountData = await getAccount(username);
      if (!accountData.found || !accountData.recentPosts) {
        setLookupStatus(`Account @${username} not found in leaderboard`);
        return;
      }

      // Extract tweet ID for strict matching
      const tweetId = urlMatch[2];

      // Find the post by matching tweet ID in URL
      const post = accountData.recentPosts.find((p: { postUrl: string }) => {
        const match = p.postUrl.match(/\/status\/(\d+)/);
        return match && match[1] === tweetId;
      });

      if (!post) {
        setLookupStatus(
          `Post not found in @${username}'s registered posts. Register it first in the Post tab.`
        );
        return;
      }

      // Check for duplicate
      if (items.some((i) => i.postId === post.postId)) {
        setLookupStatus("This post is already in the feed");
        return;
      }

      const newItem: LocalFeedItem = {
        postId: post.postId,
        badge: selectedBadge,
        order: items.length + 1,
        username: accountData.account?.originalUsername || accountData.account?.username || username,
        postUrl: post.postUrl,
      };

      setItems((prev) => [...prev, newItem]);
      setPostUrl("");
      setLookupStatus(null);
      setHasChanges(true);
    } catch (error) {
      setLookupStatus(
        error instanceof Error ? error.message : "Lookup failed"
      );
    }
  }, [postUrl, selectedBadge, items]);

  // Reorder
  const moveItem = useCallback((index: number, direction: "up" | "down") => {
    setItems((prev) => {
      const arr = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= arr.length) return prev;
      [arr[index], arr[targetIndex]] = [arr[targetIndex], arr[index]];
      return arr.map((item, i) => ({ ...item, order: i + 1 }));
    });
    setHasChanges(true);
  }, []);

  // Remove
  const removeItem = useCallback((index: number) => {
    setItems((prev) =>
      prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i + 1 }))
    );
    setHasChanges(true);
  }, []);

  // Update badge
  const updateBadge = useCallback((index: number, badge: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, badge } : item))
    );
    setHasChanges(true);
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    setShowConfirm(false);
    const entries: CuratedFeedEntry[] = items.map((item, idx) => ({
      postId: item.postId,
      badge: item.badge,
      order: idx + 1,
    }));
    await saveMutation.mutateAsync(entries);
  }, [items, saveMutation]);

  if (isLoading) {
    return (
      <OuterBox className="p-6">
        <p className="text-nasun-white/60">Loading curated feed...</p>
      </OuterBox>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Feed */}
      <OuterBox className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-nasun-white">
            Curated Feed ({items.length}/15)
          </h3>
          {feedData?.updatedAt && (
            <span className="text-xs text-nasun-white/40">
              Last saved: {new Date(feedData.updatedAt).toLocaleString("en-US")} by{" "}
              {feedData.updatedBy}
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-nasun-white/40 text-sm">
            No curated posts yet. Add posts below to start curating the feed.
            The algorithmic feed will be used as fallback.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={item.postId}
                className="flex items-center gap-3 p-3 bg-gray-800/50 rounded border border-nasun-c5/20"
              >
                {/* Order number */}
                <span className="text-nasun-white/40 text-sm font-mono w-6 text-center">
                  {index + 1}
                </span>

                {/* Post info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-nasun-white text-sm font-medium truncate">
                      @{item.username || "unknown"}
                    </span>
                    {item.postUrl && (
                      <a
                        href={item.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-nasun-c7 text-xs hover:underline truncate max-w-[200px]"
                      >
                        {item.postUrl.replace(/https?:\/\/(x|twitter)\.com\//, "")}
                      </a>
                    )}
                  </div>
                  <span className="text-nasun-white/30 text-xs font-mono">
                    {item.postId.slice(0, 8)}...
                  </span>
                </div>

                {/* Badge selector */}
                <select
                  value={item.badge}
                  onChange={(e) => updateBadge(index, e.target.value)}
                  className="bg-gray-700 text-nasun-white text-xs rounded px-2 py-1 border border-nasun-c5/20"
                >
                  {BADGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveItem(index, "up")}
                    disabled={index === 0}
                    className="text-nasun-white/40 hover:text-nasun-white disabled:opacity-20 text-xs px-1"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveItem(index, "down")}
                    disabled={index === items.length - 1}
                    className="text-nasun-white/40 hover:text-nasun-white disabled:opacity-20 text-xs px-1"
                  >
                    ▼
                  </button>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => removeItem(index)}
                  className="text-red-400/60 hover:text-red-400 text-sm px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Save button */}
        {hasChanges && (
          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={saveMutation.isPending}
              className="bg-nasun-c4 hover:bg-nasun-c4/80 text-white"
            >
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
            {saveMutation.isError && (
              <span className="text-red-400 text-sm">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Save failed"}
              </span>
            )}
            {saveMutation.isSuccess && (
              <span className="text-green-400 text-sm">Saved successfully</span>
            )}
          </div>
        )}
      </OuterBox>

      {/* Add Post Form */}
      <OuterBox className="p-6">
        <h3 className="text-lg font-semibold text-nasun-white mb-4">
          Add Post
        </h3>

        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={postUrl}
              onChange={(e) => {
                setPostUrl(e.target.value);
                setLookupStatus(null);
              }}
              placeholder="Paste X post URL (e.g., https://x.com/user/status/123)"
              className="flex-1 bg-gray-800 text-nasun-white rounded px-3 py-2 text-sm border border-nasun-c5/20 placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4"
              onKeyDown={(e) => e.key === "Enter" && handleAddPost()}
            />

            <select
              value={selectedBadge}
              onChange={(e) => setSelectedBadge(e.target.value)}
              className="bg-gray-800 text-nasun-white text-sm rounded px-3 py-2 border border-nasun-c5/20"
            >
              {BADGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <Button
              onClick={handleAddPost}
              disabled={!postUrl.trim() || items.length >= 15}
              className="bg-nasun-c4 hover:bg-nasun-c4/80 text-white px-6"
            >
              Add
            </Button>
          </div>

          {lookupStatus && (
            <p className={`text-sm ${lookupStatus.includes("not found") || lookupStatus.includes("Invalid") || lookupStatus.includes("already") ? "text-yellow-400" : "text-nasun-white/60"}`}>
              {lookupStatus}
            </p>
          )}

          <p className="text-nasun-white/30 text-xs">
            The post must already be registered in the Post tab. Paste the full X
            post URL to look it up.
          </p>
        </div>
      </OuterBox>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-nasun-c5/30 rounded-lg p-6 max-w-md w-full mx-4">
            <h4 className="text-lg font-semibold text-nasun-white mb-3">
              Save Curated Feed?
            </h4>
            <p className="text-nasun-white/60 text-sm mb-6">
              This will replace the current featured feed with {items.length}{" "}
              curated post{items.length !== 1 ? "s" : ""}. The change takes
              effect immediately on the public leaderboard page.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="border-nasun-c5/30 text-nasun-white/60"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-nasun-c4 hover:bg-nasun-c4/80 text-white"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
