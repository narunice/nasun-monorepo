import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from './setup';
import { LockedStateUI } from '../connect/LockedStateUI';
import { isLockedOut, getLockoutRemainingMs, getUnlockAttemptState } from '@nasun/wallet';

vi.mock('@nasun/wallet', () => ({
  isLockedOut: vi.fn(() => false),
  getLockoutRemainingMs: vi.fn(() => 0),
  getUnlockAttemptState: vi.fn(() => ({ failedAttempts: 0, lockedUntil: null })),
  LOCKOUT_TIERS: [
    { attempts: 8, durationMs: 30000 },
    { attempts: 12, durationMs: 300000 },
    { attempts: 16, durationMs: 1800000 },
  ],
}));

const defaultProps = {
  password: '',
  setPassword: vi.fn(),
  isLoading: false,
  error: null as string | null,
  handleUnlock: vi.fn(),
  handleDelete: vi.fn(),
  setViewMode: vi.fn(),
};

describe('LockedStateUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render unlock form with title', () => {
    render(<LockedStateUI {...defaultProps} />);

    expect(screen.getByText('Unlock Wallet')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByText('Unlock')).toBeInTheDocument();
  });

  it('should render Import and Delete buttons', () => {
    render(<LockedStateUI {...defaultProps} />);

    expect(screen.getByText('Import')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('should call setPassword when typing', () => {
    render(<LockedStateUI {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'mypassword' },
    });
    expect(defaultProps.setPassword).toHaveBeenCalledWith('mypassword');
  });

  it('should call handleUnlock when clicking Unlock', () => {
    render(<LockedStateUI {...defaultProps} password="test123" />);

    fireEvent.click(screen.getByText('Unlock'));
    expect(defaultProps.handleUnlock).toHaveBeenCalled();
  });

  it('should disable Unlock button when password is empty', () => {
    render(<LockedStateUI {...defaultProps} />);

    expect(screen.getByText('Unlock')).toBeDisabled();
  });

  it('should disable Unlock button when loading', () => {
    render(<LockedStateUI {...defaultProps} password="test123" isLoading />);

    expect(screen.getByText('Unlocking...')).toBeDisabled();
  });

  it('should show error message', () => {
    render(<LockedStateUI {...defaultProps} error="Invalid password" />);

    expect(screen.getByText('Invalid password')).toBeInTheDocument();
  });

  it('should call handleDelete when clicking Delete', () => {
    render(<LockedStateUI {...defaultProps} />);

    fireEvent.click(screen.getByText('Delete'));
    expect(defaultProps.handleDelete).toHaveBeenCalled();
  });

  it('should call setViewMode("import") when clicking Import', () => {
    render(<LockedStateUI {...defaultProps} />);

    fireEvent.click(screen.getByText('Import'));
    expect(defaultProps.setViewMode).toHaveBeenCalledWith('import');
  });

  it('should trigger unlock on Enter key press', () => {
    render(<LockedStateUI {...defaultProps} password="test123" />);

    fireEvent.keyDown(screen.getByPlaceholderText('Password'), { key: 'Enter' });
    expect(defaultProps.handleUnlock).toHaveBeenCalled();
  });

  describe('lockout state', () => {
    it('should show lockout warning when locked out', () => {
      vi.mocked(isLockedOut).mockReturnValue(true);
      vi.mocked(getLockoutRemainingMs).mockReturnValue(25000);
      vi.mocked(getUnlockAttemptState).mockReturnValue({ failedAttempts: 8, lockedUntil: Date.now() + 25000 });

      render(<LockedStateUI {...defaultProps} />);

      expect(screen.getByText('Too many failed attempts')).toBeInTheDocument();
    });
  });
});
