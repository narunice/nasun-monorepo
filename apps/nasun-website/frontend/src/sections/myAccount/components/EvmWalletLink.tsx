import { FC, useState, useCallback, useRef } from "react";
import { useAuth } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useWalletAuth } from "@/features/wallet/hooks/useWalletAuth";
import { prepareChallenge, connectVerify } from "@/services/metamaskApi";
import { connectMetaMaskSDK, signMessageViaSDK, disconnectMetaMaskSDK } from "@/lib/wallet/metamaskSdkProvider";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";
import { isMobileBrowser, isMetaMaskInAppBrowser } from "@/utils/mobileDetect";
import { AccountItem } from "./AccountItem";
import { LoggedInBadge, LinkedBadge } from "./StatusBadges";

/** Desktop/in-app: RainbowKit modal link button. */
export function EvmWalletLinkButton() {
  const {
    connect: handleLinkWallet,
    isAuthenticating: isWalletLinking,
    error: walletLinkError,
  } = useWalletAuth({
    mode: "link",
    onSuccess: () => { alert("Wallet linked successfully!"); },
    onError: (error) => { alert(error.message || "Failed to link wallet"); },
  });

  return (
    <>
      <Button size="sm" variant="filledOutlineC7"
        onClick={handleLinkWallet} disabled={isWalletLinking}>
        {isWalletLinking ? "Linking..." : "Link"}
      </Button>
      {walletLinkError && (
        <p className="text-sm text-red-400 mt-1">{walletLinkError}</p>
      )}
    </>
  );
}

