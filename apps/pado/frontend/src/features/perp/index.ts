/**
 * Perpetual Futures DEX Feature Module
 * @module features/perp
 */

// Types
export * from './types';

// Constants
export * from './constants';

// Transaction builders
export * from './transactions';

// Lib
export * from './lib/perp-client';

// Hooks
export * from './hooks';

// Context
export { PerpMarketProvider, usePerpMarketContext } from './context/PerpMarketContext';

// Components
export * from './components';

// Containers
export { PerpTradingPanel } from './containers/PerpTradingPanel';
