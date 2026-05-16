import { useCallback, useEffect, useRef, useState } from 'react';
import { playWheelTick } from '../../lib/sounds';

export type SpinPhase =
  | 'idle'
  | 'loop' // pre-spin etalonnage during tx confirm
  | 'decisive' // landing animation after result received
  | 'decel' // graceful slow-stop after reject / timeout
  | 'revealed';

interface SpinAnimationApi {
  phase: SpinPhase;
  /** Start a fast continuous loop. Safe to call when already in loop. */
  startLoop: () => void;
  /** Land on segment `index`. Returns a promise that resolves on reveal. */
  landOn: (index: number) => Promise<void>;
  /** Stop gracefully (reject / timeout). */
  gracefulStop: () => Promise<void>;
  /** Reset back to idle, keep current rotation. */
  reset: () => void;
}

const SEGMENT_COUNT_DEFAULT = 20;

// Pre-spin rotation rate (deg/s). One full revolution every ~1.5s.
const LOOP_SPEED_DEG_PER_SEC = 240;

// Decisive landing duration (ms) — long enough to read each segment as it
// flies past, short enough that the user doesn't get bored.
const DECISIVE_MS = 4200;
// Number of additional full revolutions baked into the decisive land.
const DECISIVE_EXTRA_TURNS = 4;
// Graceful stop duration.
const DECEL_MS = 900;

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useSpinAnimation(
  rotatingRef: React.RefObject<SVGGElement | null>,
  segmentCount: number = SEGMENT_COUNT_DEFAULT,
): SpinAnimationApi {
  const [phase, setPhase] = useState<SpinPhase>('idle');

  // Mutable rotation state. Owned by rAF; React never reads this directly.
  const rotationRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Track the last segment index we sat on so we can fire tick sounds when
  // the boundary moves under the peg.
  const lastSegRef = useRef<number>(0);

  const phaseRef = useRef<SpinPhase>('idle');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Apply current rotation to DOM and fire tick on segment crossing.
  const applyRotation = useCallback(
    (deg: number) => {
      const el = rotatingRef.current;
      if (!el) return;
      el.style.transform = `rotate(${deg}deg)`;
      // segment index currently under the peg (segment whose center is at
      // top). With rotation R applied, the segment under the peg is whichever
      // segment originally sat at angle (-R) mod 360. Walk the boundary.
      const normalized = ((deg % 360) + 360) % 360;
      const segAngle = 360 / segmentCount;
      // boundary index = floor((360 - normalized) / segAngle). Use
      // boundary changes (not exact segment id) to emit ticks at edges.
      const seg = Math.floor((360 - normalized) / segAngle) % segmentCount;
      if (seg !== lastSegRef.current) {
        lastSegRef.current = seg;
        playWheelTick();
      }
    },
    [rotatingRef, segmentCount],
  );

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  // Loop tick: constant angular velocity.
  const loopTick = useCallback(
    (ts: number) => {
      if (phaseRef.current !== 'loop') return;
      const last = lastTsRef.current ?? ts;
      const dt = (ts - last) / 1000;
      lastTsRef.current = ts;
      rotationRef.current =
        (rotationRef.current + dt * LOOP_SPEED_DEG_PER_SEC) % 360_000;
      applyRotation(rotationRef.current);
      rafRef.current = requestAnimationFrame(loopTick);
    },
    [applyRotation],
  );

  const startLoop = useCallback(() => {
    stopRaf();
    setPhase('loop');
    phaseRef.current = 'loop';
    rafRef.current = requestAnimationFrame(loopTick);
  }, [loopTick, stopRaf]);

  const landOn = useCallback(
    (index: number): Promise<void> => {
      return new Promise<void>((resolve) => {
        stopRaf();
        // Compute target rotation so segment `index`'s center sits under the peg.
        const segAngle = 360 / segmentCount;
        const centerAngle = (index + 0.5) * segAngle;
        // We want (centerAngle + R) ≡ 0 (mod 360), so R ≡ -centerAngle.
        // Pick the next R that is a positive offset above current rotation
        // plus DECISIVE_EXTRA_TURNS full revolutions, with mild jitter so
        // the wheel does not always stop dead-center.
        const jitter = (Math.random() - 0.5) * segAngle * 0.7;
        const start = rotationRef.current;
        const currentMod = ((start % 360) + 360) % 360;
        const desiredMod = ((360 - centerAngle + jitter) % 360 + 360) % 360;
        // Shortest forward delta from current to desired (always positive).
        const forwardDelta = (desiredMod - currentMod + 360) % 360;
        const target =
          start + 360 * DECISIVE_EXTRA_TURNS + forwardDelta;

        setPhase('decisive');
        phaseRef.current = 'decisive';

        const beginTs = performance.now();
        const tickDecisive = (ts: number) => {
          const t = Math.min(1, (ts - beginTs) / DECISIVE_MS);
          const eased = easeOutExpo(t);
          rotationRef.current = start + (target - start) * eased;
          applyRotation(rotationRef.current);
          if (t < 1 && phaseRef.current === 'decisive') {
            rafRef.current = requestAnimationFrame(tickDecisive);
          } else {
            stopRaf();
            // Snap exactly onto the target for visual cleanliness.
            rotationRef.current = target;
            applyRotation(target);
            setPhase('revealed');
            phaseRef.current = 'revealed';
            resolve();
          }
        };
        rafRef.current = requestAnimationFrame(tickDecisive);
      });
    },
    [applyRotation, segmentCount, stopRaf],
  );

  const gracefulStop = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      stopRaf();
      setPhase('decel');
      phaseRef.current = 'decel';
      const start = rotationRef.current;
      // Decelerate by ~half a revolution before stopping.
      const target = start + 180;
      const beginTs = performance.now();
      const tickDecel = (ts: number) => {
        const t = Math.min(1, (ts - beginTs) / DECEL_MS);
        const eased = easeOutCubic(t);
        rotationRef.current = start + (target - start) * eased;
        applyRotation(rotationRef.current);
        if (t < 1 && phaseRef.current === 'decel') {
          rafRef.current = requestAnimationFrame(tickDecel);
        } else {
          stopRaf();
          setPhase('idle');
          phaseRef.current = 'idle';
          resolve();
        }
      };
      rafRef.current = requestAnimationFrame(tickDecel);
    });
  }, [applyRotation, stopRaf]);

  const reset = useCallback(() => {
    stopRaf();
    setPhase('idle');
    phaseRef.current = 'idle';
  }, [stopRaf]);

  // Cleanup on unmount: cancel any pending rAF so we don't mutate DOM after
  // the component is gone.
  useEffect(() => {
    return () => {
      stopRaf();
    };
  }, [stopRaf]);

  return { phase, startLoop, landOn, gracefulStop, reset };
}
