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
import { isMobileBrowser, isMetaMaskInAppBrowser, isIOSSafari } from "@/utils/mobileDetect";
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
            <DialogDescription className="text-nasun-white/60">
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
              <p className="text-nasun-white/60 text-sm">
                {step === "connecting" ? "Waiting for MetaMask..." : "Waiting for signature..."}
              </p>
              <p className="text-nasun-white/40 text-sm">
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

/** Manual EVM address entry form for mobile users who cannot use MetaMask SDK. */
function ManualEvmAddressForm() {
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = address.trim();
  const isValidEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  const showValidation = trimmed.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!user || !isValidEvmAddress) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) throw new Error("Link Account API is not configured");

      const token = user.cognitoToken ?? useBattalionNftStore.getState().cognitoToken;
      if (!token) throw new Error("Session expired. Please sign in again.");

      const response = await fetch(`${linkAccountApi}/register-evm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          evmAddress: trimmed,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 409) {
          throw new Error(body.message || "EVM wallet already linked. Unlink first.");
        }
        if (response.status === 401) {
          throw new Error("Session expired. Please sign in again.");
        }
        throw new Error(body.message || `Registration failed (${response.status})`);
      }

      await refreshAndSaveUserProfile(user.identityId);
      setAddress("");
      alert("EVM wallet address registered successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register address.");
    } finally {
      setIsSubmitting(false);
    }
  }, [user, isValidEvmAddress, trimmed]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-yellow-400/70 text-sm leading-relaxed">
        Put in your EVM wallet address. This will be used for NFT allowlists.
      </p>
      <input
        type="text"
        value={address}
        onChange={(e) => { setAddress(e.target.value); setError(null); }}
        placeholder="0x..."
        maxLength={42}
        className={`w-full bg-gray-800 border rounded-sm px-3 py-2 text-sm font-mono text-nasun-white placeholder:text-white/30 outline-none ${
          showValidation
            ? isValidEvmAddress
              ? "border-green-500/50"
              : "border-red-500/50"
            : "border-white/10"
        }`}
        disabled={isSubmitting}
      />
      {showValidation && !isValidEvmAddress && (
        <p className="text-red-400/70 text-sm">
          Invalid format. EVM address must start with 0x followed by 40 hex characters.
        </p>
      )}
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
      <Button
        size="sm"
        variant="filledOutlineC7"
        onClick={handleSubmit}
        disabled={!isValidEvmAddress || isSubmitting}
        className="w-full"
      >
        {isSubmitting ? "Linking..." : "Link"}
      </Button>
    </div>
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
  // Desktop or MetaMask in-app: use RainbowKit modal
  // iOS Safari: use MetaMask SDK directly (works reliably)
  // Other mobile (Android, iOS Chrome/Firefox): show manual address entry form
  const isMobile = isMobileBrowser() && !isMetaMaskInAppBrowser();
  const useIOSMetaMaskSdk = isMobile && isIOSSafari();
  const showManualEntry = isMobile && !isIOSSafari();

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
        !isMetaMaskLinked && !showManualEntry ? (
          useIOSMetaMaskSdk
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
      {!isMetaMaskLinked && showManualEntry && (
        <ManualEvmAddressForm />
      )}
      {!isMetaMaskLinked && useIOSMetaMaskSdk && (
        <p className="text-yellow-400/70 text-sm leading-relaxed">
          Requires MetaMask app. Return to this browser after each approval step.
        </p>
      )}
    </AccountItem>
  );
};
