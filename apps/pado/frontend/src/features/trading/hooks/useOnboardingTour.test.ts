import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnboardingTour, isTourCompleted, TOUR_STEPS } from './useOnboardingTour';

describe('useOnboardingTour', () => {
  it('starts inactive with step 0', () => {
    const { result } = renderHook(() => useOnboardingTour());
    expect(result.current.isActive).toBe(false);
    expect(result.current.step).toBe(0);
    expect(result.current.currentStep).toBeNull();
  });

  it('has correct totalSteps count', () => {
    const { result } = renderHook(() => useOnboardingTour());
    expect(result.current.totalSteps).toBe(TOUR_STEPS.length);
  });

  it('activates on start', () => {
    const { result } = renderHook(() => useOnboardingTour());
    act(() => result.current.start());
    expect(result.current.isActive).toBe(true);
    expect(result.current.step).toBe(0);
    expect(result.current.currentStep).toBe(TOUR_STEPS[0]);
  });

  it('advances step on next', () => {
    const { result } = renderHook(() => useOnboardingTour());
    act(() => result.current.start());
    act(() => result.current.next());
    expect(result.current.step).toBe(1);
    expect(result.current.currentStep).toBe(TOUR_STEPS[1]);
  });

  it('goes back on prev', () => {
    const { result } = renderHook(() => useOnboardingTour());
    act(() => result.current.start());
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.step).toBe(2);
    act(() => result.current.prev());
    expect(result.current.step).toBe(1);
  });

  it('does not go below step 0 on prev', () => {
    const { result } = renderHook(() => useOnboardingTour());
    act(() => result.current.start());
    act(() => result.current.prev());
    expect(result.current.step).toBe(0);
  });

  it('completes and deactivates on final next', () => {
    const { result } = renderHook(() => useOnboardingTour());
    act(() => result.current.start());

    // Advance through all steps
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      act(() => result.current.next());
    }

    expect(result.current.isActive).toBe(false);
    expect(result.current.step).toBe(0);
    expect(result.current.currentStep).toBeNull();
  });

  it('marks completed in localStorage after finishing', () => {
    const { result } = renderHook(() => useOnboardingTour());
    act(() => result.current.start());

    for (let i = 0; i < TOUR_STEPS.length; i++) {
      act(() => result.current.next());
    }

    expect(isTourCompleted()).toBe(true);
  });

  it('skip completes and deactivates immediately', () => {
    const { result } = renderHook(() => useOnboardingTour());
    act(() => result.current.start());
    act(() => result.current.next()); // Go to step 1
    act(() => result.current.skip());

    expect(result.current.isActive).toBe(false);
    expect(isTourCompleted()).toBe(true);
  });

  it('isTourCompleted returns false before completion', () => {
    expect(isTourCompleted()).toBe(false);
  });

  it('start resets step to 0', () => {
    const { result } = renderHook(() => useOnboardingTour());
    act(() => result.current.start());
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.step).toBe(2);

    act(() => result.current.start());
    expect(result.current.step).toBe(0);
    expect(result.current.isActive).toBe(true);
  });
});

describe('TOUR_STEPS', () => {
  it('has valid target selectors', () => {
    for (const step of TOUR_STEPS) {
      expect(step.target).toMatch(/^\[data-tour="[a-z-]+"\]$/);
    }
  });

  it('has non-empty titles and descriptions', () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
  });

  it('covers chart, orderbook, orderform, and chat', () => {
    const targets = TOUR_STEPS.map((s) => s.target);
    expect(targets).toContain('[data-tour="chart"]');
    expect(targets).toContain('[data-tour="orderbook"]');
    expect(targets).toContain('[data-tour="orderform"]');
    expect(targets).toContain('[data-tour="chat"]');
  });
});
