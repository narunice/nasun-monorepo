import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { NicknameRateLimit } from '../../../lib/chat-service';

const NICKNAME_REGEX = /^[a-zA-Z0-9_-]{2,16}$/;

interface Props {
  addressSuffix: string;
  currentNickname?: string;
  rateLimit?: NicknameRateLimit;
  onSuccess: (nickname: string | null) => void;
  onClose: () => void;
}

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function formatLockedUntil(lockedUntil: number): string {
  const now = Date.now();
  const diff = lockedUntil - now;
  if (diff <= 0) return 'now';
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days > 1) return `${days} days`;
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  if (hours > 1) return `${hours} hours`;
  const minutes = Math.ceil(diff / (60 * 1000));
  return `${minutes} min`;
}

export function SetNicknameModal({ addressSuffix, currentNickname, rateLimit, onSuccess, onClose }: Props) {
  const isEditMode = !!currentNickname;
  const [value, setValue] = useState(currentNickname ?? '');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const chatService = getChatService();

    const onCheck = ({ available, nickname }: { available: boolean; nickname: string }) => {
      if (nickname.toLowerCase() === value.trim().toLowerCase()) {
        if (checkTimeoutRef.current) {
          clearTimeout(checkTimeoutRef.current);
          checkTimeoutRef.current = null;
        }
        setCheckState(available ? 'available' : 'taken');
      }
    };

    const onResult = ({ ok, nickname, error, rateLimit: rl }: { ok: boolean; nickname?: string; error?: string; rateLimit?: NicknameRateLimit }) => {
      setSubmitting(false);
      setResetting(false);
      if (ok) {
        onSuccess(nickname ?? null);
        return;
      }
      setServerError(
        error === 'already_taken' ? 'Nickname is already taken' :
        error === 'invalid_format' ? 'Invalid format (2-16 chars, letters/numbers/_/-)' :
        error === 'reserved' ? 'This nickname is reserved' :
        error === 'no_nickname' ? 'No nickname to reset' :
        error === 'rate_limited' && rl?.lockedUntil
          ? `Nickname is locked for ${formatLockedUntil(rl.lockedUntil)}. You can change it again after the lock expires.`
          : error === 'rate_limited' ? 'Too many changes. Try again later.'
          : error ?? 'Failed to set nickname'
      );
    };

    chatService.on('nickname_check', onCheck);
    chatService.on('nickname', onResult);

    return () => {
      chatService.off('nickname_check', onCheck);
      chatService.off('nickname', onResult);
    };
  }, [value, onSuccess]);

  const handleChange = useCallback((input: string) => {
    setValue(input);
    setServerError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);

    const trimmed = input.trim();
    if (!trimmed || trimmed.length < 2) {
      setCheckState('idle');
      return;
    }

    if (!NICKNAME_REGEX.test(trimmed)) {
      setCheckState('invalid');
      return;
    }

    if (currentNickname && trimmed.toLowerCase() === currentNickname.toLowerCase()) {
      setCheckState('idle');
      return;
    }

    setCheckState('checking');
    debounceRef.current = setTimeout(() => {
      getChatService().checkNickname(trimmed);
      checkTimeoutRef.current = setTimeout(() => {
        setCheckState((prev) => (prev === 'checking' ? 'available' : prev));
      }, 3000);
    }, 400);
  }, [currentNickname]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || !NICKNAME_REGEX.test(trimmed) || checkState !== 'available') return;
    setSubmitting(true);
    setServerError(null);
    getChatService().setNickname(trimmed);
  }, [value, checkState]);

  const handleReset = useCallback(() => {
    if (submitting) return;
    setResetting(true);
    setServerError(null);
    getChatService().clearNickname();
  }, [submitting]);

  const isSameAsCurrentName = isEditMode && value.trim().toLowerCase() === currentNickname!.toLowerCase();
  const canSubmit = checkState === 'available' && !submitting && !resetting && !isSameAsCurrentName;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-nasun-black rounded-lg p-5 max-w-sm w-full mx-4 border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white mb-2">
          {isEditMode ? 'Change your nickname' : 'Set your chat nickname'}
        </h3>
        <p className="text-xs text-white/40 mb-3 leading-relaxed">
          {isEditMode
            ? 'Your nickname overrides your default display name in chat. Reset to go back to your account name.'
            : 'By default, your account display name is shown in chat. Set a nickname to customize how you appear.'}
        </p>

        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
          placeholder="e.g. alice"
          maxLength={16}
          autoFocus
          className="w-full px-3 py-2 text-sm bg-white/5 border border-white/15 rounded-lg
            text-white placeholder:text-white/30
            focus:outline-none focus:border-nasun-c4 transition-colors"
        />

        {/* Status line */}
        <div className="h-5 mt-1.5 flex items-center">
          {checkState === 'checking' && (
            <span className="text-xs text-white/50">Checking...</span>
          )}
          {checkState === 'available' && (
            <span className="text-xs text-green-500">Available</span>
          )}
          {checkState === 'taken' && (
            <span className="text-xs text-red-500">Already taken</span>
          )}
          {checkState === 'invalid' && (
            <span className="text-xs text-orange-500">2-16 chars, letters/numbers/_/- only</span>
          )}
          {isSameAsCurrentName && (
            <span className="text-xs text-white/40">Same as current nickname</span>
          )}
          {serverError && (
            <span className="text-xs text-red-500">{serverError}</span>
          )}
        </div>

        {/* Preview */}
        {value.trim().length >= 2 && NICKNAME_REGEX.test(value.trim()) && (
          <div className="mt-2 text-xs text-white/50">
            You'll appear as:{' '}
            <span className="text-white font-medium">
              {value.trim()}#{addressSuffix}
            </span>
          </div>
        )}

        {/* Rate limit info (edit mode only) */}
        {isEditMode && rateLimit && (
          <div className="mt-2 text-xs text-white/40">
            {rateLimit.changesRemaining > 0
              ? `You can change your nickname ${rateLimit.changesRemaining} more time${rateLimit.changesRemaining === 1 ? '' : 's'} within the first hour. After that, it will be locked for 30 days.`
              : rateLimit.lockedUntil
                ? `Nickname is locked for ${formatLockedUntil(rateLimit.lockedUntil)}.`
                : 'No changes remaining.'}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs font-medium rounded-lg
              bg-white/10 text-white/60
              hover:text-white/80 transition-colors"
          >
            Cancel
          </button>
          {isEditMode && (
            <button
              onClick={handleReset}
              disabled={resetting || submitting}
              className="flex-1 py-2 text-xs font-medium rounded-lg
                border border-white/15 text-white/50
                hover:text-white/80 hover:border-white/30 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetting ? 'Resetting...' : 'Reset'}
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2 text-xs font-medium rounded-lg
              bg-nasun-c4 hover:bg-nasun-c4/80 text-white transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : isEditMode ? 'Change' : 'Set Nickname'}
          </button>
        </div>
      </div>
    </div>
  );
}
