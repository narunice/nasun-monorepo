/**
 * ChatInput - Bottom-fixed chat input with send button
 */

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

const MAX_PROMPT_LENGTH = 10_000;

interface ChatInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
}

export function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = 'Ask anything...',
  initialValue = ''
}: ChatInputProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update value when initialValue changes (for suggestion cards)
  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
      textareaRef.current?.focus();
    }
  }, [initialValue]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const isOverLimit = value.length > MAX_PROMPT_LENGTH;

  const handleSubmit = () => {
    if (!value.trim() || disabled || isOverLimit) return;
    onSubmit(value.trim());
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-3">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className="w-full px-4 py-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-br-1 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none min-h-[72px] max-h-[200px]"
        />
        {isOverLimit && (
          <p className="absolute bottom-1 right-2 text-xs text-[var(--color-error)]">
            {value.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()}
          </p>
        )}
      </div>
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || disabled || isOverLimit}
        className="flex-shrink-0 w-10 h-10 self-end rounded-xl bg-br-1d hover:bg-br-2d text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Send message"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </button>
    </div>
  );
}
