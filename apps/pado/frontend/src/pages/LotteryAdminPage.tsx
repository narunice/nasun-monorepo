/**
 * LotteryAdminPage
 * Standalone admin page with auth guard wrapper
 */

import { Link } from 'react-router-dom';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useLotteryAdmin } from '../features/lottery';
import { LotteryAdminContent } from '../features/lottery/components/admin';

export function LotteryAdminPage() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const { isAdmin } = useLotteryAdmin();

  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : status === 'unlocked'
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  if (!walletAddress) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-theme-bg-secondary rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-theme-text-primary mb-2">
            Wallet Not Connected
          </h2>
          <p className="text-theme-text-muted mb-4">
            Please connect your wallet to access the admin panel.
          </p>
          <Link
            to="/lottery"
            className="inline-block px-4 py-2 bg-pd1 hover:bg-pd1/80 text-white font-medium rounded-lg transition-colors"
          >
            Back to Lottery
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-theme-bg-secondary rounded-xl p-6 text-center">
          <div className="text-red-500 text-5xl mb-4">X</div>
          <h2 className="text-xl font-bold text-theme-text-primary mb-2">
            Access Denied
          </h2>
          <p className="text-theme-text-muted mb-4">
            You don't have permission to manage lottery rounds. Only admins with
            AdminCap can access this page.
          </p>
          <Link
            to="/lottery"
            className="inline-block px-4 py-2 bg-pd1 hover:bg-pd1/80 text-white font-medium rounded-lg transition-colors"
          >
            Back to Lottery
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back Button */}
      <Link
        to="/lottery"
        className="inline-flex items-center gap-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Lottery
      </Link>

      {/* Admin Badge */}
      <div className="flex items-center gap-2 text-yellow-500">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-medium">Admin Mode</span>
      </div>

      <LotteryAdminContent />
    </div>
  );
}
