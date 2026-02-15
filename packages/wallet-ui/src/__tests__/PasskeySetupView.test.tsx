/**
 * Tests for PasskeySetupView component.
 *
 * Covers:
 * - Rendering (title, description, form elements)
 * - Form validation (empty name disables button)
 * - Wallet creation flow (success → onCreated callback)
 * - Error display from props
 * - Loading state during authentication
 * - Enter key submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './setup';
import { PasskeySetupView } from '../connect/wallet-views/PasskeySetupView';

describe('PasskeySetupView', () => {
  const mockCreateWallet = vi.fn();

  const defaultProps = {
    onBack: vi.fn(),
    onCreated: vi.fn(),
    createWallet: mockCreateWallet,
    isLoading: false,
    error: null as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateWallet.mockResolvedValue({
      address: '0x' + 'a'.repeat(64),
      mnemonic: 'word '.repeat(11) + 'word',
    });
  });

  it('should render setup form with title and description', () => {
    render(<PasskeySetupView {...defaultProps} />);

    expect(screen.getByText('Setup Passkey Wallet')).toBeInTheDocument();
    expect(screen.getByText(/biometrics/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/display name/i)).toBeInTheDocument();
  });

  it('should render Cancel and Create buttons', () => {
    render(<PasskeySetupView {...defaultProps} />);

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('should disable Create button when name is empty', () => {
    render(<PasskeySetupView {...defaultProps} />);

    const createBtn = screen.getByText('Create').closest('button')!;
    expect(createBtn).toBeDisabled();
  });

  it('should enable Create button when name is entered', () => {
    render(<PasskeySetupView {...defaultProps} />);

    const input = screen.getByPlaceholderText(/display name/i);
    fireEvent.change(input, { target: { value: 'My Wallet' } });

    const createBtn = screen.getByText('Create').closest('button')!;
    expect(createBtn).not.toBeDisabled();
  });

  it('should disable Create button for whitespace-only input', () => {
    render(<PasskeySetupView {...defaultProps} />);

    const input = screen.getByPlaceholderText(/display name/i);
    fireEvent.change(input, { target: { value: '   ' } });

    const createBtn = screen.getByText('Create').closest('button')!;
    expect(createBtn).toBeDisabled();
  });

  it('should call createWallet with trimmed name on Create click', async () => {
    render(<PasskeySetupView {...defaultProps} />);

    const input = screen.getByPlaceholderText(/display name/i);
    fireEvent.change(input, { target: { value: '  My Wallet  ' } });
    fireEvent.click(screen.getByText('Create').closest('button')!);

    await waitFor(() => {
      expect(mockCreateWallet).toHaveBeenCalledWith('My Wallet');
    });
  });

  it('should call onCreated with mnemonic after successful creation', async () => {
    const testMnemonic = 'abandon badge cabbage dad eagle fabric gadget habit ice jacket kangaroo lamp';
    mockCreateWallet.mockResolvedValue({
      address: '0x' + 'a'.repeat(64),
      mnemonic: testMnemonic,
    });

    render(<PasskeySetupView {...defaultProps} />);

    const input = screen.getByPlaceholderText(/display name/i);
    fireEvent.change(input, { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Create').closest('button')!);

    await waitFor(() => {
      expect(defaultProps.onCreated).toHaveBeenCalledWith(testMnemonic);
    });
  });

  it('should call onBack when Cancel is clicked', () => {
    render(<PasskeySetupView {...defaultProps} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  it('should show loading state during authentication', () => {
    render(<PasskeySetupView {...defaultProps} isLoading={true} />);

    expect(screen.getByText('Authenticating...')).toBeInTheDocument();
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
  });

  it('should disable input and buttons during loading', () => {
    render(<PasskeySetupView {...defaultProps} isLoading={true} />);

    const input = screen.getByPlaceholderText(/display name/i);
    expect(input).toBeDisabled();

    const cancelBtn = screen.getByText('Cancel');
    expect(cancelBtn).toBeDisabled();
  });

  it('should display error message from props', () => {
    const mockError = { name: 'PasskeyError', type: 'CANCELLED', message: 'User cancelled passkey registration' } as any;

    render(<PasskeySetupView {...defaultProps} error={mockError} />);

    expect(screen.getByText('User cancelled passkey registration')).toBeInTheDocument();
  });

  it('should not display error when error is null', () => {
    render(<PasskeySetupView {...defaultProps} />);

    const errorElements = screen.queryAllByText(/error|failed|cancelled/i);
    expect(errorElements).toHaveLength(0);
  });

  it('should submit on Enter key press with valid name', async () => {
    render(<PasskeySetupView {...defaultProps} />);

    const input = screen.getByPlaceholderText(/display name/i);
    fireEvent.change(input, { target: { value: 'Test Wallet' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockCreateWallet).toHaveBeenCalledWith('Test Wallet');
    });
  });

  it('should NOT submit on Enter key press with empty name', async () => {
    render(<PasskeySetupView {...defaultProps} />);

    const input = screen.getByPlaceholderText(/display name/i);
    fireEvent.keyDown(input, { key: 'Enter' });

    // Give it a tick to ensure nothing happened
    await new Promise((r) => setTimeout(r, 50));
    expect(mockCreateWallet).not.toHaveBeenCalled();
  });

  it('should not call onCreated when createWallet throws', async () => {
    mockCreateWallet.mockRejectedValue(new Error('Registration failed'));

    render(<PasskeySetupView {...defaultProps} />);

    const input = screen.getByPlaceholderText(/display name/i);
    fireEvent.change(input, { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Create').closest('button')!);

    await waitFor(() => {
      expect(mockCreateWallet).toHaveBeenCalled();
    });

    // onCreated should NOT have been called
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
  });
});
