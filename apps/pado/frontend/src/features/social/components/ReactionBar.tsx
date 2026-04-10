import { REACTION_EMOJI } from '../types';
import type { ReactionCode } from '../types';

interface Props {
  reactions: Record<string, number>;
  myReaction: string | null;
  onToggle: (emojiCode: string) => void;
}

export function ReactionBar({ reactions, myReaction, onToggle }: Props) {
  const activeReactions = Object.entries(reactions).filter(([, count]) => count > 0);
  if (activeReactions.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {activeReactions.map(([code, count]) => {
        const emoji = REACTION_EMOJI[code as ReactionCode];
        if (!emoji) return null;
        const isMine = myReaction === code;

        return (
          <button
            key={code}
            onClick={(e) => { e.stopPropagation(); onToggle(code); }}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition-colors ${
              isMine
                ? 'bg-theme-accent/20 border border-theme-accent/30 text-theme-accent'
                : 'bg-theme-text-primary/5 border border-theme-text-primary/10 text-theme-text-primary/70 hover:bg-theme-text-primary/10'
            }`}
          >
            <span>{emoji}</span>
            <span>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
