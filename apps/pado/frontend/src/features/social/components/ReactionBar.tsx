import { useState } from 'react';
import { REACTION_CODES, REACTION_EMOJI } from '../types';
import type { ReactionCode } from '../types';

interface Props {
  messageId: number;
  reactions: Record<string, number>;
  myReaction: string | null;
  onToggle: (emojiCode: string) => void;
  compact?: boolean;
}

export function ReactionBar({ reactions, myReaction, onToggle, compact }: Props) {
  const [showPicker, setShowPicker] = useState(false);

  const activeReactions = Object.entries(reactions).filter(([, count]) => count > 0);
  if (activeReactions.length === 0 && !showPicker) return null;

  return (
    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
      {activeReactions.map(([code, count]) => (
        <button
          key={code}
          onClick={(e) => { e.stopPropagation(); onToggle(code); }}
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs min-h-[28px] transition-colors ${
            myReaction === code
              ? 'bg-theme-accent/20 border border-theme-accent/40'
              : 'bg-theme-bg-tertiary/50 border border-transparent hover:border-theme-border'
          }`}
        >
          <span>{REACTION_EMOJI[code as ReactionCode] ?? code}</span>
          {!compact && <span className="text-theme-text-muted">{count}</span>}
          {compact && count > 1 && <span className="text-theme-text-muted">{count}</span>}
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}
          className="flex items-center justify-center w-7 h-7 rounded-full text-xs text-theme-text-muted hover:bg-theme-bg-tertiary/50 transition-colors"
        >
          +
        </button>

        {showPicker && (
          <ReactionPicker
            onSelect={(code) => { onToggle(code); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  );
}

function ReactionPicker({ onSelect, onClose }: { onSelect: (code: string) => void; onClose: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Picker: bottom sheet on mobile, popup on desktop */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[env(safe-area-inset-bottom)] bg-theme-bg-secondary border-t border-theme-border z-50 sm:absolute sm:bottom-auto sm:left-auto sm:right-auto sm:p-2 sm:rounded-lg sm:border sm:shadow-lg sm:w-auto sm:-top-20">
        <div className="grid grid-cols-7 gap-0.5 justify-items-center">
          {REACTION_CODES.map((code) => (
            <button
              key={code}
              onClick={(e) => { e.stopPropagation(); onSelect(code); }}
              className="min-w-[38px] min-h-[38px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center text-lg hover:bg-theme-bg-tertiary rounded-lg transition-colors"
            >
              {REACTION_EMOJI[code]}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
