import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Tokens from './Tokens';
import { renderWithProviders } from '../test/test-utils';

// Mock sui-client to resolve quickly with null (fallback to KNOWN_TOKENS)
vi.mock('../lib/sui-client', () => ({
  getCoinMetadata: vi.fn().mockResolvedValue(null),
  getCoinTotalSupply: vi.fn().mockResolvedValue(null),
}));

describe('Tokens page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render page title', () => {
    renderWithProviders(<Tokens />);
    expect(screen.getByText('Tokens')).toBeInTheDocument();
  });

  it('should render back to home link', () => {
    renderWithProviders(<Tokens />);
    const link = screen.getByText(/Back to Home/);
    expect(link.closest('a')).toHaveAttribute('href', '/');
  });

  it('should show loading state initially', () => {
    renderWithProviders(<Tokens />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render table headers after loading', async () => {
    renderWithProviders(<Tokens />);
    await waitFor(() => {
      expect(screen.getByText('Symbol')).toBeInTheDocument();
    });
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Decimals')).toBeInTheDocument();
    expect(screen.getByText('Total Supply')).toBeInTheDocument();
  });

  it('should render all 5 known tokens after loading', async () => {
    renderWithProviders(<Tokens />);
    await waitFor(() => {
      expect(screen.getByText('NSN')).toBeInTheDocument();
    });
    expect(screen.getByText('NBTC')).toBeInTheDocument();
    expect(screen.getByText('NUSDC')).toBeInTheDocument();
    expect(screen.getByText('NETH')).toBeInTheDocument();
    expect(screen.getByText('NSOL')).toBeInTheDocument();
  });

  it('should render token names after loading', async () => {
    renderWithProviders(<Tokens />);
    await waitFor(() => {
      expect(screen.getByText('Nasun')).toBeInTheDocument();
    });
    expect(screen.getByText('Nasun Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('Nasun USD Coin')).toBeInTheDocument();
    expect(screen.getByText('Nasun Ethereum')).toBeInTheDocument();
    expect(screen.getByText('Nasun Solana')).toBeInTheDocument();
  });

  it('should render correct decimals for each token', async () => {
    renderWithProviders(<Tokens />);
    await waitFor(() => {
      expect(screen.getByText('NSN')).toBeInTheDocument();
    });
    const cells = screen.getAllByRole('cell');
    const decimalValues = cells
      .map((c) => c.textContent)
      .filter((t) => t && /^[0-9]$/.test(t));
    expect(decimalValues).toContain('9');
    expect(decimalValues).toContain('8');
    expect(decimalValues).toContain('6');
  });

  it('should show dash for null total supply', async () => {
    renderWithProviders(<Tokens />);
    await waitFor(() => {
      expect(screen.getByText('NSN')).toBeInTheDocument();
    });
    // When getCoinTotalSupply returns null, totalSupply is null → display "-"
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });

  it('should truncate long coin type in Type column', async () => {
    renderWithProviders(<Tokens />);
    await waitFor(() => {
      expect(screen.getByText('NSN')).toBeInTheDocument();
    });
    // NBTC and NUSDC share the same package prefix 0x96adf...
    const typeElements = screen.getAllByTitle(/0x96adf/);
    expect(typeElements.length).toBe(2); // NBTC and NUSDC
    typeElements.forEach((el) => {
      // Should be truncated (contains "..." from the truncateType fn)
      expect(el.textContent).toContain('...');
      // Full package ID (66 chars) should not appear
      expect(el.textContent!.length).toBeLessThan(66);
    });
  });

  it('should render 5 table rows (one per token)', async () => {
    renderWithProviders(<Tokens />);
    await waitFor(() => {
      expect(screen.getByText('NSN')).toBeInTheDocument();
    });
    const rows = screen.getAllByRole('row');
    // 1 header row + 5 data rows
    expect(rows).toHaveLength(6);
  });
});