/** Mobile: MetaMask SDK direct link with modal (bypasses WalletConnect). */
function MobileMetaMaskLinkButton() {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "connecting" | "signing" | "error">("choose");
  const [error, setError] = useState<string | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const handleOpenMetaMask = useCallback(async () => {
    if (!user) {
      setError("Please sign in first.");
      setStep("error");
      return;
    }

    setStep("connecting");
    setError(null);

    try {
      // 1. Connect via MetaMask SDK deep link
      const address = await connectMetaMaskSDK();

      // 2. Get challenge from server
      const { nonce, message } = await prepareChallenge();

      // 3. Sign via MetaMask SDK (2nd trip to MetaMask app)
      setStep("signing");
      const signature = await signMessageViaSDK(message, address);

      // 4. Verify signature on server (retry once for Android network reconnection)
      let authResult;
      try {
        authResult = await connectVerify(signature, nonce);
      } catch (fetchErr) {
        // Only retry on network errors (TypeError from fetch), not HTTP 4xx/5xx
        if (fetchErr instanceof TypeError) {
          await new Promise(r => setTimeout(r, 1500));
          authResult = await connectVerify(signature, nonce);
        } else {
          throw fetchErr;
        }
      }

      // 5. Link account if different identity
      if (user.identityId !== authResult.identityId) {
        const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
        if (!linkAccountApi) throw new Error("Link Account API is not configured");

        const token = user.cognitoToken ?? useBattalionNftStore.getState().cognitoToken;
        if (!token) throw new Error("Session expired. Please sign in again.");

        const response = await fetch(linkAccountApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            primaryIdentityId: user.identityId,
            secondaryIdentityId: authResult.identityId,
            secondaryProvider: "MetaMask",
          }),
        });

        if (!response.ok) {
          if (response.status === 401) throw new Error("Session expired. Please sign in again.");
          const body = await response.text();
          throw new Error(`Failed to link wallet: ${response.status} ${body}`);
        }
      }

      await refreshAndSaveUserProfile(user.identityId);
      setModalOpen(false);
      setStep("choose");
      alert("Wallet linked successfully!");
    } catch (err) {
      console.error("[MobileMetaMaskLink] Error:", err);
      await disconnectMetaMaskSDK();
      setError(err instanceof Error ? err.message : "Wallet linking failed.");
      setStep("error");
    }
  }, [user]);

  return (
    <>
      <Button size="sm" variant="filledOutlineC7" onClick={() => setModalOpen(true)}>
        Link with MetaMask
      </Button>

      <Dialog open={modalOpen} onOpenChange={(open) => {
        if (!open) {
          disconnectMetaMaskSDK().catch(() => {});
          setModalOpen(false);
          setStep("choose");
          setError(null);
        }
      }}>
        <DialogContent className="bg-gray-900 border-nasun-c5/30">
          <DialogHeader>
            <DialogTitle className="text-nasun-white">Link EVM Wallet</DialogTitle>
            <DialogDescription className="text-nasun-white/80">
              Connect your MetaMask wallet to register your EVM address.
            </DialogDescription>
          </DialogHeader>

          {step === "choose" && (
            <div className="flex flex-col gap-3 py-2">
              <Button variant="filledOutlineC7" onClick={handleOpenMetaMask} className="w-full">
                Open MetaMask
              </Button>
              <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="w-full">
                <Button variant="filledOutlineC7" className="w-full opacity-60">
                  Install MetaMask
                </Button>
              </a>
              <p className="text-yellow-400/70 text-sm text-center leading-relaxed">
                Return to this browser after each approval step.
                If you have trouble, try from a desktop browser.
              </p>
            </div>
          )}

          {(step === "connecting" || step === "signing") && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Spinner size="md" />
              <p className="text-nasun-white/80 text-sm">
                {step === "connecting" ? "Waiting for MetaMask..." : "Waiting for signature..."}
              </p>
              <p className="text-nasun-white/80 text-sm">
                Complete the request in your MetaMask app, then return here.
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col gap-3 py-2">
              <div className="bg-red-500/10 border border-red-500/30 rounded-sm px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
              <Button variant="filledOutlineC7" onClick={() => setStep("choose")} className="w-full">
                Try Again
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** EVM wallet section with platform-aware link button. */
export const EvmWalletSection: FC<{
  evmWalletAddress: string | undefined;
  isMetaMaskPrimary: boolean;
  isMetaMaskLinked: boolean;
  unlinkAccount: (provider: string) => void;
  isLinking: boolean;
}> = ({ evmWalletAddress, isMetaMaskPrimary, isMetaMaskLinked, unlinkAccount, isLinking }) => {
  // Desktop or MetaMask in-app: RainbowKit modal. All other mobile (iOS
  // Safari, iOS Chrome/Firefox, Android): MetaMask SDK deep-link with a
  // signed challenge. The previous "paste your address" fallback was
  // removed because it accepted any 0x-string with no ownership proof,
  // which downstream consumers (NFT allowlists, leaderboards, the
  // ecosystem dashboard) treat as a legitimate link.
  const useMobileSdk = isMobileBrowser() && !isMetaMaskInAppBrowser();

  return (
    <AccountItem
      provider="metamask"
      description="Link your EVM wallet for NFT allowlists"
      identifier={
        evmWalletAddress
          ? `${evmWalletAddress.slice(0, 6)}...${evmWalletAddress.slice(-4)}`
          : "Not linked"
      }
      statusBadge={
        isMetaMaskPrimary ? <LoggedInBadge />
          : isMetaMaskLinked ? <LinkedBadge />
          : undefined
      }
      actions={[
        !isMetaMaskLinked ? (
          useMobileSdk
            ? <MobileMetaMaskLinkButton key="link" />
            : <EvmWalletLinkButton key="link" />
        ) : null,
        isMetaMaskLinked && !isMetaMaskPrimary ? (
          <Button
            key="unlink"
            size="sm"
            variant="filledOutlineScarlet"
            onClick={() => unlinkAccount("metamask")}
            disabled={isLinking}
          >
            Unlink
          </Button>
        ) : null,
      ]}
    >
      {!isMetaMaskLinked && useMobileSdk && (
        <p className="text-yellow-400/70 text-sm leading-relaxed">
          Requires the MetaMask app. Return to this browser after each
          approval step. If you do not have MetaMask, link from a desktop
          browser instead.
        </p>
      )}
    </AccountItem>
  );
};
