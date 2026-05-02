/**
 * OnboardingTour Component
 * Full-screen overlay with spotlight cutout and tooltip for guided tour.
 */

import { useEffect, useId, useState, useRef, useCallback } from 'react';
import { type OnboardingTourState } from '../hooks/useOnboardingTour';

interface OnboardingTourProps {
  tour: OnboardingTourState;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

export function OnboardingTour({ tour }: OnboardingTourProps) {
  const maskId = useId();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef(tour.step);

  const updateRect = useCallback(() => {
    if (!tour.currentStep) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(tour.currentStep.target);
    if (!el) {
      setTargetRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    setTargetRect({
      top: rect.top - PADDING,
      left: rect.left - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    });
  }, [tour.currentStep]);

  // Update rect on step change and window resize
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!tour.isActive) return;
    updateRect();

    // Auto-skip step if target element is not in the DOM (unless step has fallback text)
    if (tour.currentStep) {
      const el = document.querySelector(tour.currentStep.target);
      if (!el && !tour.currentStep.noTargetDescription) {
        const goingForward = tour.step >= prevStepRef.current;
        prevStepRef.current = tour.step;
        const timer = setTimeout(() => goingForward ? tour.next() : tour.prev(), 100);
        return () => clearTimeout(timer);
      }
    }

    prevStepRef.current = tour.step;

    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [tour.isActive, tour.step, updateRect]); // eslint-disable-line react-hooks/exhaustive-deps -- tour.next/prev are stable
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!tour.isActive || !tour.currentStep) return null;

  // Use fallback description when target is not in the DOM
  const hasTarget = !!targetRect;
  const displayDescription = hasTarget
    ? tour.currentStep.description
    : (tour.currentStep.noTargetDescription ?? tour.currentStep.description);

  // Compute tooltip position (below or above target, or centered if no target)
  const tooltipStyle: React.CSSProperties = {};
  if (targetRect) {
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - (targetRect.top + targetRect.height);
    const tooltipPlaceBelow = spaceBelow > 180;

    tooltipStyle.position = 'fixed';
    tooltipStyle.left = Math.max(16, Math.min(targetRect.left, window.innerWidth - 340));
    tooltipStyle.zIndex = 60;

    if (tooltipPlaceBelow) {
      tooltipStyle.top = targetRect.top + targetRect.height + 12;
    } else {
      tooltipStyle.bottom = viewportHeight - targetRect.top + 12;
    }
  } else {
    tooltipStyle.position = 'fixed';
    tooltipStyle.top = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
    tooltipStyle.zIndex = 60;
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 51 }}>
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* Target highlight border */}
      {targetRect && (
        <div
          className="absolute border-2 border-purple-400 rounded-lg pointer-events-none animate-pulse"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            zIndex: 52,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="bg-theme-bg-secondary border border-theme-border rounded-lg p-4 shadow-xl max-w-xs"
        style={{ ...tooltipStyle, zIndex: 60 }}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-2">
          {Array.from({ length: tour.totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === tour.step ? 'bg-purple-500' : i < tour.step ? 'bg-purple-300' : 'bg-theme-bg-tertiary'
              }`}
            />
          ))}
          <span className="text-[10px] text-theme-text-muted ml-auto">
            {tour.step + 1}/{tour.totalSteps}
          </span>
        </div>

        {/* Content */}
        <h3 className="text-sm font-semibold text-theme-text-primary mb-1">
          {tour.currentStep.title}
        </h3>
        <p className="text-xs text-theme-text-secondary leading-relaxed mb-3">
          {displayDescription}
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={tour.skip}
            className="text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
          >
            Skip
          </button>
          <div className="flex-1" />
          {tour.step > 0 && (
            <button
              onClick={tour.prev}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={tour.next}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors"
          >
            {tour.step === tour.totalSteps - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
