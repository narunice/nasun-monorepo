/**
 * AuthCallbackPage
 * Handles OAuth callback for zkLogin authentication
 */

import { useNavigate } from 'react-router-dom';
import { ZkLoginCallback } from '@nasun/wallet-ui';

export default function AuthCallback() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
      <div className="bg-card rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl border border-border">
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
