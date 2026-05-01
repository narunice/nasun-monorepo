/**
 * Segmented health donut. Shows N discrete arc segments (Alliance = 4,
 * Genesis Pass = 5) with `lit` of them in the "active" color and the rest
 * dimmed. Each inactive day darkens one segment, so the visual maps 1:1 to
 * the user's activity history.
 *
 * Implementation: render N circles, each drawing a single arc via
 * stroke-dasharray, rotated to its slot. A small inter-segment gap keeps
 * the dividers crisp without overlapping arcs.
 */
const SIZE = 100;
// Stroke width tuned to feel airier than the original 10px donut while still
// reading clearly at 96px display size.
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Inter-segment gap as a fraction of the full circle. Subtracted from each
// segment's arc so neighboring segments don't touch.
const GAP_DEG = 5;

interface SegmentedDonutProps {
  /** Total number of segments (Alliance = 4, Genesis Pass = 5). */
  segments: number;
  /** How many leading segments are lit. 0 means all dim. */
  lit: number;
  /** Tailwind stroke class for lit segments (e.g. "stroke-emerald-400"). */
  litStrokeClass: string;
  /** Tailwind stroke class for dim segments. Defaults to a soft gray. */
  dimStrokeClass?: string;
  /** Optional drop-shadow color applied to the lit ring. */
  glowColor?: string;
  /** Center label (e.g. "3/4", "Healthy"). */
  label?: string;
  labelClassName?: string;
}

export function SegmentedDonut({
  segments,
  lit,
  litStrokeClass,
  dimStrokeClass = "stroke-uju-border/50",
  glowColor,
  label,
  labelClassName,
}: SegmentedDonutProps) {
  const segmentDeg = 360 / segments;
  // The visible arc per segment is slightly less than the slot to leave a
  // gap. Convert degrees to dasharray units (a fraction of CIRCUMFERENCE).
  const arcLen = ((segmentDeg - GAP_DEG) / 360) * CIRCUMFERENCE;
  const dashArray = `${arcLen} ${CIRCUMFERENCE - arcLen}`;

  return (
    <div className="relative w-24 h-24">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full h-full -rotate-90"
        aria-hidden="true"
        style={
          glowColor && lit > 0
            ? { filter: `drop-shadow(0 0 6px ${glowColor})` }
            : undefined
        }
      >
        {Array.from({ length: segments }).map((_, i) => {
          const isLit = i < lit;
          // Center each segment within its slot: rotate by (i * slot) +
          // half the gap so the leading edge of the arc starts after the
          // gap, not at the slot boundary.
          const rotate = i * segmentDeg + GAP_DEG / 2;
          return (
            <circle
              key={i}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="butt"
              strokeDasharray={dashArray}
              transform={`rotate(${rotate} ${SIZE / 2} ${SIZE / 2})`}
              className={`${isLit ? litStrokeClass : dimStrokeClass} transition-colors duration-500`}
            />
          );
        })}
      </svg>
      {label && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`${labelClassName ?? "text-lg font-normal"} text-uju-primary tabular-nums text-center px-1`}
          >
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
