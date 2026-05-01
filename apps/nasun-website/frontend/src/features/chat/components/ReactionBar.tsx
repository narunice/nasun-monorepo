// Ordered by expected popularity so the most-used reactions sit on the
// first row of the 7-column picker grid.
export const REACTION_EMOJI: Record<string, string> = {
  heart: '\u{2764}\u{FE0F}',
  thumbsup: '\u{1F44D}',
  rocket: '\u{1F680}',
  fire: '\u{1F525}',
  laugh: '\u{1F602}',
  clap: '\u{1F44F}',
  hundred: '\u{1F4AF}',
  smile: '\u{1F642}',
  grin: '\u{1F604}',
  eyes: '\u{1F440}',
  thinking: '\u{1F914}',
  sob: '\u{1F62D}',
  gem: '\u{1F48E}',
  wave: '\u{1F44B}',
  whale: '\u{1F433}',
};

export const REACTION_CODES = Object.keys(REACTION_EMOJI);

interface ReactionBarProps {
  reactions: Record<string, number>;
  myReaction?: string | null;
  onToggle: (emojiCode: string) => void;
}

export default function ReactionBar({ reactions, myReaction, onToggle }: ReactionBarProps) {
  const hasReactions = Object.keys(reactions).length > 0;
  if (!hasReactions) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
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
                : 'bg-white/10 border border-white/20 text-white/90 hover:bg-white/15'
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
