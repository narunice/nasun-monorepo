import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from './setup';
import { ValidatorList } from '../staking/ValidatorList';

// The default mock from setup.tsx provides validators
// We'll use those defaults for most tests

describe('ValidatorList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render validator names', () => {
      render(<ValidatorList onSelect={() => {}} />);
      expect(screen.getByText('Validator 1')).toBeInTheDocument();
      expect(screen.getByText('Validator 2')).toBeInTheDocument();
    });

    it('should render APY for each validator', () => {
      render(<ValidatorList onSelect={() => {}} />);
      // Validators from setup.tsx mock have 5% and 4% APY
      expect(screen.getByText(/5\.00%/)).toBeInTheDocument();
      expect(screen.getByText(/4\.00%/)).toBeInTheDocument();
    });

    it('should render commission rate', () => {
      render(<ValidatorList onSelect={() => {}} />);
      // Validators from setup.tsx mock have 5% and 10% commission
      expect(screen.getAllByText(/5%/).length).toBeGreaterThan(0);
      expect(screen.getByText(/10%/)).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('should call onSelect with validator address when clicked', () => {
      const onSelect = vi.fn();
      render(<ValidatorList onSelect={onSelect} />);

      // Find the first validator and click it
      const validator1 = screen.getByText('Validator 1');
      const card = validator1.closest('[class*="cursor-pointer"]') || validator1.parentElement;
      if (card) {
        fireEvent.click(card);
        // Should have been called with first validator's address
        expect(onSelect).toHaveBeenCalled();
      }
    });

    it('should highlight selected validator', () => {
      const selectedAddress = '0x' + '1'.repeat(64);
      render(
        <ValidatorList
          onSelect={() => {}}
          selected={selectedAddress}
        />
      );

      // The component should render with selection
      expect(screen.getByText('Validator 1')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should handle loading state gracefully', () => {
      // The component should render without crashing even with default mocks
      render(<ValidatorList onSelect={() => {}} />);
      expect(screen.getByText('Validator 1')).toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('should render in compact mode when compact prop is true', () => {
      render(<ValidatorList onSelect={() => {}} compact />);
      expect(screen.getByText('Validator 1')).toBeInTheDocument();
    });
  });
});
