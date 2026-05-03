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
    description: 'Each price is a probability. 60% means the market thinks there\'s a 60% chance this resolves YES.',
    noTargetDescription: 'The order book shows live YES/NO bids. Each price level represents a probability.',
  },
  {
    target: '[data-tour="prediction-order-form"]',
    title: 'Place an Order',
    description: 'Buy YES or NO with Market or Limit orders. Your NUSDC comes from your Pado account automatically.',
    noTargetDescription: 'Connect your wallet to place YES/NO orders. Your Pado account is used for both spot and prediction trades.',
  },
  {
    target: '[data-tour="prediction-positions"]',
    title: 'Your Positions',
    description: 'Open positions show your estimated payout if the market resolves in your favor.',
    noTargetDescription: 'After your first trade, your open positions and estimated payouts appear here.',
  },
  {
    target: '[data-tour="portfolio-link"]',
    title: 'Portfolio',
    description: 'View all your prediction positions and Pado Capital (Spot + Prediction balance) in one place.',
    noTargetDescription: 'Check your portfolio anytime to see all positions and your total P&L.',
  },
];

export function usePredictionOnboardingTour(): OnboardingTourState {
  return useOnboardingTour(PREDICTION_TOUR_STORAGE_KEY, PREDICTION_TOUR_STEPS);
}

export function isPredictionTourCompleted(): boolean {
  return isAnyTourCompleted(PREDICTION_TOUR_STORAGE_KEY);
}
