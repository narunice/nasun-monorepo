/**
 * AiChatTab — top-level `?tab=ai-chat` surface.
 *
 * Hosts the legacy generic LLM chat (executor-routed, AER receipts). The
 * implementation lives in `pages/ChatView`; this file is the thin shell
 * that resolves the connected wallet and wires the registration deep link
 * to the Agents tab.
 *
 * Why this is split from AiTab: the Agents surface and the chat surface
 * used to be sub-tabs inside one "AI" page. Splitting them puts each on
 * its own URL and removes the "Agents | Chat" inner toggle, so users land
 * directly on whichever they want from the top nav.
 *
 * Wake-mode chat (talking to a specific on-chain agent) is intentionally
 * NOT here. It lives in `AgentDetail → Chat` sub-tab.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { ChatView } from './pages/ChatView';

function NotConnected() {
  return (
    <div className="py-12 text-center space-y-4">
      <h3 className="text-base font-semibold text-white">AI Chat</h3>
      <p className="text-sm text-uju-secondary max-w-sm mx-auto">
        Connect your Nasun wallet to start chatting with an LLM and get on-chain receipts for each turn.
      </p>
      <p className="text-sm text-uju-secondary/60">
        Sign in with your Nasun wallet from the Profile tab to continue.
      </p>
    </div>
  );
}

export function AiChatTab() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress;
  const navigate = useNavigate();

  // The chat surface needs an agent (to bill the next turn) but the user may
  // arrive here before registering one. Send them to the Agents tab's
  // register flow when they hit "Register agent" from the empty state.
  const handleRegisterAgent = useCallback(() => {
    navigate('/my-account?tab=agents&view=register', { replace: false });
  }, [navigate]);

  if (!walletAddress) return <NotConnected />;

  return (
    <div className="space-y-4">
      <ChatView walletAddress={walletAddress} onRegisterAgent={handleRegisterAgent} />
    </div>
  );
}
