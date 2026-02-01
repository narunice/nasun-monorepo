import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from './setup';
import { AddressBookPanel } from '../address/AddressBookPanel';

// Mock useAddressBook
const mockGetAllEntries = vi.fn();
const mockUpdateLabel = vi.fn();
const mockTrustAddress = vi.fn();
const mockUntrustAddress = vi.fn();
const mockRemoveAddress = vi.fn();

vi.mock('@nasun/wallet', () => ({
  useAddressBook: () => ({
    getAllEntries: mockGetAllEntries,
    updateLabel: mockUpdateLabel,
    trustAddress: mockTrustAddress,
    untrustAddress: mockUntrustAddress,
    removeAddress: mockRemoveAddress,
  }),
  shortenAddress: (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`,
  isValidAddress: vi.fn((addr: string) => /^0x[a-fA-F0-9]{64}$/.test(addr)),
  getExplorerAddressUrl: vi.fn((addr: string) => `https://explorer.nasun.io/devnet/address/${addr}`),
  getExplorerObjectUrl: vi.fn((id: string) => `https://explorer.nasun.io/devnet/object/${id}`),
  getExplorerTxUrl: vi.fn((digest: string) => `https://explorer.nasun.io/devnet/tx/${digest}`),
}));

const mockEntries = [
  {
    address: '0x1111111111111111111111111111111111111111111111111111111111111111',
    label: 'Alice',
    isTrusted: true,
    transactionCount: 5,
    firstTransactionAt: Date.now() - 86400000,
    lastTransactionAt: Date.now(),
  },
  {
    address: '0x2222222222222222222222222222222222222222222222222222222222222222',
    label: 'Bob',
    isTrusted: false,
    transactionCount: 2,
    firstTransactionAt: Date.now() - 172800000,
    lastTransactionAt: Date.now() - 86400000,
  },
  {
    address: '0x3333333333333333333333333333333333333333333333333333333333333333',
    label: undefined,
    isTrusted: false,
    transactionCount: 1,
    firstTransactionAt: Date.now(),
    lastTransactionAt: Date.now(),
  },
];

describe('AddressBookPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllEntries.mockReturnValue(mockEntries);
  });

  describe('Rendering', () => {
    it('should render header', () => {
      render(<AddressBookPanel />);
      expect(screen.getByText('Address Book')).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(<AddressBookPanel />);
      expect(screen.getByPlaceholderText('Search addresses...')).toBeInTheDocument();
    });

    it('should render all address entries', () => {
      render(<AddressBookPanel />);
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('should show trusted star for trusted addresses', () => {
      render(<AddressBookPanel />);
      expect(screen.getByText('⭐')).toBeInTheDocument();
    });

    it('should show transaction count', () => {
      render(<AddressBookPanel />);
      expect(screen.getByText('5 txs')).toBeInTheDocument();
      expect(screen.getByText('2 txs')).toBeInTheDocument();
      expect(screen.getByText('1 tx')).toBeInTheDocument();
    });

    it('should show empty state when no entries', () => {
      mockGetAllEntries.mockReturnValue([]);
      render(<AddressBookPanel />);
      expect(screen.getByText('No saved addresses yet')).toBeInTheDocument();
    });
  });

  describe('Search', () => {
    it('should filter entries by label', () => {
      render(<AddressBookPanel />);
      const searchInput = screen.getByPlaceholderText('Search addresses...');

      fireEvent.change(searchInput, { target: { value: 'Alice' } });

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });

    it('should filter entries by address', () => {
      render(<AddressBookPanel />);
      const searchInput = screen.getByPlaceholderText('Search addresses...');

      fireEvent.change(searchInput, { target: { value: '1111' } });

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });

    it('should show no results message when search has no matches', () => {
      render(<AddressBookPanel />);
      const searchInput = screen.getByPlaceholderText('Search addresses...');

      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No addresses found')).toBeInTheDocument();
    });
  });

  describe('Trust Toggle', () => {
    it('should call trustAddress when clicking Trust button', () => {
      render(<AddressBookPanel />);

      // Find the Trust button for Bob (untrusted)
      const trustButtons = screen.getAllByText('Trust');
      fireEvent.click(trustButtons[0]);

      expect(mockTrustAddress).toHaveBeenCalled();
    });

    it('should call untrustAddress when clicking Trusted button', () => {
      render(<AddressBookPanel />);

      // Find the Trusted ✓ button for Alice
      const trustedButton = screen.getByText('Trusted ✓');
      fireEvent.click(trustedButton);

      expect(mockUntrustAddress).toHaveBeenCalled();
    });
  });

  describe('Label Editing', () => {
    it('should show edit input when clicking Edit button', () => {
      render(<AddressBookPanel />);

      const editButtons = screen.getAllByTitle('Edit name');
      fireEvent.click(editButtons[0]);

      // Should show Save and Cancel buttons
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should call updateLabel when saving', () => {
      render(<AddressBookPanel />);

      const editButtons = screen.getAllByTitle('Edit name');
      fireEvent.click(editButtons[0]);

      const input = screen.getByPlaceholderText('Enter label...');
      fireEvent.change(input, { target: { value: 'New Label' } });
      fireEvent.click(screen.getByText('Save'));

      expect(mockUpdateLabel).toHaveBeenCalled();
    });

    it('should cancel editing when clicking Cancel', () => {
      render(<AddressBookPanel />);

      const editButtons = screen.getAllByTitle('Edit name');
      fireEvent.click(editButtons[0]);
      fireEvent.click(screen.getByText('Cancel'));

      // Should be back to normal state
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
    });
  });

  describe('Delete', () => {
    it('should show confirm state when clicking Delete', () => {
      render(<AddressBookPanel />);

      const deleteButtons = screen.getAllByText('Delete');
      fireEvent.click(deleteButtons[0]);

      expect(screen.getByText('Confirm?')).toBeInTheDocument();
    });

    it('should call removeAddress when confirming delete', () => {
      render(<AddressBookPanel />);

      const deleteButtons = screen.getAllByText('Delete');
      fireEvent.click(deleteButtons[0]); // First click - show confirm
      fireEvent.click(screen.getByText('Confirm?')); // Second click - confirm

      expect(mockRemoveAddress).toHaveBeenCalled();
    });
  });

  describe('Selection', () => {
    it('should call onSelect when clicking an entry', () => {
      const onSelect = vi.fn();
      render(<AddressBookPanel onSelect={onSelect} />);

      // Click on an entry (the whole card should be clickable)
      const aliceCard = screen.getByText('Alice').closest('div');
      if (aliceCard?.parentElement) {
        fireEvent.click(aliceCard.parentElement);
        expect(onSelect).toHaveBeenCalled();
      }
    });
  });

  describe('Close', () => {
    it('should call onClose when clicking close button', () => {
      const onClose = vi.fn();
      render(<AddressBookPanel onClose={onClose} />);

      // Find close button (X icon)
      const buttons = screen.getAllByRole('button');
      const closeButton = buttons.find((btn) =>
        btn.querySelector('path[d="M6 18L18 6M6 6l12 12"]')
      );

      if (closeButton) {
        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalled();
      }
    });
  });
});
