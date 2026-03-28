/**
 * AuthCallbackPage
 * Handles OAuth callback for zkLogin authentication
 */

import { useNavigate } from 'react-router-dom';
import { ZkLoginCallback } from '@nasun/wallet-ui';

export function AuthCallbackPage() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-theme-bg-secondary rounded-2xl p-8 max-w-md w-full shadow-xl">
        <ZkLoginCallback
          onSuccess={() => {
            // Redirect to home after successful login
            navigate('/', { replace: true });
          }}
          onError={(error) => {
            console.error('zkLogin error:', error);
            // Stay on callback page to show error and retry option
          }}
        />
      </div>
    </div>
  );
}
