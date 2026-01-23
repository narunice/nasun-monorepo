/**
 * PostRegistrationTab - Post registration form for Leaderboard V3 Admin
 *
 * Keyboard Shortcuts:
 * - 1/2/3: Select post type (Original/Quote/Reply)
 * - Q/W/E: Select role (Default/Proactive CT/KOL)
 * - A/S/D: Toggle signals (Insight/Creative/High Reach)
 * - /: Focus URL input
 * - Ctrl+Enter: Submit post
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { OuterBox } from '@/components/ui/OuterBox';
import { Button } from '@/components/ui/button';
import {
  usePostSubmissionForm,
  useCreatePost,
  useLeaderboardV3Account,
  usePostFormKeyboardShortcuts,
} from '../../hooks/useLeaderboardV3';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import {
  ROLE_LABELS,
  SIGNAL_LABELS,
  BONUS_SIGNALS,
  POST_TYPE_LABELS,
  type AccountRole,
  type PostType,
} from '../../types/leaderboard-v3';

// Extract username from URL for account lookup
function extractUsernameFromUrl(url: string): string | null {
  try {
    const normalized = url.replace('twitter.com', 'x.com');
    const match = normalized.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function PostRegistrationTab() {
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const form = usePostSubmissionForm();
  const createPostMutation = useCreatePost();
  const { profile } = useAdminAuth();

  // Admin identifier: twitterHandle > username > email
  const adminIdentifier = useMemo(() => {
    return profile?.twitterHandle || profile?.username || profile?.email || 'unknown';
  }, [profile]);

  // Extract username from URL for account lookup
  const extractedUsername = extractUsernameFromUrl(form.postUrl);
  const { data: accountData, isLoading: isLoadingAccount } = useLeaderboardV3Account(
    extractedUsername,
    'twitter',
    !!extractedUsername
  );

  // Auto-fill role when account is found
  useEffect(() => {
    if (accountData?.found && accountData.account) {
      form.setAccountRole(accountData.account.lastKnownRole);
    }
  }, [accountData]);

  const handleSubmit = useCallback(async () => {
    if (!form.postUrl.trim()) {
      setSubmitMessage({ type: 'error', text: 'Please enter a post URL' });
      return;
    }

    setSubmitMessage(null);

    try {
      const result = await createPostMutation.mutateAsync({
        request: form.buildRequest(),
        adminUsername: adminIdentifier,
      });

      if (result.isDuplicate) {
        setSubmitMessage({ type: 'error', text: 'This post has already been registered' });
      } else if (result.success && result.post && result.account) {
        setSubmitMessage({
          type: 'success',
          text: `Post registered! @${result.account.originalUsername || result.account.username} now has ${result.account.postCount} posts (Score: ${result.post.postScore.toFixed(2)})`,
        });
        form.reset();
        urlInputRef.current?.focus();
      } else {
        setSubmitMessage({ type: 'error', text: result.error || 'Failed to register post' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register post';
      setSubmitMessage({ type: 'error', text: message });
    }
  }, [form, createPostMutation, adminIdentifier]);

  // Keyboard shortcuts
  const { handleKeyDown } = usePostFormKeyboardShortcuts(form, handleSubmit, urlInputRef);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Keyboard Shortcuts Reference */}
      <OuterBox color="n3" padding="sm" className="w-full">
        <h4 className="text-sm font-semibold text-nasun-white/80 mb-3 uppercase tracking-wider flex items-center gap-2">
          <span className="w-1 h-4 bg-nasun-c3 rounded-full"></span>
          Keyboard Shortcuts
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs text-nasun-white/60">
          <div>
            <span className="text-nasun-c3 font-mono">1 2 3</span>
            <span className="ml-2">Type</span>
          </div>
          <div>
            <span className="text-nasun-c3 font-mono">Q W E</span>
            <span className="ml-2">Role</span>
          </div>
          <div>
            <span className="text-nasun-c3 font-mono">A S D</span>
            <span className="ml-2">Signals</span>
          </div>
          <div>
            <span className="text-nasun-c3 font-mono">/</span>
            <span className="ml-2">Focus URL</span>
          </div>
          <div>
            <span className="text-nasun-c3 font-mono">Ctrl+Enter</span>
            <span className="ml-2">Submit</span>
          </div>
        </div>
      </OuterBox>

      {/* Post Submission Form */}
      <OuterBox color="c6" className="w-full !border-nasun-c5/30 !bg-gray-800/30">
        <h3 className="text-xl font-medium text-nasun-white mb-6">
          Register Post
        </h3>

        <div className="space-y-6">
          {/* Post Type */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-3">
              Post Type <span className="text-nasun-c3 font-mono ml-2">1 2 3</span>
            </label>
            <div className="flex gap-3">
              {(['original', 'quote', 'reply'] as PostType[]).map((type, index) => {
                const shortcut = ['1', '2', '3'][index];
                const isActive = form.postType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => form.setPostType(type)}
                    className={`flex-1 px-4 py-3 rounded-sm font-medium transition-all border ${
                      isActive
                        ? 'bg-nasun-c4 border-nasun-c4 text-nasun-white shadow-lg'
                        : 'bg-gray-800/50 border-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white hover:border-nasun-c5/50'
                    }`}
                  >
                    <span className="text-nasun-c3 font-mono mr-2">{shortcut}</span>
                    {POST_TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* URL Input */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-2">
              Post URL <span className="text-nasun-c3 font-mono ml-2">/</span>
            </label>
            <input
              ref={urlInputRef}
              type="url"
              value={form.postUrl}
              onChange={(e) => form.setPostUrl(e.target.value)}
              placeholder="https://x.com/username/status/..."
              autoFocus
              className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c3/50 transition-colors font-mono text-sm"
            />
            {/* Account lookup status */}
            {extractedUsername && (
              <div className="mt-2 text-xs text-nasun-white/50">
                {isLoadingAccount ? (
                  <span>Looking up @{extractedUsername}...</span>
                ) : accountData?.found ? (
                  <span className="text-nasun-c3">
                    Found: @{accountData.account?.username} ({ROLE_LABELS[accountData.account?.lastKnownRole || 'default']}) - {accountData.account?.postCount} posts
                  </span>
                ) : (
                  <span>New account: @{extractedUsername}</span>
                )}
              </div>
            )}
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-3">
              Account Role <span className="text-nasun-c3 font-mono ml-2">Q W E</span>
            </label>
            <div className="flex gap-3">
              {(['default', 'proactive_ct', 'kol'] as AccountRole[]).map((role, index) => {
                const shortcut = ['Q', 'W', 'E'][index];
                return (
                <button
                  key={role}
                  type="button"
                  onClick={() => form.setAccountRole(role)}
                  className={`flex-1 px-4 py-3 rounded-sm font-medium transition-all border ${
                    form.accountRole === role
                      ? 'bg-nasun-c4 border-nasun-c4 text-nasun-white shadow-lg'
                      : 'bg-gray-800/50 border-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white hover:border-nasun-c5/50'
                  }`}
                >
                  <span className="text-nasun-c3 font-mono mr-2">{shortcut}</span>
                  {ROLE_LABELS[role]}
                </button>
                );
              })}
            </div>
          </div>

          {/* Content Signals */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-3">
              Content Signals <span className="text-nasun-c3 font-mono ml-2">A S D</span>
            </label>
            <div className="flex gap-3">
              {BONUS_SIGNALS.map((signal, index) => {
                const shortcut = ['A', 'S', 'D'][index];
                const isActive = form.contentSignals.includes(signal);
                return (
                  <button
                    key={signal}
                    type="button"
                    onClick={() => form.toggleSignal(signal)}
                    className={`flex-1 px-4 py-3 rounded-sm font-medium transition-all border ${
                      isActive
                        ? 'bg-nasun-c3/20 border-nasun-c3/50 text-nasun-c3 shadow-lg'
                        : 'bg-gray-800/50 border-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white hover:border-nasun-c5/50'
                    }`}
                  >
                    <span className="text-nasun-c3 font-mono mr-2">{shortcut}</span>
                    {SIGNAL_LABELS[signal]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Score Preview */}
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-sm border border-nasun-c5/20">
            <div className="text-sm text-nasun-white/60">
              <span className="font-medium text-nasun-white">Score Preview:</span>{' '}
              {form.scorePreview.baseScore} × {form.scorePreview.roleMultiplier} + {form.scorePreview.signalBonus}
              <span className="ml-2 text-nasun-white/40">({POST_TYPE_LABELS[form.postType]})</span>
            </div>
            <div className="text-2xl font-bold text-nasun-c3">
              {form.scorePreview.totalScore.toFixed(2)}
            </div>
          </div>

          {/* Submit Message */}
          {submitMessage && (
            <div
              className={`p-4 rounded-sm text-sm ${
                submitMessage.type === 'success'
                  ? 'bg-green-950/30 border border-green-900/50 text-green-400'
                  : 'bg-red-950/30 border border-red-900/50 text-red-400'
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
              {createPostMutation.isPending ? 'Submitting...' : 'Register Post'}
              <span className="ml-2 text-xs opacity-60 font-mono">Ctrl+Enter</span>
            </Button>
            <Button
              onClick={form.reset}
              variant="outlineC5"
              size="lg"
            >
              Clear
            </Button>
          </div>
        </div>
      </OuterBox>
    </div>
  );
}
