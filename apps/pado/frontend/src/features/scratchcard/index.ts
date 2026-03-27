// Hooks
export {
  useScratchCardPool,
  useScratchCardActions,
  useMyScratchCards,
  useScratchCardAdmin,
} from './hooks';

// Components
export {
  ScratchCardArea,
  ScratchCardCanvas,
  BuyCardButton,
  CardResultDisplay,
  PrizeTableDisplay,
  PoolStatusBar,
  MyScratchCardList,
  MyWinningCards,
  MyPurchaseHistory,
  ScratchCardAdminPanel,
} from './components';

// Types
export type {
  ScratchCardPool,
  ScratchCard,
  ScratchResult,
} from './types';
export {
  formatNusdc,
  getTierLabel,
  getTierColorClass,
} from './types';

// Constants
export {
  SCRATCHCARD_PACKAGE_ID,
  SCRATCHCARD_POOL_ID,
  CARD_PRICE,
  CARD_PRICE_DISPLAY,
  MAX_MULTIPLIER,
  PRIZE_TIERS,
  PER_ADDRESS_SOFT_LIMIT,
} from './constants';

// Transactions
export {
  buildBuyScratchCard,
  buildFundPool,
  buildWithdrawPool,
  buildEmergencyWithdrawAll,
  buildSetPaused,
} from './transactions';

// Lib
export {
  fetchScratchCardPool,
  fetchUserScratchCards,
  fetchPurchaseHistory,
  parseScratchCardEvent,
} from './lib/scratchcard-client';
