/**
 * PredictAdminPage
 * Admin page for creating prediction markets
 */

import { Link, useNavigate } from 'react-router-dom';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { CreateMarketForm, usePredictionAdmin } from '../features/prediction';

// Admin address that owns AdminCap
const ADMIN_ADDRESS = '0x05eef6d318e5a824fdf763270e3a719bb0327ddf814dea29cba6c963ebdb8f21';

export function PredictAdminPage() {
  const { account } = useWallet();
  const { state: zkState } = useZkLogin();
  const { isResolver } = usePredictionAdmin();
  const navigate = useNavigate();

  // Check admin for both local wallet and zkLogin
  const walletAddress = account?.address || zkState?.address;
  const isAdmin = walletAddress === ADMIN_ADDRESS;

  const handleSuccess = (digest: string) => {
    console.log('Market created:', digest);
    // Navigate to markets list after short delay
    setTimeout(() => {
      navigate('/predict');
    }, 1500);
  };

  // Not authorized
  if (!isAdmin && !isResolver) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-theme-bg-secondary rounded-xl p-6 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-theme-text-primary mb-2">
            Access Denied
          </h2>
          <p className="text-theme-text-muted mb-4">
            You don't have permission to create markets.
            Only admins with AdminCap can create new prediction markets.
          </p>
          <Link
            to="/predict"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Back to Markets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back Button */}
      <Link
        to="/predict"
        className="inline-flex items-center gap-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Markets
      </Link>

      {/* Admin Badge */}
      <div className="flex items-center gap-2 text-yellow-500">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
        <span className="font-medium">Admin Mode</span>
      </div>

      {/* Create Market Form */}
      <CreateMarketForm
        onSuccess={handleSuccess}
        onCancel={() => navigate('/predict')}
      />

      {/* Help Text */}
      <div className="bg-theme-bg-secondary rounded-xl p-4">
        <h3 className="text-sm font-semibold text-theme-text-primary mb-2">
          Market Creation Tips
        </h3>
        <ul className="text-sm text-theme-text-muted space-y-1">
          <li>• Frame questions as clear yes/no with specific dates</li>
          <li>• Include detailed resolution criteria in the description</li>
          <li>• Set close time before the event outcome is known</li>
          <li>• Allow adequate time between close and resolve deadline</li>
          <li>• Choose the appropriate category for discoverability</li>
        </ul>
      </div>
    </div>
  );
}
