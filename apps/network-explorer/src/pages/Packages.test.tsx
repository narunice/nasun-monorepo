import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Packages from './Packages';
import { renderWithRouter } from '../test/test-utils';

describe('Packages page', () => {
  it('should render page title', () => {
    renderWithRouter(<Packages />);
    expect(screen.getByText('Packages')).toBeInTheDocument();
  });

  it('should render back to home link', () => {
    renderWithRouter(<Packages />);
    const link = screen.getByText(/Back to Home/);
    expect(link.closest('a')).toHaveAttribute('href', '/');
  });

  it('should render table headers', () => {
    renderWithRouter(<Packages />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Package ID')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
  });

  it('should render system packages', () => {
    renderWithRouter(<Packages />);
    expect(screen.getByText('Move Stdlib')).toBeInTheDocument();
    expect(screen.getByText('Sui Framework')).toBeInTheDocument();
    expect(screen.getByText('Sui System')).toBeInTheDocument();
  });

  it('should render protocol packages', () => {
    renderWithRouter(<Packages />);
    expect(screen.getByText('DeepBook V3')).toBeInTheDocument();
    expect(screen.getByText('Prediction')).toBeInTheDocument();
    expect(screen.getByText('Lottery')).toBeInTheDocument();
  });

  it('should render baram packages', () => {
    renderWithRouter(<Packages />);
    expect(screen.getByText('Baram V1')).toBeInTheDocument();
    expect(screen.getByText('Baram Executor')).toBeInTheDocument();
    expect(screen.getByText('Baram AER')).toBeInTheDocument();
  });

  it('should render category badges', () => {
    renderWithRouter(<Packages />);
    const systemBadges = screen.getAllByText('system');
    const protocolBadges = screen.getAllByText('protocol');
    const baramBadges = screen.getAllByText('baram');
    expect(systemBadges.length).toBe(3);
    expect(protocolBadges.length).toBeGreaterThan(0);
    expect(baramBadges.length).toBeGreaterThan(0);
  });

  it('should link each package name to its detail page', () => {
    renderWithRouter(<Packages />);
    const link = screen.getByText('Move Stdlib').closest('a');
    expect(link).toHaveAttribute(
      'href',
      '/package/0x0000000000000000000000000000000000000000000000000000000000000001',
    );
  });

  it('should truncate long package IDs', () => {
    renderWithRouter(<Packages />);
    // System package 0x000...001 should be truncated
    const idLinks = screen.getAllByTitle(/^0x/);
    idLinks.forEach((link) => {
      expect(link.textContent!.length).toBeLessThan(70);
    });
  });

  it('should render correct number of rows', () => {
    renderWithRouter(<Packages />);
    const rows = screen.getAllByRole('row');
    // 1 header + 23 packages = 24 total rows
    expect(rows).toHaveLength(24);
  });

  it('should render descriptions for each package', () => {
    renderWithRouter(<Packages />);
    expect(screen.getByText('Move standard library')).toBeInTheDocument();
    expect(screen.getByText('Core framework: Coin, NFT, Transfer')).toBeInTheDocument();
    expect(screen.getByText('AI Execution Reports')).toBeInTheDocument();
  });
});
