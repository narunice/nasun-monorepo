/**
 * Tests for PasskeySetupView component.
 *
 * Covers:
 * - Rendering (title, description, form elements)
 * - Form validation (empty name / missing password disables button)
 * - Wallet creation flow (success → onCreated callback)
 * - Error display from props
 * - Loading state during authentication
 * - Enter key submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './setup';
import { PasskeySetupView } from '../connect/wallet-views/PasskeySetupView';

/** Helper: fill all required fields so the form becomes submittable */
function fillForm(
  overrides: { name?: string; password?: string; confirmPassword?: string } = {},
) {
  const name = overrides.name ?? 'My Wallet';
  const password = overrides.password ?? 'secret123';
  const confirmPassword = overrides.confirmPassword ?? password;

  fireEvent.change(screen.getByPlaceholderText(/display name/i), {
    target: { value: name },
  });
  fireEvent.change(screen.getByPlaceholderText(/wallet password/i), {
    target: { value: password },
  });
  fireEvent.change(screen.getByPlaceholderText(/confirm password/i), {
    target: { value: confirmPassword },
  });
}

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
    expect(screen.getAllByText(/biometrics/i).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/display name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/wallet password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/confirm password/i)).toBeInTheDocument();
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

  it('should enable Create button when all fields are valid', () => {
    render(<PasskeySetupView {...defaultProps} />);

    fillForm();

    const createBtn = screen.getByText('Create').closest('button')!;
    expect(createBtn).not.toBeDisabled();
  });

  it('should disable Create button for whitespace-only input', () => {
    render(<PasskeySetupView {...defaultProps} />);

    fillForm({ name: '   ' });

    const createBtn = screen.getByText('Create').closest('button')!;
    expect(createBtn).toBeDisabled();
  });

  it('should disable Create button when password is too short', () => {
    render(<PasskeySetupView {...defaultProps} />);

    fillForm({ password: '12345', confirmPassword: '12345' });

    const createBtn = screen.getByText('Create').closest('button')!;
    expect(createBtn).toBeDisabled();
  });

  it('should disable Create button when passwords do not match', () => {
    render(<PasskeySetupView {...defaultProps} />);

    fillForm({ password: 'secret123', confirmPassword: 'secret456' });

    const createBtn = screen.getByText('Create').closest('button')!;
    expect(createBtn).toBeDisabled();
  });

  it('should call createWallet with trimmed name and password on Create click', async () => {
    render(<PasskeySetupView {...defaultProps} />);

    fillForm({ name: '  My Wallet  ', password: 'secret123' });
    fireEvent.click(screen.getByText('Create').closest('button')!);

    await waitFor(() => {
      expect(mockCreateWallet).toHaveBeenCalledWith('My Wallet', 'secret123');
    });
  });

  it('should call onCreated with mnemonic after successful creation', async () => {
    const testMnemonic = 'abandon badge cabbage dad eagle fabric gadget habit ice jacket kangaroo lamp';
    mockCreateWallet.mockResolvedValue({
      address: '0x' + 'a'.repeat(64),
      mnemonic: testMnemonic,
    });

    render(<PasskeySetupView {...defaultProps} />);

    fillForm({ name: 'Test' });
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

  it('should submit on Enter key press in confirm password with valid fields', async () => {
    render(<PasskeySetupView {...defaultProps} />);

    fillForm({ name: 'Test Wallet' });
    const confirmInput = screen.getByPlaceholderText(/confirm password/i);
    fireEvent.keyDown(confirmInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockCreateWallet).toHaveBeenCalledWith('Test Wallet', 'secret123');
    });
  });

  it('should NOT submit on Enter key press with incomplete form', async () => {
    render(<PasskeySetupView {...defaultProps} />);

    const confirmInput = screen.getByPlaceholderText(/confirm password/i);
    fireEvent.keyDown(confirmInput, { key: 'Enter' });

    // Give it a tick to ensure nothing happened
    await new Promise((r) => setTimeout(r, 50));
    expect(mockCreateWallet).not.toHaveBeenCalled();
  });

  it('should not call onCreated when createWallet throws', async () => {
    mockCreateWallet.mockRejectedValue(new Error('Registration failed'));

    render(<PasskeySetupView {...defaultProps} />);

    fillForm({ name: 'Test' });
    fireEvent.click(screen.getByText('Create').closest('button')!);

    await waitFor(() => {
      expect(mockCreateWallet).toHaveBeenCalled();
    });

    // onCreated should NOT have been called
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
  });
});
