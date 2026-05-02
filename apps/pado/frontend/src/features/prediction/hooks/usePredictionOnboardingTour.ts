/**
 * Prediction Onboarding Tour
 *
 * Reuses the parameterized useOnboardingTour from features/trading. Distinct
 * storage key so the prediction tour doesn't interfere with the trading tour.
 */

import {
  useOnboardingTour,
  isTourCompleted as isAnyTourCompleted,
  type TourStep,
  type OnboardingTourState,
} from '../../trading/hooks/useOnboardingTour';

export const PREDICTION_TOUR_STORAGE_KEY = 'pado:predictionTourCompleted';

export const PREDICTION_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="prediction-market-list"]',
    title: 'Prediction Markets',
    description: 'Trade YES or NO on real-world events. Same Pado account that funds your spot and perp trades.',
    noTargetDescription: 'Browse prediction markets and trade YES or NO on real-world events.',
  },
  {
    target: '[data-tour="prediction-orderbook"]',
    title: 'Order Book',
    description: 'Each price is a probability. 60% means the market thinks there is a 60% chance this resolves YES.',
  },
  {
    target: '[data-tour="prediction-order-form"]',
    title: 'Place an Order',
    description: 'Market or Limit buy. Your NUSDC comes from your Pado account automatically.',
    noTargetDescription: 'Connect your wallet. Your Pado account sets up automatically on your first trade.',
  },
  {
    target: '[data-tour="prediction-positions"]',
    title: 'Your Positions',
    description: 'Open positions show estimated payout if the market resolves in your favor.',
  },
  {
    target: '[data-tour="portfolio-link"]',
    title: 'Portfolio',
    description: 'View all your prediction positions and Pado Capital (Spot + Prediction balance) in one place.',
    noTargetDescription: 'After placing your first trade, check your portfolio for positions and P&L.',
  },
];

export function usePredictionOnboardingTour(): OnboardingTourState {
  return useOnboardingTour(PREDICTION_TOUR_STORAGE_KEY, PREDICTION_TOUR_STEPS);
}

export function isPredictionTourCompleted(): boolean {
  return isAnyTourCompleted(PREDICTION_TOUR_STORAGE_KEY);
}
