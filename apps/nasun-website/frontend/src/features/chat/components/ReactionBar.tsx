import { useState } from 'react';

const REACTION_EMOJI: Record<string, string> = {
  thumbsup: '\u{1F44D}',
  fire: '\u{1F525}',
  rocket: '\u{1F680}',
  gem: '\u{1F48E}',
  chart_down: '\u{1F4C9}',
  laugh: '\u{1F602}',
};

const REACTION_CODES = Object.keys(REACTION_EMOJI);

interface ReactionBarProps {
  reactions: Record<string, number>;
  myReaction?: string | null;
  onToggle: (emojiCode: string) => void;
}

export default function ReactionBar({ reactions, myReaction, onToggle }: ReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const hasReactions = Object.keys(reactions).length > 0;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Existing reactions as pills */}
      {Object.entries(reactions).map(([code, count]) => {
        if (count <= 0) return null;
        const emoji = REACTION_EMOJI[code];
        if (!emoji) return null;
        const isMine = myReaction === code;

        return (
          <button
            key={code}
            onClick={(e) => { e.stopPropagation(); onToggle(code); }}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition-colors ${
              isMine
                ? 'bg-nasun-c4/30 border border-nasun-c4/50 text-nasun-c4'
                : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'
            }`}
          >
            <span>{emoji}</span>
            <span>{count}</span>
          </button>
        );
      })}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setPickerOpen(!pickerOpen); }}
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-colors ${
            hasReactions
              ? 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50'
              : 'opacity-0 group-hover:opacity-100 bg-white/5 text-white/20 hover:bg-white/10 hover:text-white/40'
          }`}
          aria-label="Add reaction"
        >
          +
        </button>

        {/* Emoji picker popover */}
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div className="absolute bottom-7 left-0 z-20 flex gap-1 p-1.5 bg-nasun-black border border-white/15 rounded-lg shadow-xl">
              {REACTION_CODES.map((code) => (
                <button
                  key={code}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(code);
                    setPickerOpen(false);
                  }}
                  className={`w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-base ${
                    myReaction === code ? 'bg-nasun-c4/20' : ''
                  }`}
                >
                  {REACTION_EMOJI[code]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
