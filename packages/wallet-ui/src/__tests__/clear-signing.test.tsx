/**
 * Clear Signing Component Tests
 *
 * Tests for TransactionPreview, StatusBadge, ActionsList, etc.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from './setup';
import {
  StatusBadge,
  ActionsList,
  BalancePreview,
  SafetyChecklist,
  ErrorMessage,
  TransactionPreview,
} from '../clear-signing';
import type {
  TxAction,
  RiskFactor,
  SimulationResult,
  DecodedTx,
  TxSummary,
  RiskAssessment,
} from '@nasun/wallet';

// ============================================
// StatusBadge Tests
// ============================================

describe('StatusBadge', () => {
  it('renders "Verified" for low risk', () => {
    render(<StatusBadge level="low" />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders "Review Recommended" for medium risk', () => {
    render(<StatusBadge level="medium" />);
    expect(screen.getByText('Review Recommended')).toBeInTheDocument();
  });

  it('renders "Attention Needed" for high risk', () => {
    render(<StatusBadge level="high" />);
    expect(screen.getByText('Attention Needed')).toBeInTheDocument();
  });

  it('renders "Action Required" for critical risk', () => {
    render(<StatusBadge level="critical" />);
    expect(screen.getByText('Action Required')).toBeInTheDocument();
  });

  it('renders compact variant correctly', () => {
    render(<StatusBadge level="medium" variant="compact" />);
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows score when showScore is true', () => {
    render(<StatusBadge level="low" showScore score={85} />);
    expect(screen.getByText('(85)')).toBeInTheDocument();
  });
});

// ============================================
// ActionsList Tests
// ============================================

describe('ActionsList', () => {
  const mockActions: TxAction[] = [
    { type: 'send', label: 'Send USDC', value: '0x1234567890abcdef', icon: 'arrow-up' },
    { type: 'receive', label: 'Receive', value: '0xabcdef1234567890', icon: 'arrow-down' },
  ];

  it('renders actions list', () => {
    render(<ActionsList actions={mockActions} />);
    expect(screen.getByText('Send USDC')).toBeInTheDocument();
  });

  it('shows "No actions to display" when empty', () => {
    render(<ActionsList actions={[]} />);
    expect(screen.getByText('No actions to display')).toBeInTheDocument();
  });

  it('shows "Show more" button when actions exceed maxVisible', () => {
    const manyActions: TxAction[] = Array.from({ length: 10 }, (_, i) => ({
      type: 'send' as const,
      label: `Send ${i}`,
      value: `0x${i}`,
    }));
    render(<ActionsList actions={manyActions} maxVisible={3} />);
    expect(screen.getByText('Show 7 more actions')).toBeInTheDocument();
  });

  it('expands to show all actions when clicked', () => {
    const manyActions: TxAction[] = Array.from({ length: 6 }, (_, i) => ({
      type: 'send' as const,
      label: `Action ${i}`,
      value: `0x${i}`,
    }));
    render(<ActionsList actions={manyActions} maxVisible={3} />);

    fireEvent.click(screen.getByText('Show 3 more actions'));
    expect(screen.getByText('Show less')).toBeInTheDocument();
    expect(screen.getByText('Action 5')).toBeInTheDocument();
  });
});

// ============================================
// BalancePreview Tests
// ============================================

describe('BalancePreview', () => {
  const successSimulation: SimulationResult = {
    success: true,
    balanceChanges: [
      {
        token: '0x2::sui::SUI',
        symbol: 'NSN',
        decimals: 9,
        amount: -1000000000n,
        displayAmount: '-1',
      },
    ],
    nftChanges: [],
    approvalChanges: [],
    estimatedGas: 3000000n,
  };

  const failedSimulation: SimulationResult = {
    success: false,
    error: 'Simulation failed',
    balanceChanges: [],
    nftChanges: [],
    approvalChanges: [],
  };

  it('renders "What will happen" title', () => {
    render(<BalancePreview simulation={successSimulation} />);
    expect(screen.getByText('What will happen')).toBeInTheDocument();
  });

  it('shows balance changes', () => {
    render(<BalancePreview simulation={successSimulation} />);
    expect(screen.getByText('NSN')).toBeInTheDocument();
    // Amount includes prefix (-) and value separately, so use regex
    expect(screen.getByText(/-1/)).toBeInTheDocument();
  });

  it('shows "Preview unavailable" for failed simulation', () => {
    render(<BalancePreview simulation={failedSimulation} />);
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('shows gas estimate', () => {
    render(<BalancePreview simulation={successSimulation} />);
    expect(screen.getByText('Estimated fee')).toBeInTheDocument();
  });
});

// ============================================
// SafetyChecklist Tests
// ============================================

describe('SafetyChecklist', () => {
  const passedFactors: RiskFactor[] = [
    {
      level: 'low',
      category: 'contract',
      title: 'Verified contract',
      description: 'This contract has been verified',
    },
  ];

  const mixedFactors: RiskFactor[] = [
    {
      level: 'low',
      category: 'contract',
      title: 'Verified contract',
      description: 'This contract has been verified',
    },
    {
      level: 'high',
      category: 'value',
      title: 'Large transfer',
      description: 'This is a large amount',
      mitigation: 'Double-check the recipient address',
    },
  ];

  it('shows "All checks passed" when no factors', () => {
    render(<SafetyChecklist factors={[]} />);
    expect(screen.getByText('All checks passed')).toBeInTheDocument();
  });

  it('shows factor count', () => {
    render(<SafetyChecklist factors={passedFactors} />);
    expect(screen.getByText('1/1 passed')).toBeInTheDocument();
  });

  it('renders factor titles', () => {
    render(<SafetyChecklist factors={mixedFactors} />);
    expect(screen.getByText('Verified contract')).toBeInTheDocument();
    expect(screen.getByText('Large transfer')).toBeInTheDocument();
  });

  it('shows mitigation on click', () => {
    render(<SafetyChecklist factors={mixedFactors} showMitigations />);

    // Click the factor with mitigation
    const largeTransferButton = screen.getByText('Large transfer').closest('button');
    if (largeTransferButton) {
      fireEvent.click(largeTransferButton);
      expect(screen.getByText(/Double-check the recipient address/)).toBeInTheDocument();
    }
  });
});

// ============================================
// ErrorMessage Tests
// ============================================

describe('ErrorMessage', () => {
  it('renders friendly error title', () => {
    render(<ErrorMessage code="SIMULATION_FAILED" />);
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('shows solution suggestion', () => {
    render(<ErrorMessage code="DECODE_FAILED" />);
    // The component maps errors to friendly messages
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Try refreshing/)).toBeInTheDocument();
  });

  it('calls onRetry when Try Again is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorMessage code="SIMULATION_FAILED" onRetry={onRetry} />);

    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows technical details when expanded', () => {
    render(
      <ErrorMessage
        code="DECODE_FAILED"
        rawMessage="Failed to parse BCS"
        showDetails
      />
    );

    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText(/DECODE_FAILED: Failed to parse BCS/)).toBeInTheDocument();
  });
});

// ============================================
// TransactionPreview Tests
// ============================================

describe('TransactionPreview', () => {
  const mockDecoded: DecodedTx = {
    chainType: 'move',
    chainId: '6681cdfd',
    category: 'transfer',
    sender: '0x' + '1'.repeat(64),
    rawBytes: '0x',
    decodedAt: Date.now(),
    calls: [],
    gasBudget: 10000000n,
  };

  const mockSummary: TxSummary = {
    title: 'Send Tokens',
    description: 'Transfer 100 USDC to recipient',
    category: 'transfer',
    riskLevel: 'low',
    actions: [
      { type: 'send', label: 'Send 100 USDC', value: '0x' + 'a'.repeat(64) },
    ],
    gasCost: '0.003 NSN',
    isSponsored: false,
  };

  const mockRisk: RiskAssessment = {
    overallRisk: 'low',
    factors: [],
    score: 10,
    requiresExtraConfirmation: false,
  };

  it('renders transaction title', () => {
    render(
      <TransactionPreview
        decoded={mockDecoded}
        summary={mockSummary}
        risk={mockRisk}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('Send Tokens')).toBeInTheDocument();
  });

  it('renders primary action', () => {
    render(
      <TransactionPreview
        decoded={mockDecoded}
        summary={mockSummary}
        risk={mockRisk}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('Send 100 USDC')).toBeInTheDocument();
  });

  it('calls onApprove when Confirm is clicked', () => {
    const onApprove = vi.fn();
    render(
      <TransactionPreview
        decoded={mockDecoded}
        summary={mockSummary}
        risk={mockRisk}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Confirm'));
    expect(onApprove).toHaveBeenCalled();
  });

  it('calls onReject when Cancel is clicked', () => {
    const onReject = vi.fn();
    render(
      <TransactionPreview
        decoded={mockDecoded}
        summary={mockSummary}
        risk={mockRisk}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onReject).toHaveBeenCalled();
  });

  it('shows confirmation checkbox for critical risk', () => {
    const criticalRisk: RiskAssessment = {
      ...mockRisk,
      overallRisk: 'critical',
      requiresExtraConfirmation: true,
    };

    render(
      <TransactionPreview
        decoded={mockDecoded}
        summary={{ ...mockSummary, riskLevel: 'critical' }}
        risk={criticalRisk}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText('I understand the risks')).toBeInTheDocument();
  });

  it('disables Confirm until checkbox is checked for critical risk', () => {
    const criticalRisk: RiskAssessment = {
      ...mockRisk,
      overallRisk: 'critical',
      requiresExtraConfirmation: true,
    };

    render(
      <TransactionPreview
        decoded={mockDecoded}
        summary={{ ...mockSummary, riskLevel: 'critical' }}
        risk={criticalRisk}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    const confirmButton = screen.getByText('Confirm');
    expect(confirmButton).toBeDisabled();

    // Check the checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(confirmButton).not.toBeDisabled();
  });

  it('shows advanced details when toggled', () => {
    render(
      <TransactionPreview
        decoded={mockDecoded}
        summary={mockSummary}
        risk={mockRisk}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText('Hide details')).toBeInTheDocument();
    expect(screen.getByText('Technical Details')).toBeInTheDocument();
  });
});
