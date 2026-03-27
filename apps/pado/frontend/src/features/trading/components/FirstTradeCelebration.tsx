/**
 * FirstTradeCelebration
 *
 * Full-screen celebration overlay shown once on the user's first order fill.
 * CSS-only confetti particles + congratulations modal + Twitter/X share button.
 */

import { useEffect, useMemo } from 'react';

const CONFETTI_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#FF9F43',
];
const PARTICLE_COUNT = 50;

interface Particle {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  width: number;
  height: number;
  borderRadius: string;
}

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const shape = Math.floor(Math.random() * 3); // 0=square, 1=circle, 2=strip
    const size = 4 + Math.random() * 8;
    return {
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      width: shape === 2 ? size * 0.4 : size,
      height: shape === 2 ? size * 2 : size,
      borderRadius: shape === 1 ? '50%' : '2px',
    };
  });
}

const TWEET_TEXT = encodeURIComponent(
  'Just made my first trade on #Pado, a real on-chain CLOB orderbook on Nasun L1!\n\nBootstrapped and built from scratch.\n\n@Nasun_io',
);
const TWITTER_URL = `https://x.com/intent/tweet?text=${TWEET_TEXT}`;

interface Props {
  onDismiss: () => void;
}

export function FirstTradeCelebration({ onDismiss }: Props) {
  const particles = useMemo(generateParticles, []);

  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Confetti keyframes */}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes celebration-pop {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onDismiss} />

      {/* Confetti particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'fixed',
            left: `${p.left}%`,
            top: '-10px',
            width: `${p.width}px`,
            height: `${p.height}px`,
            backgroundColor: p.color,
            borderRadius: p.borderRadius,
            animation: `confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
            zIndex: 101,
            pointerEvents: 'none' as const,
          }}
        />
      ))}

      {/* Modal */}
      <div
        className="relative z-[102] bg-theme-bg-primary border border-theme-border rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl"
        style={{ animation: 'celebration-pop 0.5s ease-out' }}
      >
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-theme-text-muted hover:text-theme-text-primary transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Trophy */}
        <div className="w-16 h-16 mx-auto mb-4 bg-yellow-500/10 rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-4.5A3.375 3.375 0 0 0 13.125 10.875h0A3.375 3.375 0 0 0 9.75 14.25v4.5m6.75-12V3.375c0-.621-.504-1.125-1.125-1.125h-6.75c-.621 0-1.125.504-1.125 1.125V6.75m9 0h1.894c.997 0 1.856.68 2.088 1.648l.576 2.4A2.25 2.25 0 0 1 18.602 13.5H16.5m-9-6.75H5.398a2.25 2.25 0 0 1-2.189-2.702l.576-2.4A2.142 2.142 0 0 1 5.874 0H7.5" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-theme-text-primary mb-2">
          First Trade Complete!
        </h2>
        <p className="text-theme-text-secondary mb-1">
          You just traded on a <strong className="text-theme-text-primary">real on-chain CLOB orderbook</strong>.
        </p>
        <p className="text-sm text-theme-text-muted mb-6">
          Not a simulated order. A real transaction, settled on Nasun L1.
        </p>

        {/* Share on X */}
        <a
          href={TWITTER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white font-medium rounded-lg transition-colors mb-3"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </a>

        <button
          onClick={onDismiss}
          className="text-sm text-theme-text-muted hover:text-theme-text-primary transition-colors"
        >
          Continue Trading
        </button>
      </div>
    </div>
  );
}
