/**
 * Multi-line chat input with inline model selector. Adapted from baram
 * ChatInput, simplified: no privacy-mode toggle (the model selector groups
 * cloud/private/fast so the user picks privacy through the model itself).
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { ModelSelector } from '../forms/ModelSelector';

const MAX_PROMPT_LENGTH = 10_000;

interface ChatInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
}

export function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = 'Ask anything...',
  initialValue = '',
  selectedModel,
  onSelectModel,
}: ChatInputProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
      textareaRef.current?.focus();
    }
  }, [initialValue]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
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
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ModelSelector selectedModel={selectedModel} onSelectModel={onSelectModel} />
        {/* Native `title` tooltip is delayed and invisible on touch, so we
            render an always-visible hint with a custom hover popover for the
            longer explanation. */}
        <span className="relative group inline-flex items-center gap-1 text-xs text-uju-secondary/70 cursor-help">
          for chat only
          <svg
            className="w-3 h-3 text-uju-secondary/60"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8h.01M11 12h1v4h1" />
          </svg>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-uju-border/60 bg-uju-card px-3 py-2 text-xs text-uju-secondary opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 z-20 shadow-lg"
          >
            The agent's autonomous trading cycle uses a separately managed model from the Settings tab.
            This selector only affects chat turns you send here.
          </span>
        </span>
      </div>

      <div className="relative rounded-xl border border-uju-border/60 bg-uju-card/60 overflow-hidden focus-within:ring-2 focus-within:ring-pado-2 focus-within:border-transparent">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className="w-full px-4 py-3 pr-14 bg-transparent text-white placeholder:text-uju-secondary/70 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed resize-none min-h-[72px] max-h-[320px]"
        />
        {isOverLimit && (
          <p className="absolute bottom-1 right-14 text-xs text-red-400">
            {value.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()}
          </p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim() || disabled || isOverLimit}
          className="absolute bottom-3 right-3 w-8 h-8 rounded-lg bg-pado-2 hover:bg-pado-2/80 text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
