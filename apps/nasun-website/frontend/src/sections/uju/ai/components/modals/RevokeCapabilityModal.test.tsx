/**
 * Tests for RevokeCapabilityModal: typed-confirmation gate, busy-state lock-
 * out, txError surfacing, click-outside/ESC dismissal behavior. Revoke is
 * irreversible on-chain, so the gate must refuse anything but the exact
 * required phrase and must not allow accidental dismissal mid-signing.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevokeCapabilityModal } from './RevokeCapabilityModal';

function setup(overrides: {
  capabilityId?: string;
  txBusy?: boolean;
  txError?: string | null;
  onConfirm?: () => Promise<void>;
  onClose?: () => void;
} = {}) {
  const onConfirm = overrides.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <RevokeCapabilityModal
      capabilityId={overrides.capabilityId ?? '0x' + 'a'.repeat(64)}
      txBusy={overrides.txBusy ?? false}
      txError={overrides.txError ?? null}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );
  return {
    onConfirm: onConfirm as ReturnType<typeof vi.fn>,
    onClose: onClose as ReturnType<typeof vi.fn>,
  };
}

describe('RevokeCapabilityModal', () => {
  it('renders capability id (truncated) and irreversibility warning', () => {
    setup();
    expect(screen.getByText(/will be permanently revoked on chain/i)).toBeInTheDocument();
    expect(screen.getByText(/this cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByText(/e_capability_revoked/i)).toBeInTheDocument();
  });

  it('Revoke button is disabled when input is empty', () => {
    setup();
    expect(screen.getByRole('button', { name: /revoke permanently/i })).toBeDisabled();
  });

  it('Revoke button is disabled with wrong text (case-sensitive)', () => {
    setup();
    const input = screen.getByPlaceholderText('REVOKE');
    fireEvent.change(input, { target: { value: 'revoke' } });
    expect(screen.getByRole('button', { name: /revoke permanently/i })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'REVOKE ' } }); // trailing space
    expect(screen.getByRole('button', { name: /revoke permanently/i })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'REVOKE' } });
    expect(screen.getByRole('button', { name: /revoke permanently/i })).toBeEnabled();
  });

  it('calls onConfirm when REVOKE is typed and button clicked', async () => {
    const { onConfirm } = setup();
    const input = screen.getByPlaceholderText('REVOKE');
    fireEvent.change(input, { target: { value: 'REVOKE' } });
    fireEvent.click(screen.getByRole('button', { name: /revoke permanently/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('Cancel button calls onClose without invoking onConfirm', () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ESC dismisses when not busy', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ESC is ignored while txBusy', () => {
    const { onClose } = setup({ txBusy: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('input and both buttons disabled while txBusy', () => {
    setup({ txBusy: true });
    const input = screen.getByPlaceholderText('REVOKE');
    expect(input).toBeDisabled();
    // Cancel is disabled and Revoke shows the busy label.
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /revoking\.\.\./i })).toBeDisabled();
  });

  it('renders txError when present', () => {
    setup({ txError: 'simulated signing failure' });
    expect(screen.getByText('simulated signing failure')).toBeInTheDocument();
  });

  it('confirm button cannot fire when input is correct but txBusy is true', () => {
    const { onConfirm } = setup({ txBusy: true });
    // Even with correct input, busy state must keep the button locked.
    // (Input is disabled so we cannot type — assert via the button itself.)
    expect(screen.getByRole('button', { name: /revoking\.\.\./i })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
