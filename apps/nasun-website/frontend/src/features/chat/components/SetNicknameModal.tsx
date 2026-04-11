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
  const [confirmReset, setConfirmReset] = useState(false);
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

  const isLocked = isEditMode && rateLimit && rateLimit.changesRemaining <= 0 && !!rateLimit.lockedUntil;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-nasun-black rounded-xl p-5 w-[340px] mx-4 border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white mb-1">
          {isEditMode ? 'Change nickname' : 'Set chat nickname'}
        </h3>
        <p className="text-[11px] text-white/40 mb-3">
          {isEditMode
            ? 'Reset to use your account display name instead.'
            : 'Customize how you appear in chat.'}
        </p>

        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
          placeholder="e.g. alice"
          maxLength={16}
          autoFocus
          disabled={!!isLocked}
          className="w-full px-3 py-2 text-sm bg-white/5 border border-white/15 rounded-lg
            text-white placeholder:text-white/30
            focus:outline-none focus:border-nasun-c4 transition-colors
            disabled:opacity-40"
        />

        {/* Status + preview row */}
        <div className="mt-1.5 min-h-[18px] flex items-center justify-between gap-2">
          <span className="text-[11px]">
            {checkState === 'checking' && <span className="text-white/50">Checking...</span>}
            {checkState === 'available' && <span className="text-green-500">Available</span>}
            {checkState === 'taken' && <span className="text-red-500">Taken</span>}
            {checkState === 'invalid' && <span className="text-orange-500">2-16 chars, a-z/0-9/_/- only</span>}
            {isSameAsCurrentName && <span className="text-white/40">Same as current</span>}
            {serverError && <span className="text-red-500">{serverError}</span>}
          </span>
          {value.trim().length >= 2 && NICKNAME_REGEX.test(value.trim()) && !isSameAsCurrentName && (
            <span className="text-[11px] text-white/40 whitespace-nowrap">
              {value.trim()}#{addressSuffix}
            </span>
          )}
        </div>

        {/* Lock info */}
        {isLocked && (
          <p className="mt-1 text-[11px] text-amber-400/70">
            Locked for {formatLockedUntil(rateLimit!.lockedUntil!)}. You can still reset.
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white/60 hover:text-white/80 transition-colors">
            Cancel
          </button>
          {isEditMode && !confirmReset && (
            <button onClick={() => setConfirmReset(true)} disabled={resetting || submitting} className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-white/15 text-white/50 hover:text-white/80 hover:border-white/30 transition-colors disabled:opacity-50">
              Reset
            </button>
          )}
          {isEditMode && confirmReset && (
            <button onClick={handleReset} disabled={resetting || submitting} className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
              {resetting ? '...' : 'Confirm'}
            </button>
          )}
          <button onClick={handleSubmit} disabled={!canSubmit || !!isLocked} className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-nasun-c4 hover:bg-nasun-c4/80 text-white transition-colors disabled:opacity-50">
            {submitting ? '...' : isEditMode ? 'Change' : 'Set'}
          </button>
        </div>
      </div>
    </div>
  );
}
