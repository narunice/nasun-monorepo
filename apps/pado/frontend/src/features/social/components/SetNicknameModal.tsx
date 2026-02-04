import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatService } from '../../../lib/chat-service';

const NICKNAME_REGEX = /^[a-zA-Z0-9_-]{2,16}$/;

interface Props {
  addressSuffix: string;
  onSuccess: (nickname: string) => void;
  onClose: () => void;
}

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export function SetNicknameModal({ addressSuffix, onSuccess, onClose }: Props) {
  const [value, setValue] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for nickname_check and nickname_result events
  useEffect(() => {
    const chatService = getChatService();

    const unsubCheck = chatService.on('nickname_check', ({ available, nickname }) => {
      // Only update if this check matches the current input
      if (nickname.toLowerCase() === value.trim().toLowerCase()) {
        if (checkTimeoutRef.current) {
          clearTimeout(checkTimeoutRef.current);
          checkTimeoutRef.current = null;
        }
        setCheckState(available ? 'available' : 'taken');
      }
    });

    const unsubResult = chatService.on('nickname', ({ ok, nickname, error }) => {
      setSubmitting(false);
      if (ok && nickname) {
        onSuccess(nickname);
      } else {
        setServerError(
          error === 'already_taken' ? 'Nickname is already taken' :
          error === 'invalid_format' ? 'Invalid format (2-16 chars, letters/numbers/_/-)' :
          error === 'reserved' ? 'This nickname is reserved' :
          error ?? 'Failed to set nickname'
        );
      }
    });

    return () => {
      unsubCheck();
      unsubResult();
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

    setCheckState('checking');
    debounceRef.current = setTimeout(() => {
      getChatService().checkNickname(trimmed);
      // Timeout: if no response within 3s, fall back to allowing submit
      checkTimeoutRef.current = setTimeout(() => {
        setCheckState((prev) => (prev === 'checking' ? 'available' : prev));
      }, 3000);
    }, 400);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || !NICKNAME_REGEX.test(trimmed) || checkState !== 'available') return;
    setSubmitting(true);
    setServerError(null);
    getChatService().setNickname(trimmed);
  }, [value, checkState]);

  const canSubmit = checkState === 'available' && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-theme-bg-secondary rounded-lg p-5 max-w-sm w-full mx-4 border border-theme-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-theme-text-primary mb-3">
          Set your chat nickname
        </h3>

        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
          placeholder="e.g. alice"
          maxLength={16}
          autoFocus
          className="w-full px-3 py-2 text-sm bg-theme-bg-primary border border-theme-border rounded-lg
            text-theme-text-primary placeholder:text-theme-text-muted
            focus:outline-none focus:border-purple-500 transition-colors"
        />

        {/* Status line */}
        <div className="h-5 mt-1.5 flex items-center">
          {checkState === 'checking' && (
            <span className="text-xs text-theme-text-muted">Checking...</span>
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
          {serverError && (
            <span className="text-xs text-red-500">{serverError}</span>
          )}
        </div>

        {/* Preview */}
        {value.trim().length >= 2 && NICKNAME_REGEX.test(value.trim()) && (
          <div className="mt-2 text-xs text-theme-text-muted">
            You'll appear as:{' '}
            <span className="text-theme-text-primary font-medium">
              {value.trim()}#{addressSuffix}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs font-medium rounded-lg
              bg-theme-bg-tertiary text-theme-text-secondary
              hover:text-theme-text-primary transition-colors"
          >
            Later
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2 text-xs font-medium rounded-lg
              bg-purple-600 hover:bg-purple-700 text-white transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Setting...' : 'Set Nickname'}
          </button>
        </div>
      </div>
    </div>
  );
}
