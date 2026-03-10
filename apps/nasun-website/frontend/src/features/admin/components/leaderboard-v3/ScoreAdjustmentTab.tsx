/**
 * ScoreAdjustmentTab - Manual score adjustment for leaderboard accounts
 *
 * Allows admin to grant/deduct points for contributions not captured
 * by post registration (e.g., reposts, event participation).
 */

import { useState, useCallback } from "react";
import { OuterBox } from "@/components/ui/OuterBox";
import { Button } from "@/components/ui/button";
import { useAdjustScore, useLeaderboardV3Account } from "../../hooks/useLeaderboardV3";
import { useAdminSeasons } from "../../hooks/useAdminSeasons";

interface AdjustmentForm {
  username: string;
  score: number;
  reason: string;
  seasonId: string; // "" = auto (active season)
}

const INITIAL_FORM: AdjustmentForm = {
  username: "",
  score: 0,
  reason: "",
  seasonId: "",
};

export function ScoreAdjustmentTab() {
  const [form, setForm] = useState<AdjustmentForm>(INITIAL_FORM);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const adjustMutation = useAdjustScore();
  const { seasons, isLoading: isLoadingSeasons } = useAdminSeasons();

  // Look up account when username changes
  const debouncedUsername = form.username.replace(/^@/, "").trim().toLowerCase();
  const { data: accountData } = useLeaderboardV3Account(
    debouncedUsername.length >= 2 ? debouncedUsername : null,
  );

  const handleSubmit = useCallback(async () => {
    setShowConfirm(false);
    setLastResult(null);

    try {
      const result = await adjustMutation.mutateAsync({
        username: form.username.replace(/^@/, "").trim(),
        score: form.score,
        reason: form.reason.trim(),
        ...(form.seasonId ? { seasonId: form.seasonId } : {}),
      });

      const data = result.data;
      setLastResult({
        success: true,
        message: `Score ${form.score > 0 ? "+" : ""}${form.score} applied to @${data?.username || form.username}${data?.seasonId ? ` (${data.seasonId})` : ""}`,
      });

      // Reset form except seasonId
      setForm((prev) => ({ ...INITIAL_FORM, seasonId: prev.seasonId }));
    } catch (error) {
      setLastResult({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to adjust score",
      });
    }
  }, [form, adjustMutation]);

  const canSubmit =
    form.username.replace(/^@/, "").trim().length > 0 &&
    form.score !== 0 &&
    form.reason.trim().length > 0 &&
    !adjustMutation.isPending;

  return (
    <OuterBox>
      <div className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-nasun-white">
          Score Adjustment
        </h3>
        <p className="text-sm text-nasun-white/50">
          Manually adjust a user's score for contributions not captured by post
          registration.
        </p>

        {/* Result message */}
        {lastResult && (
          <div
            className={`p-3 rounded-sm text-sm ${
              lastResult.success
                ? "bg-green-900/30 border border-green-500/30 text-green-400"
                : "bg-red-900/30 border border-red-500/30 text-red-400"
            }`}
          >
            {lastResult.message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Username */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-nasun-white/70">
              X Handle
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, username: e.target.value }))
              }
              placeholder="@username"
              className="w-full px-3 py-2 bg-gray-800/50 border border-nasun-c5/20 rounded-sm text-nasun-white placeholder-nasun-white/30 focus:outline-none focus:border-nasun-c1/50"
            />
            {/* Account lookup result */}
            {debouncedUsername.length >= 2 && (
              <div className="text-xs">
                {accountData?.found ? (
                  <span className="text-green-400">
                    Found: @
                    {accountData.account?.originalUsername ||
                      accountData.account?.username}{" "}
                    ({accountData.account?.postCount} posts,{" "}
                    {(accountData.account?.totalPostScore ?? 0).toFixed(1)} score)
                  </span>
                ) : (
                  <span className="text-yellow-400">
                    Account not found. Register a post first.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Score */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-nasun-white/70">
              Score ({form.score > 0 ? "+" : ""}
              {form.score.toFixed(1)})
            </label>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.1"
              value={form.score}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  score: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-nasun-c1"
            />
            <div className="flex justify-between text-xs text-nasun-white/40">
              <span>-5.0</span>
              <span>0</span>
              <span>+5.0</span>
            </div>
            {/* Quick buttons */}
            <div className="flex gap-1 flex-wrap">
              {[-2, -1, -0.5, 0.5, 1, 1.5, 2, 3].map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, score: val }))
                  }
                  className={`px-2 py-0.5 text-xs rounded-sm border transition-colors ${
                    form.score === val
                      ? "border-nasun-c1 bg-nasun-c1/20 text-nasun-c1"
                      : "border-nasun-c5/20 text-nasun-white/50 hover:border-nasun-c5/40"
                  }`}
                >
                  {val > 0 ? "+" : ""}
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-nasun-white/70">
              Reason
            </label>
            <textarea
              value={form.reason}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, reason: e.target.value }))
              }
              placeholder="Why is this adjustment being made? (required)"
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 bg-gray-800/50 border border-nasun-c5/20 rounded-sm text-nasun-white placeholder-nasun-white/30 focus:outline-none focus:border-nasun-c1/50 resize-none"
            />
            <div className="text-xs text-nasun-white/30 text-right">
              {form.reason.length}/500
            </div>
          </div>

          {/* Season */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-nasun-white/70">
              Season
            </label>
            <select
              value={form.seasonId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, seasonId: e.target.value }))
              }
              className="w-full px-3 py-2 bg-gray-800/50 border border-nasun-c5/20 rounded-sm text-nasun-white focus:outline-none focus:border-nasun-c1/50"
              disabled={isLoadingSeasons}
            >
              <option value="">Active Season (auto)</option>
              {seasons?.map((season) => (
                <option key={season.seasonId} value={season.seasonId}>
                  {season.name} ({season.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4 pt-2">
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={!canSubmit}
            className="bg-nasun-c4 hover:bg-nasun-c4/80 text-nasun-white disabled:opacity-50"
          >
            {adjustMutation.isPending ? "Applying..." : "Apply Adjustment"}
          </Button>

          {form.score !== 0 && form.username && (
            <span className="text-sm text-nasun-white/50">
              {form.score > 0 ? "+" : ""}
              {form.score.toFixed(1)} to @
              {form.username.replace(/^@/, "")}
            </span>
          )}
        </div>

        {/* Confirmation dialog */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-gray-900 border border-nasun-c5/30 rounded-sm p-6 max-w-md w-full mx-4 space-y-4">
              <h4 className="text-lg font-semibold text-nasun-white">
                Confirm Adjustment
              </h4>
              <div className="space-y-2 text-sm text-nasun-white/70">
                <p>
                  User:{" "}
                  <span className="text-nasun-white">
                    @{form.username.replace(/^@/, "")}
                  </span>
                </p>
                <p>
                  Score:{" "}
                  <span
                    className={
                      form.score > 0 ? "text-green-400" : "text-red-400"
                    }
                  >
                    {form.score > 0 ? "+" : ""}
                    {form.score.toFixed(1)}
                  </span>
                </p>
                <p>
                  Reason:{" "}
                  <span className="text-nasun-white">{form.reason}</span>
                </p>
                <p>
                  Season:{" "}
                  <span className="text-nasun-white">
                    {form.seasonId || "Active (auto)"}
                  </span>
                </p>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  className="border-nasun-c5/30 text-nasun-white/70"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="bg-nasun-c4 hover:bg-nasun-c4/80 text-nasun-white"
                >
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OuterBox>
  );
}
