import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TransactionBalanceChanges from './TransactionBalanceChanges';
import { renderWithRouter } from '../../test/test-utils';
import type { BalanceChange } from '@mysten/sui/client';

describe('TransactionBalanceChanges', () => {
  const makeChange = (
    owner: BalanceChange['owner'],
    coinType: string,
    amount: string,
  ): BalanceChange => ({
    owner,
    coinType,
    amount,
  });

  it('should render nothing when balanceChanges is null', () => {
    const { container } = renderWithRouter(
      <TransactionBalanceChanges balanceChanges={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when balanceChanges is undefined', () => {
    const { container } = renderWithRouter(
      <TransactionBalanceChanges balanceChanges={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when balanceChanges is empty', () => {
    const { container } = renderWithRouter(
      <TransactionBalanceChanges balanceChanges={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('should display section title with count', () => {
    const changes = [
      makeChange({ AddressOwner: '0xabc' }, '0x2::sui::SUI', '1000000000'),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    expect(screen.getByText('Balance Changes (1)')).toBeInTheDocument();
  });

  it('should display positive amount in green with plus sign', () => {
    const changes = [
      makeChange({ AddressOwner: '0xabc' }, '0x2::sui::SUI', '1000000000'),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    const amountEl = screen.getByText(/\+1 NSN/);
    expect(amountEl).toBeInTheDocument();
    expect(amountEl.className).toContain('text-green-400');
  });

  it('should display negative amount in destructive color with minus sign', () => {
    const changes = [
      makeChange({ AddressOwner: '0xabc' }, '0x2::sui::SUI', '-500000000'),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    const amountEl = screen.getByText(/-0.5 NSN/);
    expect(amountEl).toBeInTheDocument();
    expect(amountEl.className).toContain('text-destructive');
  });

  it('should convert SUI coin type to NSN symbol', () => {
    const changes = [
      makeChange({ AddressOwner: '0xabc' }, '0x2::sui::SUI', '1000000000'),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    expect(screen.getByText(/NSN/)).toBeInTheDocument();
  });

  it('should extract token symbol from coin type', () => {
    const changes = [
      makeChange(
        { AddressOwner: '0xabc' },
        '0xfdd1::nusdc::NUSDC',
        '1000000',
      ),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    expect(screen.getByText(/NUSDC/)).toBeInTheDocument();
  });

  it('should render address as link for AddressOwner', () => {
    const changes = [
      makeChange({ AddressOwner: '0xabc123' }, '0x2::sui::SUI', '100'),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/address/0xabc123');
  });

  it('should render address as link for ObjectOwner', () => {
    const changes = [
      makeChange({ ObjectOwner: '0xobj456' }, '0x2::sui::SUI', '100'),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/address/0xobj456');
  });

  it('should render non-address owner as text', () => {
    const changes = [
      makeChange(
        { Shared: { initial_shared_version: 1 } } as unknown as BalanceChange['owner'],
        '0x2::sui::SUI',
        '100',
      ),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    const links = screen.queryAllByRole('link');
    expect(links).toHaveLength(0);
  });

  it('should handle multiple balance changes', () => {
    const changes = [
      makeChange({ AddressOwner: '0xaaa' }, '0x2::sui::SUI', '1000000000'),
      makeChange({ AddressOwner: '0xbbb' }, '0x2::sui::SUI', '-500000000'),
      makeChange({ AddressOwner: '0xccc' }, '0xfdd1::nusdc::NUSDC', '2000000'),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    expect(screen.getByText('Balance Changes (3)')).toBeInTheDocument();
  });

  it('should handle zero amount', () => {
    const changes = [
      makeChange({ AddressOwner: '0xabc' }, '0x2::sui::SUI', '0'),
    ];
    renderWithRouter(<TransactionBalanceChanges balanceChanges={changes} />);
    // Zero is not negative, so it should show as positive (green)
    const amountEl = screen.getByText(/\+0 NSN/);
    expect(amountEl.className).toContain('text-green-400');
  });
});
