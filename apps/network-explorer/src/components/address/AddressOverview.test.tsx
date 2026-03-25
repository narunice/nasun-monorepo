import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AddressOverview from './AddressOverview';

describe('AddressOverview', () => {
  it('renders address info correctly', () => {
    const props = {
      address: '0x1234567890abcdef',
      totalBalance: '1000000000',
      objectCount: 5,
    };

    render(<AddressOverview {...props} />);

    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('0x1234567890abcdef')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('1 NSN')).toBeInTheDocument();
    expect(screen.getByText('Owned Objects')).toBeInTheDocument();
    expect(screen.getByText('5 objects')).toBeInTheDocument();
  });
});
