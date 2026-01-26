import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AddressOverview from './AddressOverview';

describe('AddressOverview', () => {
  it('renders address info correctly', () => {
    const props = {
      address: '0x1234567890abcdef',
      totalBalance: '1000000000',
      objectCount: 5,
      hasNextPage: false,
    };

    render(<AddressOverview {...props} />);

    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('0x1234567890abcdef')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('1 NSN')).toBeInTheDocument();
    expect(screen.getByText('Owned Objects')).toBeInTheDocument();
    expect(screen.getByText('5 objects')).toBeInTheDocument();
  });

  it('renders with plus sign when hasNextPage is true', () => {
    const props = {
      address: '0x123',
      totalBalance: '0',
      objectCount: 10,
      hasNextPage: true,
    };

    render(<AddressOverview {...props} />);
    expect(screen.getByText('10+ objects')).toBeInTheDocument();
  });
});
