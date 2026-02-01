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
  it('should render Quick Start section with Recommended badge', () => {
    render(<DisconnectedView {...defaultProps} />);

    expect(screen.getByText('Quick Start')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('No seed phrase needed')).toBeInTheDocument();
  });

  it('should render traditional wallet options', () => {
    render(<DisconnectedView {...defaultProps} />);

    expect(screen.getByText('Create Password Wallet')).toBeInTheDocument();
    expect(screen.getByText('Import Existing Wallet')).toBeInTheDocument();
  });

  it('should call setViewMode("create") when clicking Create', () => {
    render(<DisconnectedView {...defaultProps} />);

    fireEvent.click(screen.getByText('Create Password Wallet'));
    expect(defaultProps.setViewMode).toHaveBeenCalledWith('create');
  });

  it('should call setViewMode("import") when clicking Import', () => {
    render(<DisconnectedView {...defaultProps} />);

    fireEvent.click(screen.getByText('Import Existing Wallet'));
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
