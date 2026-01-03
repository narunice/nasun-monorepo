/**
 * ZkLoginCallbackPage
 * Handles OAuth callback for zkLogin authentication (Nasun Wallet)
 */

import { useNavigate } from "react-router-dom";
import { ZkLoginCallback } from "@nasun/wallet-ui";

export default function ZkLoginCallbackPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-nasun-black flex items-center justify-center">
      <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl border border-zinc-800">
        <ZkLoginCallback
          onSuccess={() => {
            // Redirect to home after successful login
            navigate("/", { replace: true });
          }}
          onError={(error) => {
            console.error("zkLogin error:", error);
            // Stay on callback page to show error and retry option
          }}
        />
      </div>
    </div>
  );
}
