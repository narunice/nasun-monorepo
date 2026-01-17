/**
 * Ledger Component Tests
 *
 * Tests for LedgerConnect, LedgerSigningPrompt, LedgerErrorDisplay, etc.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from './setup';
import {
  LedgerConnect,
  LedgerSigningPrompt,
  LedgerErrorDisplay,
  LedgerAddressSelector,
  LedgerBrowserWarning,
} from '../ledger';
import type { LedgerAddress } from '../ledger';

// ============================================
// LedgerConnect Tests
// ============================================

describe('LedgerConnect', () => {
  it('renders "Add Hardware Key" when disconnected', () => {
    render(
      <LedgerConnect
        status="disconnected"
        onConnect={vi.fn()}
      />
    );
    expect(screen.getByText('Add Hardware Key')).toBeInTheDocument();
    expect(screen.getByText('🔑')).toBeInTheDocument();
  });

  it('renders "Connecting..." when connecting', () => {
    render(
      <LedgerConnect
        status="connecting"
        onConnect={vi.fn()}
      />
    );
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('renders "Hardware Secured" when connected', () => {
    render(
      <LedgerConnect
        status="connected"
        onConnect={vi.fn()}
      />
    );
    expect(screen.getByText('Hardware Secured')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders "Open Wallet App" when app required', () => {
    render(
      <LedgerConnect
        status="app-required"
        onConnect={vi.fn()}
      />
    );
    expect(screen.getByText('Open Wallet App')).toBeInTheDocument();
  });

  it('renders "Connection Issue" on error', () => {
    render(
      <LedgerConnect
        status="error"
        onConnect={vi.fn()}
      />
    );
    expect(screen.getByText('Connection Issue')).toBeInTheDocument();
  });

  it('calls onConnect when clicked', () => {
    const onConnect = vi.fn();
    render(
      <LedgerConnect
        status="disconnected"
        onConnect={onConnect}
      />
    );

    fireEvent.click(screen.getByText('Add Hardware Key'));
    expect(onConnect).toHaveBeenCalled();
  });

  it('shows connected address when provided', () => {
    render(
      <LedgerConnect
        status="connected"
        onConnect={vi.fn()}
        connectedAddress="0x1234567890abcdef1234567890abcdef12345678"
      />
    );
    expect(screen.getByText(/0x1234\.\.\.5678/)).toBeInTheDocument();
  });

  it('shows dropdown when variant is dropdown and connected', () => {
    render(
      <LedgerConnect
        status="connected"
        variant="dropdown"
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        connectedAddress="0x1234567890abcdef"
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
  });

  it('calls onDisconnect when Disconnect is clicked', () => {
    const onDisconnect = vi.fn();
    render(
      <LedgerConnect
        status="connected"
        variant="dropdown"
        onConnect={vi.fn()}
        onDisconnect={onDisconnect}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Disconnect'));
    expect(onDisconnect).toHaveBeenCalled();
  });
});

// ============================================
// LedgerSigningPrompt Tests
// ============================================

describe('LedgerSigningPrompt', () => {
  it('renders when isOpen is true', () => {
    render(
      <LedgerSigningPrompt
        isOpen={true}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Check your Ledger')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <LedgerSigningPrompt
        isOpen={false}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText('Check your Ledger')).not.toBeInTheDocument();
  });

  it('shows custom message when provided', () => {
    render(
      <LedgerSigningPrompt
        isOpen={true}
        message="Custom signing message"
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Custom signing message')).toBeInTheDocument();
  });

  it('shows Cancel button when cancellable', () => {
    render(
      <LedgerSigningPrompt
        isOpen={true}
        cancellable={true}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <LedgerSigningPrompt
        isOpen={true}
        cancellable={true}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows appropriate message for message signing', () => {
    render(
      <LedgerSigningPrompt
        isOpen={true}
        signingType="message"
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Sign message')).toBeInTheDocument();
  });

  it('shows appropriate message for address verification', () => {
    render(
      <LedgerSigningPrompt
        isOpen={true}
        signingType="address"
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Verify address')).toBeInTheDocument();
  });
});

// ============================================
// LedgerErrorDisplay Tests
// ============================================

describe('LedgerErrorDisplay', () => {
  it('renders user-friendly error for USER_REJECTED', () => {
    render(<LedgerErrorDisplay code="USER_REJECTED" />);
    expect(screen.getByText('Transaction cancelled')).toBeInTheDocument();
    expect(screen.getByText('You can try again anytime.')).toBeInTheDocument();
  });

  it('renders user-friendly error for DEVICE_LOCKED', () => {
    render(<LedgerErrorDisplay code="DEVICE_LOCKED" />);
    expect(screen.getByText('Device is locked')).toBeInTheDocument();
    expect(screen.getByText(/Enter your PIN/)).toBeInTheDocument();
  });

  it('renders user-friendly error for APP_NOT_OPEN', () => {
    render(<LedgerErrorDisplay code="APP_NOT_OPEN" />);
    expect(screen.getByText('Wallet app not open')).toBeInTheDocument();
    expect(screen.getByText(/Open the Sui\/Nasun app/)).toBeInTheDocument();
  });

  it('renders user-friendly error for BROWSER_NOT_SUPPORTED', () => {
    render(<LedgerErrorDisplay code="BROWSER_NOT_SUPPORTED" />);
    expect(screen.getByText('Browser not compatible')).toBeInTheDocument();
    expect(screen.getByText(/Use Chrome/)).toBeInTheDocument();
  });

  it('calls onRetry when Try Again is clicked', () => {
    const onRetry = vi.fn();
    render(<LedgerErrorDisplay code="DEVICE_DISCONNECTED" onRetry={onRetry} />);

    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows device illustration for relevant errors', () => {
    render(<LedgerErrorDisplay code="DEVICE_LOCKED" showDevice={true} />);
    // Device illustration should be visible
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows technical details when expanded', () => {
    render(
      <LedgerErrorDisplay
        code="TRANSPORT_ERROR"
        rawMessage="USB connection failed"
      />
    );

    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText(/TRANSPORT_ERROR: USB connection failed/)).toBeInTheDocument();
  });

  it('renders toast variant correctly', () => {
    const onDismiss = vi.fn();
    render(
      <LedgerErrorDisplay
        code="USER_REJECTED"
        variant="toast"
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalled();
  });
});

// ============================================
// LedgerAddressSelector Tests
// ============================================

describe('LedgerAddressSelector', () => {
  const mockAddresses: LedgerAddress[] = [
    { index: 0, address: '0x1111111111111111111111111111111111111111', balance: '100 NSN' },
    { index: 1, address: '0x2222222222222222222222222222222222222222', balance: '50 NSN', isUsed: true },
    { index: 2, address: '0x3333333333333333333333333333333333333333', balance: '0 NSN' },
  ];

  it('renders address list', () => {
    render(
      <LedgerAddressSelector
        selectedIndex={0}
        onSelect={vi.fn()}
        addresses={mockAddresses}
        chainType="move"
      />
    );
    expect(screen.getByText('Select Address')).toBeInTheDocument();
    expect(screen.getByText('100 NSN')).toBeInTheDocument();
  });

  it('shows derivation paths', () => {
    render(
      <LedgerAddressSelector
        selectedIndex={0}
        onSelect={vi.fn()}
        addresses={mockAddresses}
        chainType="move"
      />
    );
    expect(screen.getByText("m/44'/784'/0'/0'/0'")).toBeInTheDocument();
  });

  it('highlights selected address', () => {
    render(
      <LedgerAddressSelector
        selectedIndex={1}
        onSelect={vi.fn()}
        addresses={mockAddresses}
        chainType="move"
      />
    );
    // Find the row with 50 NSN (index 1) which should be highlighted
    const selectedRow = screen.getByText('50 NSN').closest('button');
    expect(selectedRow).toHaveClass('bg-blue-50');
  });

  it('calls onSelect when address is clicked', () => {
    const onSelect = vi.fn();
    render(
      <LedgerAddressSelector
        selectedIndex={0}
        onSelect={onSelect}
        addresses={mockAddresses}
        chainType="move"
      />
    );

    fireEvent.click(screen.getByText('50 NSN'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('shows "Used" badge for used addresses', () => {
    render(
      <LedgerAddressSelector
        selectedIndex={0}
        onSelect={vi.fn()}
        addresses={mockAddresses}
        chainType="move"
      />
    );
    expect(screen.getByText('Used')).toBeInTheDocument();
  });

  it('shows "Load more addresses" button when hasMore is true', () => {
    render(
      <LedgerAddressSelector
        selectedIndex={0}
        onSelect={vi.fn()}
        addresses={mockAddresses}
        chainType="move"
        hasMore={true}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByText('Load more addresses')).toBeInTheDocument();
  });

  it('calls onLoadMore when button is clicked', () => {
    const onLoadMore = vi.fn();
    render(
      <LedgerAddressSelector
        selectedIndex={0}
        onSelect={vi.fn()}
        addresses={mockAddresses}
        chainType="move"
        hasMore={true}
        onLoadMore={onLoadMore}
      />
    );

    fireEvent.click(screen.getByText('Load more addresses'));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('shows loading state', () => {
    render(
      <LedgerAddressSelector
        selectedIndex={0}
        onSelect={vi.fn()}
        addresses={[]}
        chainType="move"
        isLoading={true}
      />
    );
    expect(screen.getByText('Loading addresses from your Ledger...')).toBeInTheDocument();
  });

  it('uses EVM derivation path for EVM chain', () => {
    render(
      <LedgerAddressSelector
        selectedIndex={0}
        onSelect={vi.fn()}
        addresses={mockAddresses}
        chainType="evm"
      />
    );
    expect(screen.getByText("44'/60'/0'/0/0")).toBeInTheDocument();
    expect(screen.getByText('Ethereum addresses')).toBeInTheDocument();
  });
});

// ============================================
// LedgerBrowserWarning Tests
// ============================================

describe('LedgerBrowserWarning', () => {
  it('renders nothing when WebHID is supported', () => {
    // Mock navigator.hid to indicate WebHID support
    Object.defineProperty(navigator, 'hid', {
      value: {},
      writable: true,
      configurable: true,
    });

    const { container } = render(<LedgerBrowserWarning />);
    expect(container.firstChild).toBeNull();
  });

  it('renders warning when WebHID is not supported', () => {
    // Remove navigator.hid to simulate no support
    const originalHid = (navigator as { hid?: unknown }).hid;
    delete (navigator as { hid?: unknown }).hid;

    render(<LedgerBrowserWarning />);
    expect(screen.getByText('Browser not compatible')).toBeInTheDocument();

    // Restore
    if (originalHid !== undefined) {
      Object.defineProperty(navigator, 'hid', {
        value: originalHid,
        writable: true,
        configurable: true,
      });
    }
  });
});
