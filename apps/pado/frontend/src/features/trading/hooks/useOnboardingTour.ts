/**
 * useOnboardingTour Hook
 * Manages onboarding tour state with localStorage persistence.
 * Auto-starts on first visit to the trading page.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'pado:onboardingCompleted';

export interface TourStep {
  target: string;
  title: string;
  description: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="chart"]',
    title: 'Price Chart',
    description: 'Real-time market data with candlestick charts, indicators, and drawing tools.',
  },
  {
    target: '[data-tour="orderbook"]',
    title: 'Order Book',
    description: 'Live buy and sell orders. Click any price to set it in your order form.',
  },
  {
    target: '[data-tour="orderform"]',
    title: 'Order Form',
    description: 'Place limit or market orders. Your balance and open orders are shown here.',
  },
  {
    target: '[data-tour="chat"]',
    title: 'Live Chat',
    description: 'Chat with other traders in real-time. Share ideas and discuss markets.',
  },
  {
    target: '[data-tour="mode-toggle"]',
    title: 'Interface Mode',
    description: 'Switch between Simple and Pro layouts. Simple mode is great for quick trades.',
  },
];

export interface OnboardingTourState {
  isActive: boolean;
  step: number;
  totalSteps: number;
  currentStep: TourStep | null;
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
}

function isCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function markCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch { /* ignore */ }
}

export function useOnboardingTour(): OnboardingTourState {
  const [isActive, setIsActive] = useState(false);
  const [step, setStep] = useState(0);

  const start = useCallback(() => {
    setStep(0);
    setIsActive(true);
  }, []);

  const complete = useCallback(() => {
    setIsActive(false);
    setStep(0);
    markCompleted();
  }, []);

  const next = useCallback(() => {
    if (step >= TOUR_STEPS.length - 1) {
      complete();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, complete]);

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const skip = useCallback(() => {
    complete();
  }, [complete]);

  return {
    isActive,
    step,
    totalSteps: TOUR_STEPS.length,
    currentStep: isActive ? TOUR_STEPS[step] ?? null : null,
    start,
    next,
    prev,
    skip,
  };
}

export { isCompleted as isTourCompleted };
