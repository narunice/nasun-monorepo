/**
 * PostEditModal - Modal for editing post fields from Dashboard Recent Activity
 *
 * Allows admins to fix incorrectly entered fields before the next snapshot.
 * Editable: postScore, accountRole, contentSignals, platform, username
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEditPost } from "../../hooks/useEditPost";
import {
  ROLE_LABELS,
  SIGNAL_LABELS,
  type ContentSignal,
  type AccountRole,
  type Platform,
} from "../../types/leaderboard-v3";

interface PostEditData {
  postId: string;
  platform?: string;
  username?: string;
  originalUsername?: string;
  postUrl?: string;
  postScore?: number;
  accountRole?: string;
  contentSignals?: string[];
}

interface PostEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: PostEditData | null;
}

const PLATFORMS: Platform[] = ["twitter", "discord", "farcaster"];
const ROLES: AccountRole[] = ["default", "proactive_ct", "kol"];
const SIGNALS: ContentSignal[] = ["standard", "insight", "creative", "high_reach"];

export function PostEditModal({ open, onOpenChange, post }: PostEditModalProps) {
  const editPost = useEditPost();

  const [platform, setPlatform] = useState<string>("");
  const [username, setUsername] = useState("");
  const [postScore, setPostScore] = useState("");
  const [accountRole, setAccountRole] = useState<string>("default");
  const [contentSignals, setContentSignals] = useState<string[]>(["standard"]);
  const [scoreError, setScoreError] = useState("");

  // Reset form when post changes
  useEffect(() => {
    if (post) {
      setPlatform(post.platform || "twitter");
      setUsername(post.username || "");
      setPostScore(post.postScore?.toString() || "0");
      setAccountRole(post.accountRole || "default");
      setContentSignals(post.contentSignals || ["standard"]);
    }
  }, [post]);

  const handleSignalToggle = (signal: string) => {
    if (signal === "standard") return; // standard is always included
    setContentSignals((prev) =>
      prev.includes(signal) ? prev.filter((s) => s !== signal) : [...prev, signal]
    );
  };

  const handleSave = () => {
    if (!post) return;

    const scoreNum = parseFloat(postScore);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 10) {
      setScoreError("Post score must be a number between 0 and 10");
      return;
    }
    setScoreError("");

    const updates: Record<string, unknown> = {};

    if (platform !== post.platform) updates.platform = platform;
    if (username !== post.username) updates.username = username.toLowerCase();
    if (username !== post.username) updates.originalUsername = username;
    if (scoreNum !== post.postScore) updates.postScore = scoreNum;
    if (accountRole !== post.accountRole) updates.accountRole = accountRole;
    if (JSON.stringify(contentSignals.sort()) !== JSON.stringify((post.contentSignals || []).sort())) {
      updates.contentSignals = contentSignals;
    }

    if (Object.keys(updates).length === 0) {
      onOpenChange(false);
      return;
    }

    editPost.mutate(
      { postId: post.postId, updates },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  if (!post) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-gray-900 !border-nasun-c5/30 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-nasun-white">Edit Post</DialogTitle>
          <DialogDescription className="text-nasun-white/50 text-xs truncate">
            {post.postUrl}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Platform */}
          <div>
            <label className="text-xs text-nasun-white/60 mb-1 block">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full bg-gray-800 border border-nasun-c5/30 rounded-sm px-3 py-2 text-sm text-nasun-white focus:outline-none focus:border-nasun-c4"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p === "twitter" ? "X (Twitter)" : p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Username */}
          <div>
            <label className="text-xs text-nasun-white/60 mb-1 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-800 border border-nasun-c5/30 rounded-sm px-3 py-2 text-sm text-nasun-white focus:outline-none focus:border-nasun-c4"
            />
          </div>

          {/* Post Score */}
          <div>
            <label className="text-xs text-nasun-white/60 mb-1 block">Post Score (0-10)</label>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={postScore}
              onChange={(e) => {
                setPostScore(e.target.value);
                setScoreError("");
              }}
              className="w-full bg-gray-800 border border-nasun-c5/30 rounded-sm px-3 py-2 text-sm text-nasun-white focus:outline-none focus:border-nasun-c4"
            />
            {scoreError && (
              <span className="text-red-400 text-xs mt-1">{scoreError}</span>
            )}
          </div>

          {/* Account Role */}
          <div>
            <label className="text-xs text-nasun-white/60 mb-1 block">Account Role</label>
            <select
              value={accountRole}
              onChange={(e) => setAccountRole(e.target.value)}
              className="w-full bg-gray-800 border border-nasun-c5/30 rounded-sm px-3 py-2 text-sm text-nasun-white focus:outline-none focus:border-nasun-c4"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {/* Content Signals */}
          <div>
            <label className="text-xs text-nasun-white/60 mb-1 block">Content Signals</label>
            <div className="flex flex-wrap gap-2">
              {SIGNALS.map((signal) => (
                <button
                  key={signal}
                  type="button"
                  onClick={() => handleSignalToggle(signal)}
                  disabled={signal === "standard"}
                  className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-all ${
                    contentSignals.includes(signal)
                      ? "bg-nasun-c4 text-nasun-white"
                      : "bg-gray-700/50 text-nasun-white/50 hover:text-nasun-white"
                  } ${signal === "standard" ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {SIGNAL_LABELS[signal]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="outlineC5"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={editPost.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={editPost.isPending || !username.trim()}
          >
            {editPost.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>

        {editPost.isError && (
          <div className="text-red-400 text-xs mt-2">
            {editPost.error instanceof Error ? editPost.error.message : "Failed to save"}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
