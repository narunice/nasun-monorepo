/**
 * useKeyboardShortcuts
 * Global keyboard shortcuts for trading (Pro mode only).
 *
 * Side:    B - Buy, S - Sell
 * Mode:    L - Limit, M - Market, C - sCale
 * Amount:  1-9 - 10%-90%, 0 - 100% of balance
 * Price:   +/= - tick up, - (minus) - tick down
 * Submit:  Enter - submit order / confirm modal
 * Nav:     [ - prev market, ] - next market
 *          T - toggle Book/Trades tab
 * Help:    ? - toggle shortcuts panel
 * Close:   Escape - close modal / panel
 *
 * Amount & price shortcuts dispatch DOM custom events
 * so OrderForm can react without prop threading.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useOrderForm } from '../context';
import { useMarket } from '../context';

// Custom event names for cross-component communication
export const SHORTCUT_PERCENT_EVENT = 'pado:shortcut:percent-amount';
export const SHORTCUT_PRICE_STEP_EVENT = 'pado:shortcut:price-step';
export const SHORTCUT_SUBMIT_EVENT = 'pado:shortcut:submit-order';
export const SHORTCUT_TOGGLE_BOOK_TAB_EVENT = 'pado:shortcut:toggle-book-tab';

export interface KeyboardShortcutOptions {
  onToggleShortcutsPanel?: () => void;
}

export function useKeyboardShortcuts(enabled: boolean, options?: KeyboardShortcutOptions) {
  const {
    setSide,
    setOrderMode,
    closeConfirmModal,
    isConfirmModalOpen,
    orderMode,
  } = useOrderForm();
  const { currentMarket, setMarket, markets } = useMarket();

  const switchMarket = useCallback((direction: 'prev' | 'next') => {
    const idx = markets.findIndex(m => m.key === currentMarket);
    if (idx === -1) return;
    const nextIdx = direction === 'next'
      ? (idx + 1) % markets.length
      : (idx - 1 + markets.length) % markets.length;
    setMarket(markets[nextIdx].key);
  }, [currentMarket, markets, setMarket]);

  // Ref-based debounce for Enter key to prevent rapid double-submission
  const lastSubmitTime = useRef(0);
  const SUBMIT_DEBOUNCE_MS = 300;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      // Skip if modifier keys are held (allow Ctrl+S, Ctrl+B, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        // --- Side selection ---
        case 'b':
        case 'B':
          e.preventDefault();
          setSide('buy');
          break;
        case 's':
        case 'S':
          e.preventDefault();
          setSide('sell');
          break;

        // --- Order mode ---
        case 'l':
        case 'L':
          e.preventDefault();
          setOrderMode('limit');
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setOrderMode('market');
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          setOrderMode('scale');
          break;

        // --- Percentage amount (1-9 = 10%-90%, 0 = 100%) ---
        case '1': case '2': case '3': case '4': case '5':
        case '6': case '7': case '8': case '9':
          e.preventDefault();
          document.dispatchEvent(new CustomEvent(SHORTCUT_PERCENT_EVENT, { detail: parseInt(e.key) * 10 }));
          break;
        case '0':
          e.preventDefault();
          document.dispatchEvent(new CustomEvent(SHORTCUT_PERCENT_EVENT, { detail: 100 }));
          break;

        // --- Price tick step (Limit mode only) ---
        case '+':
        case '=':
          if (orderMode === 'limit' || orderMode === 'scale') {
            e.preventDefault();
            document.dispatchEvent(new CustomEvent(SHORTCUT_PRICE_STEP_EVENT, { detail: 'up' }));
          }
          break;
        case '-':
          if (orderMode === 'limit' || orderMode === 'scale') {
            e.preventDefault();
            document.dispatchEvent(new CustomEvent(SHORTCUT_PRICE_STEP_EVENT, { detail: 'down' }));
          }
          break;

        // --- Submit order (debounced to prevent double-submission) ---
        case 'Enter': {
          const now = Date.now();
          if (now - lastSubmitTime.current < SUBMIT_DEBOUNCE_MS) break;
          lastSubmitTime.current = now;
          e.preventDefault();
          document.dispatchEvent(new CustomEvent(SHORTCUT_SUBMIT_EVENT));
          break;
        }

        // --- Market switching ---
        case '[':
          e.preventDefault();
          switchMarket('prev');
          break;
        case ']':
          e.preventDefault();
          switchMarket('next');
          break;

        // --- Toggle Book/Trades tab ---
        case 't':
        case 'T':
          e.preventDefault();
          document.dispatchEvent(new CustomEvent(SHORTCUT_TOGGLE_BOOK_TAB_EVENT));
          break;

        // --- Shortcuts panel ---
        case '?':
          e.preventDefault();
          options?.onToggleShortcutsPanel?.();
          break;

        // --- Close modal/panel ---
        case 'Escape':
          if (isConfirmModalOpen) {
            e.preventDefault();
            closeConfirmModal();
          } else {
            // Close shortcuts panel if open
            options?.onToggleShortcutsPanel?.();
          }
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    enabled,
    setSide,
    setOrderMode,
    closeConfirmModal,
    isConfirmModalOpen,
    orderMode,
    switchMarket,
    options,
  ]);
}
