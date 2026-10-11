/**
 * Tests for TosAcknowledgementModal: 3-checkbox gate, localStorage persistence,
 * Cancel paths (click-outside / ESC / explicit button), and refusal to mark
 * accepted until every checkbox is ticked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  TosAcknowledgementModal,
  TOS_LOCALSTORAGE_KEY,
  ACK_ITEMS,
  hasAcceptedTos,
} from './TosAcknowledgementModal';

function setup(overrides: { onAccept?: () => void; onCancel?: () => void } = {}) {
  const onAccept = overrides.onAccept ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  render(<TosAcknowledgementModal onAccept={onAccept} onCancel={onCancel} />);
  return { onAccept: onAccept as ReturnType<typeof vi.fn>, onCancel: onCancel as ReturnType<typeof vi.fn> };
}

describe('TosAcknowledgementModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders every required acknowledgement with its own checkbox', () => {
    setup();
    // Asserted against the component's own ACK_ITEMS rather than restated
    // prose: the earlier version quoted copy that has since been rewritten,
    // so it failed for weeks without anything being broken.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(ACK_ITEMS.length);
    expect(ACK_ITEMS.length).toBe(3);
    for (const item of ACK_ITEMS) {
      expect(screen.getByText(item.text)).toBeInTheDocument();
    }
  });

  it('Confirm button is disabled until all three boxes are ticked', () => {
    setup();
    const confirm = screen.getByRole('button', { name: /confirm and continue/i });
    const checkboxes = screen.getAllByRole('checkbox');

    expect(confirm).toBeDisabled();

    fireEvent.click(checkboxes[0]);
    expect(confirm).toBeDisabled();

    fireEvent.click(checkboxes[1]);
    expect(confirm).toBeDisabled();

    fireEvent.click(checkboxes[2]);
    expect(confirm).toBeEnabled();
  });

  it('unticking any box re-disables Confirm', () => {
    setup();
    const confirm = screen.getByRole('button', { name: /confirm and continue/i });
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((box) => fireEvent.click(box));
    expect(confirm).toBeEnabled();
    fireEvent.click(checkboxes[1]); // untick middle
    expect(confirm).toBeDisabled();
  });

  it('clicking Confirm calls onAccept and persists localStorage', () => {
    const { onAccept } = setup();
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((box) => fireEvent.click(box));

    expect(window.localStorage.getItem(TOS_LOCALSTORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /confirm and continue/i }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(TOS_LOCALSTORAGE_KEY)).toBe('1');
  });

  it('Cancel button calls onCancel without persisting', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(TOS_LOCALSTORAGE_KEY)).toBeNull();
  });

  it('ESC key calls onCancel', () => {
    const { onCancel } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not persist acceptance when only partially ticked', () => {
    const { onAccept } = setup();
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    // Confirm button is disabled, but manually clicking it should be a no-op
    const confirm = screen.getByRole('button', { name: /confirm and continue/i });
    fireEvent.click(confirm);
    expect(onAccept).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(TOS_LOCALSTORAGE_KEY)).toBeNull();
  });
});

describe('hasAcceptedTos helper', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns false when key is absent', () => {
    expect(hasAcceptedTos()).toBe(false);
  });

  it('returns true when key is exactly "1"', () => {
    window.localStorage.setItem(TOS_LOCALSTORAGE_KEY, '1');
    expect(hasAcceptedTos()).toBe(true);
  });

  it('returns false for any other value (forward-compat for key bumps)', () => {
    window.localStorage.setItem(TOS_LOCALSTORAGE_KEY, '0');
    expect(hasAcceptedTos()).toBe(false);
    window.localStorage.setItem(TOS_LOCALSTORAGE_KEY, 'true');
    expect(hasAcceptedTos()).toBe(false);
  });
});
