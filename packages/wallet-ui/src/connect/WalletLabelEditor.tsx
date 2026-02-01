/**
 * Inline editable wallet nickname with always-visible edit icon
 */

import { useState, useRef } from "react";
import { useWalletLabel } from "@nasun/wallet";

export function WalletLabelEditor({
  address,
  fallbackLabel,
}: {
  address: string;
  fallbackLabel: string;
}) {
  const { label, setLabel, removeLabel } = useWalletLabel(address);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraft(label || "");
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const save = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      removeLabel();
    } else if (trimmed.length <= 20) {
      setLabel(trimmed);
    }
    setIsEditing(false);
  };

  const cancel = () => setIsEditing(false);

  return (
    <div>
      {/* Static label - not editable */}
      <p className="text-[10px] xl:text-xs text-gray-500 dark:text-zinc-400 mb-0.5 text-left">
        {fallbackLabel}
      </p>
      {/* Editable nickname */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 20))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          onBlur={save}
          className="text-xs xl:text-sm text-gray-900 dark:text-white bg-transparent border-b border-gray-400 dark:border-zinc-500 outline-none w-full py-0.5"
          placeholder="Wallet name..."
          maxLength={20}
        />
      ) : (
        <span className="inline-flex items-center text-xs xl:text-sm text-gray-700 dark:text-zinc-300">
          <button
            onClick={startEditing}
            className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Click to edit wallet nickname"
          >
            <span className="font-medium">{label || "Set nickname"}</span>
            <svg
              className="w-2.5 h-2.5 text-gray-400 dark:text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
          {label && (
            <button
              onClick={() => removeLabel()}
              className="inline-flex p-0.5 ml-1 text-gray-400 dark:text-zinc-500 hover:text-red-400 dark:hover:text-red-400 transition-colors"
              title="Remove nickname"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </span>
      )}
    </div>
  );
}
