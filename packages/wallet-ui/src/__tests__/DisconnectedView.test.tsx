import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from './setup';
import { DisconnectedView } from '../connect/wallet-views/DisconnectedView';

vi.mock('@nasun/wallet', () => ({
  useZkLogin: vi.fn(() => ({
    isConnected: false,
    isLoading: false,
    address: null,
    state: 'disconnected',
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('../../social/SocialLoginButtons', () => ({
  SocialLoginButtons: ({ onLogin, isLoading }: { onLogin: (p: string) => void; isLoading: boolean }) => (
    <button onClick={() => onLogin('google')} disabled={isLoading} data-testid="social-login-btn">
      Google Login
    </button>
  ),
}));

const defaultProps = {
  handleSocialLogin: vi.fn(),
  isZkLoading: false,
  loadingProvider: null as null,
  zkError: null as { message: string } | null,
  setViewMode: vi.fn(),
};

describe('DisconnectedView', () => {
  it('should render brand header', () => {
    render(<DisconnectedView {...defaultProps} />);

    expect(screen.getByText('Nasun Wallet')).toBeInTheDocument();
  });

  it('should render social login button', () => {
    render(<DisconnectedView {...defaultProps} />);

    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('should render wallet creation and import options', () => {
    render(<DisconnectedView {...defaultProps} />);

    expect(screen.getByText('Create Wallet')).toBeInTheDocument();
    expect(screen.getByText('Import Wallet')).toBeInTheDocument();
  });

  it('should render contextual divider', () => {
    render(<DisconnectedView {...defaultProps} />);

    expect(screen.getByText('or use web3 native wallet')).toBeInTheDocument();
  });

  it('should call setViewMode("create") when clicking Create Wallet', () => {
    render(<DisconnectedView {...defaultProps} />);

    fireEvent.click(screen.getByText('Create Wallet'));
    expect(defaultProps.setViewMode).toHaveBeenCalledWith('create');
  });

  it('should call setViewMode("import") when clicking Import Wallet', () => {
    render(<DisconnectedView {...defaultProps} />);

    fireEvent.click(screen.getByText('Import Wallet'));
    expect(defaultProps.setViewMode).toHaveBeenCalledWith('import');
  });

  it('should show error message when zkError is set', () => {
    render(
      <DisconnectedView
        {...defaultProps}
        zkError={{ message: 'OAuth flow cancelled' }}
      />
    );

    expect(screen.getByText('OAuth flow cancelled')).toBeInTheDocument();
  });

  it('should not show error message when zkError is null', () => {
    render(<DisconnectedView {...defaultProps} />);

    expect(screen.queryByText('OAuth flow cancelled')).not.toBeInTheDocument();
  });
});
