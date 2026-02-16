/**
 * ChatInput - Bottom-fixed chat input with segmented privacy toggle and send button
 */

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { ModelSelector } from "./ModelSelector";

const MAX_PROMPT_LENGTH = 10_000;

interface ChatInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
  privacyMode: boolean;
  onTogglePrivacy: (mode: boolean) => void;
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
}

export function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = "Ask anything...",
  initialValue = "",
  privacyMode,
  onTogglePrivacy,
  selectedModel,
  onSelectModel,
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
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
    }
  }, [value]);

  const isOverLimit = value.length > MAX_PROMPT_LENGTH;

  const handleSubmit = () => {
    if (!value.trim() || disabled || isOverLimit) return;
    onSubmit(value.trim());
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-2">
      {/* Toggle row: Privacy Mode Switch + Model info */}
      <div className="flex items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Privacy mode"
          className="relative rounded-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] h-8 px-0.5 flex items-center"
        >
          {/* Sliding background indicator */}
          <div
            className={`absolute top-0.5 bottom-0.5 rounded-full transition-all duration-300 ease-out ${
              privacyMode ? "left-0.5 bg-br-1d" : "left-[calc(50%)] bg-gray-500"
            }`}
            style={{ width: "calc(50% - 2px)" }}
          />

          {/* Private option */}
          <button
            type="button"
            role="radio"
            aria-checked={privacyMode}
            onClick={() => onTogglePrivacy(true)}
            className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-300 whitespace-nowrap ${
              privacyMode ? "text-white" : "text-[var(--color-text-muted)]"
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span>Private</span>
          </button>

          {/* Standard option */}
          <button
            type="button"
            role="radio"
            aria-checked={!privacyMode}
            onClick={() => onTogglePrivacy(false)}
            className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-300 whitespace-nowrap ${
              !privacyMode ? "text-white" : "text-[var(--color-text-muted)]"
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
              />
            </svg>
            <span>Standard</span>
          </button>
        </div>

        {/* Model selector dropdown */}
        <ModelSelector
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          privacyMode={privacyMode}
        />
      </div>

      {/* Textarea wrapper — overflow-hidden preserves rounded corners when scrollbar appears */}
      <div className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden focus-within:ring-2 focus-within:ring-br-1 focus-within:border-transparent">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className="w-full px-4 py-3 pr-14 bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed resize-none min-h-[72px] max-h-[320px]"
        />
        {isOverLimit && (
          <p className="absolute bottom-1 right-14 text-xs text-[var(--color-error)]">
            {value.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()}
          </p>
        )}
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled || isOverLimit}
          className="absolute bottom-3 right-3 w-8 h-8 rounded-lg bg-br-1d hover:bg-br-2d text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
