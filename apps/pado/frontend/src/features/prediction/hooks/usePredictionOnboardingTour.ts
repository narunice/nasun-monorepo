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

// All steps reference elements present on PredictMarketPage.
export const PREDICTION_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="prediction-orderbook"]',
    title: 'Order Book',
    description: 'Each price is both a price and a probability. 60¢ means a YES share costs $0.60 and the market implies a 60% chance of YES.',
  },
  {
    target: '[data-tour="prediction-order-form"]',
    title: 'Place an Order',
    description: 'Example: buy $10 of YES at 60¢ → you receive ~16.7 YES shares. If YES resolves true, each share pays $1 → $16.70. If false, your shares expire worthless ($10 loss).',
  },
  {
    target: '[data-tour="prediction-positions"]',
    title: 'Your Positions',
    description: 'Open positions show your shares and estimated payout if the market resolves in your favor. You can close a position anytime by selling your shares back into the order book.',
  },
  {
    target: '[data-tour="portfolio-link"]',
    title: 'Portfolio',
    description: 'View all your prediction positions and Pado Capital (Spot + Prediction balance) in one place.',
  },
];

export function usePredictionOnboardingTour(): OnboardingTourState {
  return useOnboardingTour(PREDICTION_TOUR_STORAGE_KEY, PREDICTION_TOUR_STEPS);
}

export function isPredictionTourCompleted(): boolean {
  return isAnyTourCompleted(PREDICTION_TOUR_STORAGE_KEY);
}
