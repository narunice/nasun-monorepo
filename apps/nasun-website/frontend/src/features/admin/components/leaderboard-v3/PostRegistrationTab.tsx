/**
 * PostRegistrationTab - Post registration form for Leaderboard V3 Admin
 *
 * Keyboard Shortcuts:
 * - 1/2/3: Select post type (Original/Quote/Reply)
 * - A/S/D: Toggle signals (Insight/Creative/High Reach)
 * - /: Focus URL input
 * - Ctrl+Enter: Submit post
 *
 * Phase 11: Role selection removed, continuous RoleMultiplier based on follower count
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { OuterBox } from "@/components/ui/OuterBox";
import { Button } from "@/components/ui/button";
import {
  usePostSubmissionForm,
  useCreatePost,
  useLeaderboardV3Account,
  usePostFormKeyboardShortcuts,
} from "../../hooks/useLeaderboardV3";
import { useAdminSeasons } from "../../hooks/useAdminSeasons";
import {
  SIGNAL_LABELS,
  BONUS_SIGNALS,
  POST_TYPE_LABELS,
  LANGUAGE_LABELS,
  LANGUAGE_SCALE,
  calculateRoleMultiplier,
  type PostType,
  type AccountLanguage,
  type SeasonStatus,
} from "../../types/leaderboard-v3";

const SEASON_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  upcoming: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ended: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// Extract username from URL for account lookup
function extractUsernameFromUrl(url: string): string | null {
  try {
    const normalized = url.replace("twitter.com", "x.com");
    const match = normalized.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function PostRegistrationTab() {
  const [submitMessage, setSubmitMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const form = usePostSubmissionForm();
  const createPostMutation = useCreatePost();
  const { seasons, isLoading: isLoadingSeasons } = useAdminSeasons();

  // Sort seasons: active first, then upcoming, then ended
  const sortedSeasons = useMemo(() => {
    if (!seasons) return [];
    const order: Record<SeasonStatus, number> = { active: 0, upcoming: 1, ended: 2, archived: 3 };
    return [...seasons]
      .filter((s) => s.status !== "archived")
      .sort((a, b) => order[a.status] - order[b.status]);
  }, [seasons]);

  // Auto-default to active season on first load
  useEffect(() => {
    if (form.seasonId === undefined && sortedSeasons.length > 0) {
      const activeSeason = sortedSeasons.find((s) => s.status === "active");
      if (activeSeason) {
        form.setSeasonId(activeSeason.seasonId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on initial seasons load
  }, [sortedSeasons]);

  // Resolve selected season name for display
  const selectedSeason = useMemo(
    () => sortedSeasons.find((s) => s.seasonId === form.seasonId),
    [sortedSeasons, form.seasonId],
  );

  // Extract username from URL for account lookup
  const extractedUsername = extractUsernameFromUrl(form.postUrl);
  const { data: accountData, isLoading: isLoadingAccount } = useLeaderboardV3Account(
    extractedUsername,
    "twitter",
    !!extractedUsername,
  );

  // Auto-fill follower data when account is found, or mark as new user
  useEffect(() => {
    if (accountData?.found && accountData.account) {
      form.setIsNewUser(false);
      // Use existing account's follower data if available
      const account = accountData.account as { followerCount?: number; language?: AccountLanguage };
      if (account.followerCount !== undefined) {
        form.setFollowerCount(account.followerCount);
      }
      if (account.language) {
        form.setLanguage(account.language);
      }
    } else if (extractedUsername && !isLoadingAccount && !accountData?.found) {
      // New user detected
      form.setIsNewUser(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- form setters are stable, adding form object would cause infinite re-renders
  }, [accountData, extractedUsername, isLoadingAccount]);

  const handleSubmit = useCallback(async () => {
    if (!form.postUrl.trim()) {
      setSubmitMessage({ type: "error", text: "Please enter a post URL" });
      return;
    }

    setSubmitMessage(null);

    try {
      const result = await createPostMutation.mutateAsync({
        request: form.buildRequest(),
      });

      if (result.isDuplicate) {
        setSubmitMessage({ type: "error", text: "This post has already been registered" });
      } else if (result.success && result.post && result.account) {
        setSubmitMessage({
          type: "success",
          text: `Post registered! @${result.account.originalUsername || result.account.username} now has ${result.account.postCount} posts (Score: ${result.post.postScore.toFixed(2)})`,
        });
        form.reset();
        urlInputRef.current?.focus();
      } else {
        setSubmitMessage({ type: "error", text: result.error || "Failed to register post" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to register post";
      setSubmitMessage({ type: "error", text: message });
    }
  }, [form, createPostMutation]);

  // Keyboard shortcuts
  const { handleKeyDown } = usePostFormKeyboardShortcuts(form, handleSubmit, urlInputRef);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Keyboard Shortcuts Reference */}
      <OuterBox color="n3" padding="sm" className="w-full">
        <h4 className="text-sm font-semibold text-nasun-white/80 mb-3 uppercase tracking-wider flex items-center gap-2">
          <span className="w-1 h-4 bg-nasun-c7 rounded-full"></span>
          Keyboard Shortcuts
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-nasun-white/60">
          <div>
            <span className="text-nasun-c7 font-mono">1 2 3</span>
            <span className="ml-2">Type</span>
          </div>
          <div>
            <span className="text-nasun-c7 font-mono">A S D</span>
            <span className="ml-2">Signals</span>
          </div>
          <div>
            <span className="text-nasun-c7 font-mono">/</span>
            <span className="ml-2">Focus URL</span>
          </div>
          <div>
            <span className="text-nasun-c7 font-mono">Ctrl+Enter</span>
            <span className="ml-2">Submit</span>
          </div>
        </div>
      </OuterBox>

      {/* Post Submission Form */}
      <OuterBox color="c6" className="w-full !border-nasun-c5/30 !bg-gray-800/30">
        <h3 className="text-xl font-medium text-nasun-white mb-6">Register Post</h3>

        <div className="space-y-6">
          {/* Target Season */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-3">
              Target Season
            </label>
            {isLoadingSeasons ? (
              <div className="text-sm text-nasun-white/40">Loading seasons...</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => form.setSeasonId(undefined)}
                  className={`px-4 py-2.5 rounded-sm text-sm font-medium transition-all border ${
                    !form.seasonId
                      ? "bg-nasun-c4 border-nasun-c4 text-nasun-white shadow-lg"
                      : "bg-gray-800/50 border-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white hover:border-nasun-c5/50"
                  }`}
                >
                  Auto (Active Season)
                </button>
                {sortedSeasons.map((season) => {
                  const isActive = form.seasonId === season.seasonId;
                  return (
                    <button
                      key={season.seasonId}
                      type="button"
                      onClick={() => form.setSeasonId(season.seasonId)}
                      className={`px-4 py-2.5 rounded-sm text-sm font-medium transition-all border ${
                        isActive
                          ? "bg-nasun-c4 border-nasun-c4 text-nasun-white shadow-lg"
                          : "bg-gray-800/50 border-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white hover:border-nasun-c5/50"
                      }`}
                    >
                      {season.name}
                      <span
                        className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase ${SEASON_STATUS_COLORS[season.status] || ""}`}
                      >
                        {season.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedSeason && (
              <div className="mt-2 text-xs text-nasun-white/40">
                {selectedSeason.startDate} - {selectedSeason.status === "ended" ? selectedSeason.endDate : "Ongoing"}
              </div>
            )}
          </div>

          {/* Post Type */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-3">
              Post Type <span className="text-nasun-c7 font-mono ml-2">1 2 3</span>
            </label>
            <div className="flex gap-3">
              {(["original", "quote", "reply"] as PostType[]).map((type, index) => {
                const shortcut = ["1", "2", "3"][index];
                const isActive = form.postType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => form.setPostType(type)}
                    className={`flex-1 px-4 py-3 rounded-sm font-medium transition-all border ${
                      isActive
                        ? "bg-nasun-c4 border-nasun-c4 text-nasun-white shadow-lg"
                        : "bg-gray-800/50 border-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white hover:border-nasun-c5/50"
                    }`}
                  >
                    <span className="text-nasun-c7 font-mono mr-2">{shortcut}</span>
                    {POST_TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* URL Input */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-2">
              Post URL <span className="text-nasun-c7 font-mono ml-2">/</span>
            </label>
            <input
              ref={urlInputRef}
              type="url"
              value={form.postUrl}
              onChange={(e) => form.setPostUrl(e.target.value)}
              placeholder="https://x.com/username/status/..."
              autoFocus
              className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c7/50 transition-colors font-mono text-sm"
            />
            {/* Account lookup status */}
            {extractedUsername && (
              <div className="mt-2 text-xs text-nasun-white/50">
                {isLoadingAccount ? (
                  <span>Looking up @{extractedUsername}...</span>
                ) : accountData?.found ? (
                  <span className="text-nasun-c7">
                    Found: @{accountData.account?.username} - {accountData.account?.postCount} posts
                    {form.followerCount !== undefined && (
                      <span className="ml-2 text-nasun-white/60">
                        (Multiplier: {form.scorePreview.roleMultiplier.toFixed(3)})
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-yellow-400">
                    New account: @{extractedUsername} - Enter language and follower count below
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Language & Follower Count - Show for both new and existing users */}
          {extractedUsername && !isLoadingAccount && (
            <div
              className={`p-4 rounded-sm space-y-4 ${
                form.isNewUser
                  ? "bg-yellow-950/20 border border-yellow-900/30"
                  : "bg-nasun-c5/10 border border-nasun-c5/30"
              }`}
            >
              <div
                className={`text-sm font-medium ${form.isNewUser ? "text-yellow-400" : "text-nasun-c7"}`}
              >
                {form.isNewUser
                  ? "New User Detected - Enter account details for multiplier calculation"
                  : "Account Multiplier Settings"}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Follower Count */}
                <div>
                  <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-2">
                    X Follower Count
                  </label>
                  <input
                    type="number"
                    value={form.followerCount ?? ""}
                    onChange={(e) =>
                      form.setFollowerCount(
                        e.target.value ? parseInt(e.target.value, 10) : undefined,
                      )
                    }
                    placeholder="e.g., 5000"
                    min="0"
                    className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-2 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c7/50 transition-colors font-mono text-sm"
                  />
                </div>

                {/* Language Selection */}
                <div>
                  <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-2">
                    Primary Language
                  </label>
                  <div className="flex gap-2">
                    {(["en", "zh", "ja", "ko"] as AccountLanguage[]).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => form.setLanguage(lang)}
                        className={`flex-1 px-3 py-2 rounded-sm text-sm font-medium transition-all border ${
                          form.language === lang
                            ? "bg-nasun-c4 border-nasun-c4 text-nasun-white"
                            : "bg-gray-800/50 border-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white hover:border-nasun-c5/50"
                        }`}
                      >
                        {LANGUAGE_LABELS[lang]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Language Scale Reference */}
              <div className="text-xs text-nasun-white/40 mt-2">
                <span className="font-medium text-nasun-white/60">
                  {LANGUAGE_LABELS[form.language]} scale:
                </span>{" "}
                ×{LANGUAGE_SCALE[form.language]} (normalized to EN equivalent)
              </div>

              {/* Calculated Multiplier */}
              {form.followerCount !== undefined && (
                <div className="text-sm flex items-center gap-4">
                  <div>
                    <span className="text-nasun-white/60">Followers:</span>{" "}
                    <span className="text-nasun-white font-mono">
                      {form.followerCount.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-nasun-white/60">Normalized:</span>{" "}
                    <span className="text-nasun-white font-mono">
                      {(form.followerCount * LANGUAGE_SCALE[form.language]).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-nasun-white/60">Multiplier:</span>{" "}
                    <span className="text-nasun-c7 font-bold font-mono">
                      {calculateRoleMultiplier(form.followerCount, form.language).toFixed(3)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Content Signals */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-3">
              Content Signals <span className="text-nasun-c7 font-mono ml-2">A S D</span>
            </label>
            <div className="flex gap-3">
              {BONUS_SIGNALS.map((signal, index) => {
                const shortcut = ["A", "S", "D"][index];
                const isActive = form.contentSignals.includes(signal);
                return (
                  <button
                    key={signal}
                    type="button"
                    onClick={() => form.toggleSignal(signal)}
                    className={`flex-1 px-4 py-3 rounded-sm font-medium transition-all border ${
                      isActive
                        ? "bg-nasun-c7/20 border-nasun-c7/50 text-nasun-c7 shadow-lg"
                        : "bg-gray-800/50 border-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white hover:border-nasun-c5/50"
                    }`}
                  >
                    <span className="text-nasun-c7 font-mono mr-2">{shortcut}</span>
                    {SIGNAL_LABELS[signal]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Score Preview */}
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-sm border border-nasun-c5/20">
            <div className="text-sm text-nasun-white/60">
              <span className="font-medium text-nasun-white">Score Preview:</span>{" "}
              {form.scorePreview.baseScore} × {form.scorePreview.roleMultiplier} +{" "}
              {form.scorePreview.signalBonus}
              <span className="ml-2 text-nasun-white/40">({POST_TYPE_LABELS[form.postType]})</span>
            </div>
            <div className="text-2xl font-bold text-nasun-c7">
              {form.scorePreview.totalScore.toFixed(2)}
            </div>
          </div>

          {/* Submit Message */}
          {submitMessage && (
            <div
              className={`p-4 rounded-sm text-sm ${
                submitMessage.type === "success"
                  ? "bg-green-950/30 border border-green-900/50 text-green-400"
                  : "bg-red-950/30 border border-red-900/50 text-red-400"
              }`}
            >
              {submitMessage.text}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-4">
            <Button
              onClick={handleSubmit}
              disabled={createPostMutation.isPending || !form.postUrl.trim()}
              variant="c4"
              size="lg"
              className="flex-1"
            >
              {createPostMutation.isPending ? "Submitting..." : "Register Post"}
              <span className="ml-2 text-xs opacity-60 font-mono">Ctrl+Enter</span>
            </Button>
            <Button onClick={form.reset} variant="outlineC5" size="lg">
              Clear
            </Button>
          </div>
        </div>
      </OuterBox>
    </div>
  );
}
