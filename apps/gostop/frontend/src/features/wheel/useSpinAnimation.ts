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

// Pre-spin rotation rate (deg/s). 540 deg/s = 1.5 revolutions / second —
// energetic enough to read as "spinning" but slow enough that segments
// are still legible as they fly past the peg.
const LOOP_SPEED_DEG_PER_SEC = 540;

// Target wall-clock duration for the decisive landing. The actual value
// shifts slightly per-spin so the boundary velocity matches the loop
// velocity exactly (see landOn) — without that match the wheel appears
// to *accelerate* at the loop→decisive handoff before slowing down.
const DECISIVE_TARGET_MS = 4500;

// Minimum number of full extra revolutions to spin during the decisive
// phase regardless of where the target segment sits. Floor for visual
// drama on near-misses where the forward delta is small.
const DECISIVE_MIN_EXTRA_TURNS = 2;

// Graceful stop duration (reject / timeout). Same velocity-matching idea
// as decisive: starts at loop velocity and decelerates to 0.
const DECEL_MS = 1200;

// easeOutCubic: f(t) = 1 - (1-t)^3, f'(0)=3, f'(1)=0.
// Compared to easeOutQuad (f'(τ) = 2(1-τ)) the cubic profile drops
// terminal velocity ~6× faster — at 90% of duration the wheel is
// drifting at ~1% of v_loop instead of 10%. That long, gentle tail is
// what reads as "서서히 느려지다 멈춰서는" rather than an abrupt halt.
// Velocity continuity at the loop→decisive boundary is preserved by
// solving duration = 3 * distance / v_loop_per_ms in landOn.
function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
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

  // In-flight landOn / gracefulStop resolver. Held so that unmount or
  // reset() can settle the awaited Promise instead of leaving the caller
  // (e.g. WheelPage.onSpin) hanging on `await landOn(...)` forever.
  const pendingResolveRef = useRef<(() => void) | null>(null);

  const phaseRef = useRef<SpinPhase>('idle');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Apply current rotation to DOM and fire tick on segment crossing.
  // Uses the SVG `transform` attribute (not CSS) so React re-renders of
  // the parent component cannot wipe the inline value mid-spin.
  const SVG_CENTER = 300; // WheelCanvas viewBox center; kept in sync there.
  const applyRotation = useCallback(
    (deg: number) => {
      const el = rotatingRef.current;
      if (!el) return;
      el.setAttribute(
        'transform',
        `rotate(${deg.toFixed(3)} ${SVG_CENTER} ${SVG_CENTER})`,
      );
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
        // Settle any prior pending awaiter before overwriting; otherwise
        // a back-to-back landOn() would leak the previous Promise.
        pendingResolveRef.current?.();
        pendingResolveRef.current = resolve;
        stopRaf();

        // Target rotation so segment `index`'s center sits under the peg.
        // Wheel rotated by R clockwise → segment originally at θ is now at
        // θ+R. For peg at 0°: (index+0.5)*segAngle + R ≡ 0 (mod 360).
        const segAngle = 360 / segmentCount;
        const centerAngle = (index + 0.5) * segAngle;
        const jitter = (Math.random() - 0.5) * segAngle * 0.7;

        const start = rotationRef.current;
        const currentMod = ((start % 360) + 360) % 360;
        const desiredMod = ((360 - centerAngle + jitter) % 360 + 360) % 360;
        const forwardDelta = (desiredMod - currentMod + 360) % 360;

        // Pick `extraTurns` so the total distance lands near the natural
        // deceleration distance for our loop velocity: distance_natural =
        // v_loop * D_target / 2 (the area under a linear decel from
        // v_loop to 0 over D_target). This keeps the wheel feeling like
        // continuous motion that just gradually slows, not "loop → speed
        // up → slow down".
        const vLoopDegPerMs = LOOP_SPEED_DEG_PER_SEC / 1000;
        const idealDistance = (vLoopDegPerMs * DECISIVE_TARGET_MS) / 2;
        const extraTurns = Math.max(
          DECISIVE_MIN_EXTRA_TURNS,
          Math.round((idealDistance - forwardDelta) / 360),
        );
        const totalDistance = forwardDelta + 360 * extraTurns;
        const target = start + totalDistance;

        // Recompute duration so that easeOutCubic's f'(0)=3 yields an
        // initial velocity exactly equal to v_loop. Without this the
        // boundary appears as a velocity discontinuity (acceleration).
        //   v_init = f'(0) * distance / duration = 3 * distance / duration
        //   set v_init = v_loop  =>  duration = 3 * distance / v_loop
        const durationMs = (3 * totalDistance) / vLoopDegPerMs;

        setPhase('decisive');
        phaseRef.current = 'decisive';

        const beginTs = performance.now();
        const tickDecisive = (ts: number) => {
          const t = Math.min(1, (ts - beginTs) / durationMs);
          const eased = easeOutCubic(t);
          rotationRef.current = start + totalDistance * eased;
          applyRotation(rotationRef.current);
          if (t < 1 && phaseRef.current === 'decisive') {
            rafRef.current = requestAnimationFrame(tickDecisive);
          } else {
            stopRaf();
            // Snap exactly onto the target for pixel-perfect alignment.
            rotationRef.current = target;
            applyRotation(target);
            setPhase('revealed');
            phaseRef.current = 'revealed';
            pendingResolveRef.current = null;
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
      pendingResolveRef.current?.();
      pendingResolveRef.current = resolve;
      stopRaf();
      setPhase('decel');
      phaseRef.current = 'decel';

      // Same idea as landOn: pick distance so the easeOutCubic initial
      // velocity matches v_loop exactly, so the wheel does not "speed
      // up" at the reject/timeout handoff.
      //   v_init = 3 * distance / duration = v_loop
      //   => distance = v_loop * duration / 3
      const vLoopDegPerMs = LOOP_SPEED_DEG_PER_SEC / 1000;
      const totalDistance = (vLoopDegPerMs * DECEL_MS) / 3;
      const start = rotationRef.current;
      const target = start + totalDistance;
      const beginTs = performance.now();

      const tickDecel = (ts: number) => {
        const t = Math.min(1, (ts - beginTs) / DECEL_MS);
        const eased = easeOutCubic(t);
        rotationRef.current = start + totalDistance * eased;
        applyRotation(rotationRef.current);
        if (t < 1 && phaseRef.current === 'decel') {
          rafRef.current = requestAnimationFrame(tickDecel);
        } else {
          stopRaf();
          rotationRef.current = target;
          applyRotation(target);
          setPhase('idle');
          phaseRef.current = 'idle';
          pendingResolveRef.current = null;
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
    // Settle any awaiter so callers (`await landOn(...)`) don't hang
    // when the user dismisses an error mid-decel.
    pendingResolveRef.current?.();
    pendingResolveRef.current = null;
  }, [stopRaf]);

  // Cleanup on unmount: cancel any pending rAF AND settle any in-flight
  // Promise. Without the resolve, `await landOn(...)` in the caller would
  // never settle, pinning closure refs after the page is gone.
  useEffect(() => {
    return () => {
      stopRaf();
      pendingResolveRef.current?.();
      pendingResolveRef.current = null;
    };
  }, [stopRaf]);

  return { phase, startLoop, landOn, gracefulStop, reset };
}
