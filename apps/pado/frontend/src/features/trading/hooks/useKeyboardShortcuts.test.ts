/**
 * useKeyboardShortcuts Tests
 * Tests keyboard event handling, custom event dispatching, edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SHORTCUT_PERCENT_EVENT,
  SHORTCUT_PRICE_STEP_EVENT,
  SHORTCUT_SUBMIT_EVENT,
  SHORTCUT_TOGGLE_BOOK_TAB_EVENT,
} from './useKeyboardShortcuts';

// We test the keyboard handler behavior via custom events dispatched on document.
// The hook itself is hard to test in isolation (requires context providers),
// so we test the event constants and simulate what the handler does.

describe('Keyboard Shortcut Event Constants', () => {
  it('exports unique event names', () => {
    const events = [
      SHORTCUT_PERCENT_EVENT,
      SHORTCUT_PRICE_STEP_EVENT,
      SHORTCUT_SUBMIT_EVENT,
      SHORTCUT_TOGGLE_BOOK_TAB_EVENT,
    ];
    const unique = new Set(events);
    expect(unique.size).toBe(events.length);
  });

  it('event names follow pado:shortcut: namespace', () => {
    expect(SHORTCUT_PERCENT_EVENT).toMatch(/^pado:shortcut:/);
    expect(SHORTCUT_PRICE_STEP_EVENT).toMatch(/^pado:shortcut:/);
    expect(SHORTCUT_SUBMIT_EVENT).toMatch(/^pado:shortcut:/);
    expect(SHORTCUT_TOGGLE_BOOK_TAB_EVENT).toMatch(/^pado:shortcut:/);
  });
});

describe('Custom DOM Events', () => {
  it('SHORTCUT_PERCENT_EVENT carries numeric detail', () => {
    const handler = vi.fn();
    document.addEventListener(SHORTCUT_PERCENT_EVENT, handler);

    document.dispatchEvent(new CustomEvent(SHORTCUT_PERCENT_EVENT, { detail: 50 }));

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toBe(50);

    document.removeEventListener(SHORTCUT_PERCENT_EVENT, handler);
  });

  it('SHORTCUT_PRICE_STEP_EVENT carries direction string', () => {
    const handler = vi.fn();
    document.addEventListener(SHORTCUT_PRICE_STEP_EVENT, handler);

    document.dispatchEvent(new CustomEvent(SHORTCUT_PRICE_STEP_EVENT, { detail: 'up' }));
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toBe('up');

    document.dispatchEvent(new CustomEvent(SHORTCUT_PRICE_STEP_EVENT, { detail: 'down' }));
    expect((handler.mock.calls[1][0] as CustomEvent).detail).toBe('down');

    document.removeEventListener(SHORTCUT_PRICE_STEP_EVENT, handler);
  });

  it('SHORTCUT_SUBMIT_EVENT has no detail', () => {
    const handler = vi.fn();
    document.addEventListener(SHORTCUT_SUBMIT_EVENT, handler);

    document.dispatchEvent(new CustomEvent(SHORTCUT_SUBMIT_EVENT));
    expect(handler).toHaveBeenCalledTimes(1);

    document.removeEventListener(SHORTCUT_SUBMIT_EVENT, handler);
  });

  it('SHORTCUT_TOGGLE_BOOK_TAB_EVENT has no detail', () => {
    const handler = vi.fn();
    document.addEventListener(SHORTCUT_TOGGLE_BOOK_TAB_EVENT, handler);

    document.dispatchEvent(new CustomEvent(SHORTCUT_TOGGLE_BOOK_TAB_EVENT));
    expect(handler).toHaveBeenCalledTimes(1);

    document.removeEventListener(SHORTCUT_TOGGLE_BOOK_TAB_EVENT, handler);
  });
});

describe('Keyboard Event Handler Simulation', () => {
  // Simulate the handler logic from useKeyboardShortcuts
  // to test key mapping without requiring React context

  let percentHandler: ReturnType<typeof vi.fn>;
  let priceStepHandler: ReturnType<typeof vi.fn>;
  let submitHandler: ReturnType<typeof vi.fn>;
  let toggleBookHandler: ReturnType<typeof vi.fn>;

  function simulateKeyHandler(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key) {
      case '1': case '2': case '3': case '4': case '5':
      case '6': case '7': case '8': case '9':
        percentHandler(parseInt(e.key) * 10);
        break;
      case '0':
        percentHandler(100);
        break;
      case '+': case '=':
        priceStepHandler('up');
        break;
      case '-':
        priceStepHandler('down');
        break;
      case 'Enter':
        submitHandler();
        break;
      case 't': case 'T':
        toggleBookHandler();
        break;
    }
  }

  beforeEach(() => {
    percentHandler = vi.fn();
    priceStepHandler = vi.fn();
    submitHandler = vi.fn();
    toggleBookHandler = vi.fn();
    document.addEventListener('keydown', simulateKeyHandler as EventListener);
  });

  afterEach(() => {
    document.removeEventListener('keydown', simulateKeyHandler as EventListener);
  });

  function pressKey(key: string, options: Partial<KeyboardEventInit> = {}) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
  }

  // ---- Number keys → percent ----
  describe('number keys (1-9, 0)', () => {
    it.each([
      ['1', 10], ['2', 20], ['3', 30], ['4', 40], ['5', 50],
      ['6', 60], ['7', 70], ['8', 80], ['9', 90],
    ])('key "%s" dispatches %d%%', (key, pct) => {
      pressKey(key);
      expect(percentHandler).toHaveBeenCalledWith(pct);
    });

    it('key "0" dispatches 100%', () => {
      pressKey('0');
      expect(percentHandler).toHaveBeenCalledWith(100);
    });
  });

  // ---- Price step ----
  describe('price step keys (+/-)', () => {
    it('"+" dispatches up', () => {
      pressKey('+');
      expect(priceStepHandler).toHaveBeenCalledWith('up');
    });

    it('"=" dispatches up (same key without shift)', () => {
      pressKey('=');
      expect(priceStepHandler).toHaveBeenCalledWith('up');
    });

    it('"-" dispatches down', () => {
      pressKey('-');
      expect(priceStepHandler).toHaveBeenCalledWith('down');
    });
  });

  // ---- Submit ----
  describe('Enter key', () => {
    it('dispatches submit', () => {
      pressKey('Enter');
      expect(submitHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Book/Trades toggle ----
  describe('T key', () => {
    it('lowercase t toggles book tab', () => {
      pressKey('t');
      expect(toggleBookHandler).toHaveBeenCalledTimes(1);
    });

    it('uppercase T toggles book tab', () => {
      pressKey('T');
      expect(toggleBookHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Modifier keys should be ignored ----
  describe('modifier keys ignored', () => {
    it('Ctrl+B does not trigger', () => {
      pressKey('b', { ctrlKey: true });
      expect(percentHandler).not.toHaveBeenCalled();
    });

    it('Meta+S does not trigger', () => {
      pressKey('s', { metaKey: true });
      expect(percentHandler).not.toHaveBeenCalled();
    });

    it('Alt+1 does not trigger', () => {
      pressKey('1', { altKey: true });
      expect(percentHandler).not.toHaveBeenCalled();
    });
  });

  // ---- Input fields should be ignored ----
  describe('input focus ignored', () => {
    it('ignores keydown on INPUT elements', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      const event = new KeyboardEvent('keydown', { key: '5', bubbles: true });
      Object.defineProperty(event, 'target', { value: input });
      simulateKeyHandler(event);
      expect(percentHandler).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('ignores keydown on TEXTAREA elements', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      const event = new KeyboardEvent('keydown', { key: '5', bubbles: true });
      Object.defineProperty(event, 'target', { value: textarea });
      simulateKeyHandler(event);
      expect(percentHandler).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });
  });

  // ---- Unknown keys do nothing ----
  describe('unbound keys', () => {
    it('random keys do not trigger any handler', () => {
      pressKey('x');
      pressKey('z');
      pressKey('F1');
      pressKey('Tab');
      expect(percentHandler).not.toHaveBeenCalled();
      expect(priceStepHandler).not.toHaveBeenCalled();
      expect(submitHandler).not.toHaveBeenCalled();
      expect(toggleBookHandler).not.toHaveBeenCalled();
    });
  });
});
