interface CrashGraphProps {
  state: string;
  liveMultiplierBps: number;
  crashedCrashPoint: number | null;
  hasCashedOut: boolean;
  myCashoutBps: number | null;
}

// Pre-computed star field — fixed seed so it doesn't reshuffle on every render.
const STAR_FIELD: Array<{ x: number; y: number; r: number; o: number }> = [
  { x: 0.08, y: 0.18, r: 1.2, o: 0.7 },
  { x: 0.22, y: 0.42, r: 0.8, o: 0.5 },
  { x: 0.31, y: 0.12, r: 1.0, o: 0.8 },
  { x: 0.45, y: 0.55, r: 0.6, o: 0.4 },
  { x: 0.58, y: 0.22, r: 1.3, o: 0.9 },
  { x: 0.67, y: 0.48, r: 0.7, o: 0.5 },
  { x: 0.78, y: 0.15, r: 1.0, o: 0.7 },
  { x: 0.87, y: 0.38, r: 0.9, o: 0.6 },
  { x: 0.93, y: 0.62, r: 0.5, o: 0.4 },
  { x: 0.15, y: 0.68, r: 0.7, o: 0.5 },
  { x: 0.38, y: 0.28, r: 0.5, o: 0.4 },
  { x: 0.52, y: 0.08, r: 0.8, o: 0.6 },
];

