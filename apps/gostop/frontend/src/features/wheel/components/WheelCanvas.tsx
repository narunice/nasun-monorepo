import { forwardRef, useMemo } from 'react';

/**
 * 20-segment wheel SVG. The rotating group's transform is mutated
 * imperatively from the animation hook via the forwarded ref — keeping
 * React out of the hot path so 60fps spin stays smooth.
 */

const SIZE = 600;
const CENTER = SIZE / 2;
const OUTER_R = 280;
const HUB_R = 50;
const LABEL_R = 200;

interface SegmentStyle {
  fill: string;
  stroke: string;
  text: string;
  glow?: boolean;
}

function styleForBps(bps: number): SegmentStyle {
  if (bps === 0) {
    return { fill: '#0e0e16', stroke: '#2a2a3a', text: '#3a3a4c' };
  }
  if (bps >= 50_000) {
    return {
      fill: 'url(#segGradJackpot)',
      stroke: '#34d399',
      text: '#ecfdf5',
      glow: true,
    };
  }
  if (bps >= 30_000) {
    return { fill: '#065f46', stroke: '#10b981', text: '#a7f3d0' };
  }
  if (bps >= 20_000) {
    return { fill: '#3a2a08', stroke: '#e8c158', text: '#f2d67b' };
  }
  // 1.5x and any other low gold band
  return { fill: '#231906', stroke: '#8a6a18', text: '#e8c158' };
}

function polar(angleDeg: number, r: number): { x: number; y: number } {
  // 0deg = top (12 o'clock). Clockwise positive.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

function segmentPath(
  startDeg: number,
  endDeg: number,
  outerR: number,
  innerR: number,
): string {
  const o1 = polar(startDeg, outerR);
  const o2 = polar(endDeg, outerR);
  const i1 = polar(startDeg, innerR);
  const i2 = polar(endDeg, innerR);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

interface WheelCanvasProps {
  segments: number[];
  pulseSegmentIndex?: number | null;
}

export const WheelCanvas = forwardRef<SVGGElement, WheelCanvasProps>(
  function WheelCanvas({ segments, pulseSegmentIndex }, ref) {
    const segCount = segments.length || 20;
    const segAngle = 360 / segCount;

    const slices = useMemo(() => {
      return segments.map((bps, i) => {
        const start = i * segAngle;
        const end = (i + 1) * segAngle;
        const mid = start + segAngle / 2;
        const labelPos = polar(mid, LABEL_R);
        const path = segmentPath(start, end, OUTER_R, HUB_R + 6);
        const style = styleForBps(bps);
        const labelText =
          bps === 0
            ? '0×'
            : `${(bps / 10_000).toFixed(bps % 10_000 === 0 ? 0 : 1)}×`;
        return { i, mid, path, style, labelPos, labelText };
      });
    }, [segments, segAngle]);

    return (
      <div className="relative w-full aspect-square max-w-[600px] mx-auto select-none">
        {/* Peg pointer — fixed at 12 o'clock, points down into the wheel.
            Outside the rotating <g> so it stays stationary. */}
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
          height="100%"
          className="absolute inset-0"
          aria-hidden
        >
          <defs>
            <radialGradient id="segGradJackpot" cx="0.5" cy="0.5" r="0.6">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="60%" stopColor="#065f46" />
              <stop offset="100%" stopColor="#022c22" />
            </radialGradient>
            <radialGradient id="hubGrad" cx="0.5" cy="0.45" r="0.6">
              <stop offset="0%" stopColor="#f8e8b6" />
              <stop offset="55%" stopColor="#d4af37" />
              <stop offset="100%" stopColor="#5d4710" />
            </radialGradient>
            <filter id="goldShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#d4af37" floodOpacity="0.45" />
              <feComposite in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter
              id="emeraldShadow"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
            >
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feFlood floodColor="#34d399" floodOpacity="0.7" />
              <feComposite in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer gold rim */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={OUTER_R + 8}
            fill="none"
            stroke="#5d4710"
            strokeWidth={3}
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={OUTER_R + 3}
            fill="none"
            stroke="#d4af37"
            strokeWidth={2}
            filter="url(#goldShadow)"
          />

          {/* Rotating group — animation hook mutates style.transform here. */}
          <g
            ref={ref}
            style={{
              transformOrigin: `${CENTER}px ${CENTER}px`,
              transform: 'rotate(0deg)',
              willChange: 'transform',
            }}
          >
            {slices.map((s) => {
              const pulsing = pulseSegmentIndex === s.i;
              return (
                <g key={s.i}>
                  <path
                    d={s.path}
                    fill={s.style.fill}
                    stroke={s.style.stroke}
                    strokeWidth={pulsing ? 3 : 1.5}
                    filter={
                      pulsing && s.style.glow
                        ? 'url(#emeraldShadow)'
                        : pulsing
                          ? 'url(#goldShadow)'
                          : undefined
                    }
                  />
                  <text
                    x={s.labelPos.x}
                    y={s.labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="Playfair Display, Georgia, serif"
                    fontStyle="italic"
                    fontWeight={600}
                    fontSize={s.style.glow ? 36 : 28}
                    fill={s.style.text}
                    transform={`rotate(${s.mid} ${s.labelPos.x} ${s.labelPos.y})`}
                  >
                    {s.labelText}
                  </text>
                </g>
              );
            })}

            {/* Hub */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={HUB_R}
              fill="url(#hubGrad)"
              stroke="#5d4710"
              strokeWidth={2}
            />
            <text
              x={CENTER}
              y={CENTER + 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="Playfair Display, Georgia, serif"
              fontStyle="italic"
              fontWeight={700}
              fontSize={22}
              fill="#0b0b10"
            >
              nasun
            </text>
          </g>

          {/* Peg pointer — fixed, drawn last so it sits above the wheel. */}
          <g>
            <polygon
              points={`${CENTER - 18},${CENTER - OUTER_R - 18}
                      ${CENTER + 18},${CENTER - OUTER_R - 18}
                      ${CENTER},${CENTER - OUTER_R + 18}`}
              fill="#d4af37"
              stroke="#f8e8b6"
              strokeWidth={2}
              filter="url(#goldShadow)"
            />
            <circle
              cx={CENTER}
              cy={CENTER - OUTER_R - 14}
              r={5}
              fill="#f8e8b6"
            />
          </g>
        </svg>
      </div>
    );
  },
);
