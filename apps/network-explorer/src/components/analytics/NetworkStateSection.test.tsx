import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkStateSection } from './NetworkStateSection';
import { renderWithProviders } from '../../test/test-utils';
import type { NetworkState } from '../../lib/sui-client';

const mockNetworkState: NetworkState = {
  epoch: '42',
  epochDurationMs: '86400000', // 24h
  epochStartTimestampMs: String(Date.now() - 43200000), // 12h ago
  totalStake: '10000000000000000', // 10M NSN
  referenceGasPrice: '1000',
  activeValidatorsCount: 2,
  stakeSubsidyBalance: '5000000000000000', // 5M NSN
  stakeSubsidyCurrentDistributionAmount: '100000000000', // 100 NSN
  stakeSubsidyStartEpoch: '0',
  storageFundTotalObjectStorageRebates: '1000000000000', // 1000 NSN
  storageFundNonRefundableBalance: '500000000000', // 500 NSN
  safeMode: false,
};

vi.mock('../../lib/sui-client', () => ({
  getNetworkState: vi.fn(),
}));

import { getNetworkState } from '../../lib/sui-client';

describe('NetworkStateSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading skeleton initially', () => {
    vi.mocked(getNetworkState).mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = renderWithProviders(<NetworkStateSection />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(8);
  });

  it('should show error state when data fetch fails', async () => {
    vi.mocked(getNetworkState).mockResolvedValue(null);
    renderWithProviders(<NetworkStateSection />);
    await waitFor(() => {
      expect(screen.getByText('Unable to fetch network state.')).toBeInTheDocument();
    });
  });

  it('should display epoch number with link', async () => {
    vi.mocked(getNetworkState).mockResolvedValue(mockNetworkState);
    renderWithProviders(<NetworkStateSection />);
    await waitFor(() => {
      const epochLink = screen.getByText('#42');
      expect(epochLink.closest('a')).toHaveAttribute('href', '/epoch/42');
    });
  });

  it('should display reference gas price', async () => {
    vi.mocked(getNetworkState).mockResolvedValue(mockNetworkState);
    renderWithProviders(<NetworkStateSection />);
    await waitFor(() => {
      expect(screen.getByText('1,000')).toBeInTheDocument();
      expect(screen.getByText('SOE')).toBeInTheDocument();
    });
  });

  it('should display active validators count with link', async () => {
    vi.mocked(getNetworkState).mockResolvedValue(mockNetworkState);
    renderWithProviders(<NetworkStateSection />);
    await waitFor(() => {
      const validatorsLink = screen.getByText('2');
      expect(validatorsLink.closest('a')).toHaveAttribute('href', '/validators');
    });
  });

  it('should show safe mode OFF badge when safeMode is false', async () => {
    vi.mocked(getNetworkState).mockResolvedValue(mockNetworkState);
    renderWithProviders(<NetworkStateSection />);
    await waitFor(() => {
      expect(screen.getByText('OFF')).toBeInTheDocument();
      expect(screen.getByText('Network operating normally')).toBeInTheDocument();
    });
  });

  it('should show safe mode ACTIVE badge when safeMode is true', async () => {
    vi.mocked(getNetworkState).mockResolvedValue({
      ...mockNetworkState,
      safeMode: true,
    });
    renderWithProviders(<NetworkStateSection />);
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
      expect(screen.getByText('Network is in recovery mode')).toBeInTheDocument();
    });
  });

  it('should display epoch duration in hours', async () => {
    vi.mocked(getNetworkState).mockResolvedValue(mockNetworkState);
    renderWithProviders(<NetworkStateSection />);
    await waitFor(() => {
      expect(screen.getByText('Duration: 24h')).toBeInTheDocument();
    });
  });

  it('should display subsidy start epoch', async () => {
    vi.mocked(getNetworkState).mockResolvedValue(mockNetworkState);
    renderWithProviders(<NetworkStateSection />);
    await waitFor(() => {
      expect(screen.getByText(/since epoch 0/)).toBeInTheDocument();
    });
  });

  it('should display section labels', async () => {
    vi.mocked(getNetworkState).mockResolvedValue(mockNetworkState);
    renderWithProviders(<NetworkStateSection />);
    await waitFor(() => {
      expect(screen.getByText('Current Epoch')).toBeInTheDocument();
      expect(screen.getByText('Total Stake')).toBeInTheDocument();
      expect(screen.getByText('Reference Gas Price')).toBeInTheDocument();
      expect(screen.getByText('Active Validators')).toBeInTheDocument();
      expect(screen.getByText('Stake Subsidy Balance')).toBeInTheDocument();
      expect(screen.getByText('Subsidy Distribution')).toBeInTheDocument();
      expect(screen.getByText('Storage Fund')).toBeInTheDocument();
      expect(screen.getByText('Safe Mode')).toBeInTheDocument();
    });
  });
});
