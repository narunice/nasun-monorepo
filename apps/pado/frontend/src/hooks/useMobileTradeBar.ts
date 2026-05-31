import { create } from 'zustand';

/**
 * Tracks whether the mobile prediction trade sticky bar (BUY YES / BUY NO) is
 * currently mounted. The floating chat FAB reads this to lift itself above the
 * bar on small screens instead of overlapping the trade buttons (bug report
 * 516b5034). A route check alone would be wrong: the bar only renders on an
 * OPEN market detail page, not for awaiting-resolution or resolved markets that
 * share the same /predict/:marketId route.
 */
interface MobileTradeBarState {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export const useMobileTradeBar = create<MobileTradeBarState>((set) => ({
  visible: false,
  setVisible: (visible) => set({ visible }),
}));
