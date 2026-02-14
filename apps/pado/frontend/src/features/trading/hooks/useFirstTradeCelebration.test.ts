import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFirstTradeCelebration, FIRST_TRADE_STORAGE_KEY } from './useFirstTradeCelebration';
import { ORDER_FILL_EVENT } from './useOrderFillNotifier';

function dispatchOrderFill() {
  document.dispatchEvent(new CustomEvent(ORDER_FILL_EVENT, {
    detail: { price: 100, quantity: 1, side: 'buy', timestamp: Date.now() },
  }));
}

describe('useFirstTradeCelebration', () => {
  it('initially does not show celebration', () => {
    const { result } = renderHook(() => useFirstTradeCelebration());
    expect(result.current.showCelebration).toBe(false);
  });

  it('shows celebration on first order fill event', () => {
    const { result } = renderHook(() => useFirstTradeCelebration());

    act(() => dispatchOrderFill());

    expect(result.current.showCelebration).toBe(true);
  });

  it('sets localStorage key after first fill', () => {
    renderHook(() => useFirstTradeCelebration());

    act(() => dispatchOrderFill());

    expect(localStorage.getItem(FIRST_TRADE_STORAGE_KEY)).toBeTruthy();
  });

  it('does not show celebration if already celebrated (localStorage set)', () => {
    localStorage.setItem(FIRST_TRADE_STORAGE_KEY, String(Date.now()));

    const { result } = renderHook(() => useFirstTradeCelebration());

    act(() => dispatchOrderFill());

    expect(result.current.showCelebration).toBe(false);
  });

  it('dismiss sets showCelebration to false', () => {
    const { result } = renderHook(() => useFirstTradeCelebration());

    act(() => dispatchOrderFill());
    expect(result.current.showCelebration).toBe(true);

    act(() => result.current.dismiss());
    expect(result.current.showCelebration).toBe(false);
  });

  it('only triggers celebration once for multiple rapid fill events', () => {
    const { result } = renderHook(() => useFirstTradeCelebration());

    act(() => {
      dispatchOrderFill();
      dispatchOrderFill();
      dispatchOrderFill();
    });

    expect(result.current.showCelebration).toBe(true);
    // localStorage should still have the key
    expect(localStorage.getItem(FIRST_TRADE_STORAGE_KEY)).toBeTruthy();
  });

  it('does not re-show after dismiss + new event', () => {
    const { result } = renderHook(() => useFirstTradeCelebration());

    act(() => dispatchOrderFill());
    act(() => result.current.dismiss());
    expect(result.current.showCelebration).toBe(false);

    // Fire another event — should NOT re-trigger because localStorage is set
    act(() => dispatchOrderFill());
    expect(result.current.showCelebration).toBe(false);
  });

  it('cleans up event listener on unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useFirstTradeCelebration());

    unmount();

    expect(spy).toHaveBeenCalledWith(ORDER_FILL_EVENT, expect.any(Function));
    spy.mockRestore();
  });

  it('does not register event listener when localStorage already set', () => {
    localStorage.setItem(FIRST_TRADE_STORAGE_KEY, String(Date.now()));
    const spy = vi.spyOn(document, 'addEventListener');

    renderHook(() => useFirstTradeCelebration());

    const fillListenerCalls = spy.mock.calls.filter(
      ([event]) => event === ORDER_FILL_EVENT,
    );
    expect(fillListenerCalls).toHaveLength(0);
    spy.mockRestore();
  });

  it('handles concurrent tab scenario (localStorage set between mount and event)', () => {
    const { result } = renderHook(() => useFirstTradeCelebration());

    // Simulate another tab setting the key before our event fires
    localStorage.setItem(FIRST_TRADE_STORAGE_KEY, String(Date.now()));

    act(() => dispatchOrderFill());

    // Double-check in handler prevents showing
    expect(result.current.showCelebration).toBe(false);
  });

  it('dismiss is a stable callback (referential identity)', () => {
    const { result, rerender } = renderHook(() => useFirstTradeCelebration());
    const dismiss1 = result.current.dismiss;
    rerender();
    const dismiss2 = result.current.dismiss;
    expect(dismiss1).toBe(dismiss2);
  });
});
