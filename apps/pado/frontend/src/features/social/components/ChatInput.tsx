import { useState, useCallback, type FormEvent, type KeyboardEvent } from 'react';

interface Props {
  onSend: (content: string) => void;
  disabled: boolean;
  maxLength?: number;
  disabledPlaceholder?: string;
}

export function ChatInput({ onSend, disabled, maxLength = 500, disabledPlaceholder }: Props) {
  const [text, setText] = useState('');

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed || disabled) return;
      onSend(trimmed);
      setText('');
    }
  }, [text, disabled, onSend]);

  return (
    <form className="flex gap-1.5 px-3 py-2 border-t border-theme-border" onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? (disabledPlaceholder || 'Connect wallet to chat') : 'Type a message...'}
        maxLength={maxLength}
        disabled={disabled}
        className="flex-1 min-w-0 px-2.5 py-1.5 text-trading-sm
          bg-theme-bg-primary border border-theme-border rounded-md
          text-theme-text-primary placeholder:text-theme-text-muted
          focus:outline-none focus:border-theme-accent
          disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        className="px-2.5 py-1.5 text-trading-sm font-medium
          bg-theme-accent text-white rounded-md
          hover:opacity-90 disabled:opacity-40
          transition-opacity shrink-0"
      >
        Send
      </button>
    </form>
  );
}
