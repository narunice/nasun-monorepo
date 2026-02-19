/**
 * Tests for Security Settings visibility in AccountTabContent.
 *
 * Covers Fix 3: Security Settings should be visible for passkey variant
 * (same as self-custody), but NOT for zkLogin variant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from './setup';
import { AccountTabContent } from '../connect/wallet-views/AccountTabContent';

// Mock uiSettingsStore to control isAdvancedMode
vi.mock('../stores/uiSettingsStore', () => ({
  useUISettingsStore: vi.fn(() => ({
    isAdvancedMode: false,
  })),
  useGettingStarted: vi.fn(() => ({
    showChecklist: false,
    completedItems: { backup: true, fund: true, swap: true },
    markCompleted: vi.fn(),
    hideChecklist: vi.fn(),
    isFirstTime: false,
  })),
}));

describe('AccountTabContent - Security Settings visibility', () => {
  const baseProps = {
    nsaIsInitialized: false,
    nsaRecoveryCompleted: 0,
    onNavigate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show Security Settings for self-custody variant', () => {
    render(<AccountTabContent {...baseProps} variant="self-custody" />);
    expect(screen.getByText('Security Settings')).toBeInTheDocument();
  });

  it('should show Security Settings for passkey variant', () => {
    render(<AccountTabContent {...baseProps} variant="passkey" />);
    expect(screen.getByText('Security Settings')).toBeInTheDocument();
  });

  it('should NOT show Security Settings for zkLogin variant', () => {
    render(<AccountTabContent {...baseProps} variant="zkLogin" />);
    expect(screen.queryByText('Security Settings')).not.toBeInTheDocument();
  });

  it('should call onNavigate("settings") when Security Settings is clicked (passkey)', () => {
    const onNavigate = vi.fn();
    render(<AccountTabContent {...baseProps} variant="passkey" onNavigate={onNavigate} />);

    screen.getByText('Security Settings').click();
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  it('should show Backup & Recovery for both self-custody and passkey', () => {
    const { unmount: u1 } = render(<AccountTabContent {...baseProps} variant="self-custody" />);
    expect(screen.getByText('Backup & Recovery')).toBeInTheDocument();
    u1();

    render(<AccountTabContent {...baseProps} variant="passkey" />);
    expect(screen.getByText('Backup & Recovery')).toBeInTheDocument();
  });

  it('should NOT show Backup & Recovery for zkLogin', () => {
    render(<AccountTabContent {...baseProps} variant="zkLogin" />);
    expect(screen.queryByText('Backup & Recovery')).not.toBeInTheDocument();
  });

  it('should show Export Private Key for both self-custody and passkey', () => {
    const { unmount: u1 } = render(<AccountTabContent {...baseProps} variant="self-custody" />);
    expect(screen.getByText('Export Private Key')).toBeInTheDocument();
    u1();

    render(<AccountTabContent {...baseProps} variant="passkey" />);
    expect(screen.getByText('Export Private Key')).toBeInTheDocument();
  });
});