export function CrashGraph({
  state,
  liveMultiplierBps,
  crashedCrashPoint,
  hasCashedOut,
  myCashoutBps,
}: CrashGraphProps) {
  const W = 500;
  const H = 280;
  const PAD = 20;

  const isFlying = state === "FLYING";
  const isCrashed = state === "CRASHED" || state === "RESOLVED";
  const showExplosion = isCrashed && !hasCashedOut;
  const showSafeExit = isCrashed && hasCashedOut;
  const endBps = isCrashed
    ? (crashedCrashPoint ?? liveMultiplierBps)
    : liveMultiplierBps;

  function progressFor(bps: number): number {
    return Math.max(
      0,
      Math.min(1, Math.log(Math.max(1.001, bps / 10_000)) / Math.log(20)),
    );
  }

  function pointAt(frac: number): [number, number] {
    const x = PAD + frac * (W - PAD * 2);
    const y = H - PAD - frac * frac * (H - PAD * 2);
    return [x, y];
  }

  const progress = progressFor(endBps);

  const steps = 48;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    points.push(pointAt((i / steps) * progress));
  }
  const tip = points[points.length - 1] ?? [PAD, H - PAD];
  const slope = 2 * progress * ((H - 2 * PAD) / (W - 2 * PAD));
  const angleDeg = -Math.atan(slope) * (180 / Math.PI);

  const cashoutProgress = myCashoutBps !== null ? progressFor(myCashoutBps) : null;
  const cashoutTip =
    cashoutProgress !== null && cashoutProgress <= progress
      ? pointAt(cashoutProgress)
      : null;

  const SAFE_COLOR = "#4ade80";
  const baseTrailColor = showExplosion
    ? "#ef4444"
    : isFlying || showSafeExit
      ? "#fbbf24"
      : "#6b7280";
  const trailGlow = showExplosion
    ? "#7f1d1d"
    : isFlying || showSafeExit
      ? "#f59e0b"
      : "#374151";

  const preCashoutPoints: Array<[number, number]> = [];
  let postCashoutPoints: Array<[number, number]> = [];
  if (cashoutTip && cashoutProgress !== null) {
    for (const p of points) {
      const xFrac = (p[0] - PAD) / (W - PAD * 2);
      if (xFrac <= cashoutProgress) preCashoutPoints.push(p);
      else postCashoutPoints.push(p);
    }
    if (preCashoutPoints.length > 0) preCashoutPoints.push(cashoutTip);
    postCashoutPoints = [cashoutTip, ...postCashoutPoints];
  }
  const trailColor = baseTrailColor;

  return (
    <div className="bg-gradient-to-b from-[#0b1023] via-[#0a0d1f] to-[#050816] rounded-xl overflow-hidden relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
        <defs>
          <linearGradient id="trailGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={trailGlow} stopOpacity="0" />
            <stop offset="60%" stopColor={trailColor} stopOpacity="0.7" />
            <stop offset="100%" stopColor={trailColor} stopOpacity="1" />
          </linearGradient>
          <radialGradient id="rocketGlow">
            <stop offset="0%" stopColor={trailColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={trailColor} stopOpacity="0" />
          </radialGradient>
          <filter id="blur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {STAR_FIELD.map((s, i) => (
          <circle
            key={i}
            cx={s.x * W}
            cy={s.y * H * 0.7}
            r={s.r}
            fill="#e5e7eb"
            opacity={isFlying ? s.o : s.o * 0.4}
            style={
              isFlying
                ? {
                    animation: `crash-twinkle ${1.5 + (i % 3) * 0.6}s ease-in-out ${i * 0.2}s infinite`,
                  }
                : undefined
            }
          />
        ))}

        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#1f2937" strokeWidth="1" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#1f2937" strokeWidth="1" />

        {cashoutTip ? (
          <>
            {preCashoutPoints.length >= 2 && (
              <>
                <polyline
                  points={preCashoutPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={SAFE_COLOR}
                  strokeWidth="8"
                  strokeLinejoin="round"
                  opacity="0.35"
                  filter="url(#blur)"
                />
                <polyline
                  points={preCashoutPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={SAFE_COLOR}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            )}
            {postCashoutPoints.length >= 2 && (
              <>
                <polyline
                  points={postCashoutPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={showExplosion ? "#ef4444" : "#7f1d1d"}
                  strokeWidth="8"
                  strokeLinejoin="round"
                  opacity="0.25"
                  filter="url(#blur)"
                />
                <polyline
                  points={postCashoutPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={showExplosion ? "#ef4444" : "#9ca3af"}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              </>
            )}
          </>
        ) : (
          <>
            <polyline
              points={points.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke={trailColor}
              strokeWidth="8"
              strokeLinejoin="round"
              opacity="0.35"
              filter="url(#blur)"
            />
            <polyline
              points={points.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke="url(#trailGrad)"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {cashoutTip && (
          <g transform={`translate(${cashoutTip[0]}, ${cashoutTip[1]})`}>
            <circle r="16" fill={SAFE_COLOR} opacity="0.45" filter="url(#blur)" />
            <circle r="10" fill={SAFE_COLOR} opacity="0.95" />
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="14"
              fill="#052e16"
              fontWeight="bold"
            >
              ✓
            </text>
          </g>
        )}

        {showExplosion ? (
          <g transform={`translate(${tip[0]}, ${tip[1]})`}>
            <circle r="18" fill="#ef4444" opacity="0.5" filter="url(#blur)" />
            <circle r="10" fill="#fbbf24" opacity="0.9" />
            <text textAnchor="middle" dominantBaseline="middle" fontSize="22">
              💥
            </text>
          </g>
        ) : showSafeExit ? null : (
          <g transform={`translate(${tip[0]}, ${tip[1]}) rotate(${angleDeg})`}>
            <circle r="14" fill="url(#rocketGlow)" />
            {isFlying && (
              <g className="crash-flame" transform="translate(-12, 0)">
                <circle cx="-2" cy="0" r="3.5" fill="#fbbf24" opacity="0.9" />
                <circle cx="-7" cy="-1" r="2.5" fill="#f97316" opacity="0.8" />
                <circle cx="-11" cy="1" r="1.8" fill="#ef4444" opacity="0.6" />
              </g>
            )}
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="20"
              transform="rotate(45)"
            >
              🚀
            </text>
          </g>
        )}
      </svg>
      <style>{`
        @keyframes crash-twinkle { 0%, 100% { opacity: var(--o, 0.6); } 50% { opacity: 0.15; } }
        .crash-flame { animation: crash-flame-flicker 0.12s steps(2) infinite; transform-origin: 0 0; }
        @keyframes crash-flame-flicker { 0% { transform: translate(-12px, 0) scaleX(1); } 100% { transform: translate(-12px, 0) scaleX(1.25); } }
      `}</style>
    </div>
  );
}
