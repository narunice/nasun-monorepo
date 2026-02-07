/**
 * useKeyboardShortcuts
 * Global keyboard shortcuts for trading (Pro mode only).
 *
 * B - Buy side
 * S - Sell side
 * L - Limit order mode
 * M - Market order mode
 * Escape - Close confirm modal
 */

import { useEffect } from 'react';
import { useOrderForm } from '../context';

export function useKeyboardShortcuts(enabled: boolean) {
  const { setSide, setOrderMode, closeConfirmModal, isConfirmModalOpen } = useOrderForm();

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      // Skip if modifier keys are held (allow Ctrl+S, Ctrl+B, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
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
        case 'Escape':
          if (isConfirmModalOpen) {
            e.preventDefault();
            closeConfirmModal();
          }
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, setSide, setOrderMode, closeConfirmModal, isConfirmModalOpen]);
}
