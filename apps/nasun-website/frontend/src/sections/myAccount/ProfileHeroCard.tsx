/**
 * ProfileHeroCard Component
 *
 * Hero card for user profile display at the top of My Account dashboard.
 * Shows avatar, username, and a unified "Connected Accounts" section
 * managing both social logins and wallet connections.
 */

import { FC, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/features/auth";
import { OuterBox } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";

import { useWalletAuth } from "@/features/wallet/hooks/useWalletAuth";
import { prepareChallenge, connectVerify } from "@/services/metamaskApi";
import { connectMetaMaskSDK, signMessageViaSDK, disconnectMetaMaskSDK } from "@/lib/wallet/metamaskSdkProvider";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";
import { isMobileBrowser, isMetaMaskInAppBrowser, isIOSSafari } from "@/utils/mobileDetect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui";
import { AccountItem } from "./components/AccountItem";
import { AddWalletModal } from "./components/AddWalletModal";
import {
  ChannelMemberBadge,
  ConnectedBadge,
  GenesisPassBadge,
  LinkedBadge,
  LoggedInBadge,
} from "./components/StatusBadges";
import { useAccountLinking } from "./hooks/useAccountLinking";
import { useTelegramVerify } from "./hooks/useTelegramVerify";
import { useWalletRegistration } from "./hooks/useWalletRegistration";

/** Generate a deterministic GitHub-style identicon SVG for a wallet address. */
function generateWalletIdenticon(address: string): string {
  const clean = address.replace('0x', '').toLowerCase().padEnd(62, '0');
  const hue = parseInt(clean.slice(0, 6), 16) % 360;
  const sat = 50 + (parseInt(clean.slice(6, 8), 16) % 30);
  const light = 40 + (parseInt(clean.slice(8, 10), 16) % 20);
  const fgColor = `hsl(${hue},${sat}%,${light}%)`;
  const bgColor = `hsl(${hue},15%,12%)`;

  // 3 unique columns → mirrored to 5 columns (symmetric identicon)
  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push(parseInt(clean.slice(10 + i * 2, 12 + i * 2), 16) % 2 === 0);
  }

  const CELL = 10;
  let rects = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const idx = row * 3 + (col <= 2 ? col : 4 - col);
      if (cells[idx]) {
        rects += `<rect x="${col * CELL}" y="${row * CELL}" width="${CELL}" height="${CELL}" fill="${fgColor}"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="64" height="64"><rect width="50" height="50" fill="${bgColor}"/>${rects}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Desktop/in-app: RainbowKit modal link button. */
function EvmWalletLinkButton() {
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
        <p className="text-xs text-red-400 mt-1">{walletLinkError}</p>
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
              <p className="text-yellow-400/70 text-xs text-center leading-relaxed">
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
              <p className="text-nasun-white/40 text-xs">
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
      <p className="text-yellow-400/70 text-xs leading-relaxed">
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
        <p className="text-red-400/70 text-xs">
          Invalid format. EVM address must start with 0x followed by 40 hex characters.
        </p>
      )}
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
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
function EvmWalletSection({
  evmWalletAddress,
  isMetaMaskPrimary,
  isMetaMaskLinked,
  unlinkAccount,
  isLinking,
}: {
  evmWalletAddress: string | undefined;
  isMetaMaskPrimary: boolean;
  isMetaMaskLinked: boolean;
  unlinkAccount: (provider: string) => void;
  isLinking: boolean;
}) {
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
        <p className="text-yellow-400/70 text-xs leading-relaxed">
          Requires MetaMask app. Return to this browser after each approval step.
        </p>
      )}
    </AccountItem>
  );
}

interface ProfileHeroCardProps {
  className?: string;
}

// Helper to get login method identifier for display
interface LoginIdentifier {
  label: string;
  value: string;
}

function getLoginIdentifier(
  user: {
    provider?: string;
    email?: string;
    twitterHandle?: string;
    originalTwitterHandle?: string;
    walletAddress?: string;
  } | null,
): LoginIdentifier | null {
  if (!user) return null;

  switch (user.provider) {
    case "Google":
      return user.email ? { label: "Google", value: user.email } : null;
    case "Twitter": {
      // Use original casing if available, fallback to twitterHandle
      const displayHandle = user.originalTwitterHandle || user.twitterHandle;
      return displayHandle ? { label: "X", value: `@${displayHandle}` } : null;
    }
    case "MetaMask":
      // Legacy: existing users stored "MetaMask" as provider
      return user.walletAddress
        ? {
            label: "Wallet",
            value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
          }
        : null;
    default:
      // New wallet logins store connector.name (e.g., "Coinbase Wallet", "Rainbow")
      return user.walletAddress
        ? {
            label: "Wallet",
            value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
          }
        : null;
  }
}

export const ProfileHeroCard: FC<ProfileHeroCardProps> = ({ className = "" }) => {
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false);
  const [addWalletModalOpen, setAddWalletModalOpen] = useState(false);
  const [walletFlowActive, setWalletFlowActive] = useState(false);

  // Custom Hooks
  const { isLinking, handleLinkGoogle, handleLinkTwitter, unlinkAccount } = useAccountLinking({
    user,
  });
  const telegram = useTelegramVerify({ user });
  const walletReg = useWalletRegistration();

  // Nasun Wallet Hooks
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const isNasunConnected = (status === "unlocked" && !!account) || isZkConnected;
  // zkLogin users have no self-custody account — fall back to zkState.address
  const nasunWalletAddress = account?.address ?? zkState?.address;
  // DB-stored linked wallet address (visible even when wallet is not actively connected)
  // Priority: explicit Nasun Wallet link > legacy walletAddress (Sui only, not EVM)
  const nasunLinkedAddr = user?.linkedAccounts?.['nasun wallet']?.walletAddress;
  const legacyAddr = user?.walletAddress;
  // Sui/Nasun addresses are 66 chars (0x + 64 hex); EVM are 42 chars — filter out EVM
  const linkedWalletAddress = nasunLinkedAddr
    || (legacyAddr && legacyAddr.startsWith('0x') && legacyAddr.length === 66 ? legacyAddr : undefined);
  // Only show linked wallet if it's still in the registered wallets list.
  // After Remove or ownership transfer, the backend clears UserProfiles.walletAddress,
  // but we also guard against stale cached data on the frontend.
  const isLinkedWalletRegistered = !!linkedWalletAddress &&
    walletReg.registeredWallets.some(w => w.walletAddress === linkedWalletAddress.toLowerCase());
  // Legacy users (pre-multi-wallet) have walletAddress in UserProfiles but not in
  // USER_WALLETS_TABLE. When the backend returns an empty list, trust the DB-linked address.
  // Only hide if the backend has other wallets registered (explicit removal scenario).
  const isExplicitlyUnregistered = !walletReg.isLoading
    && walletReg.registeredWallets.length > 0
    && !isLinkedWalletRegistered;
  const hasLinkedWallet = !!linkedWalletAddress && !isNasunConnected && !isExplicitlyUnregistered;

  // Connected wallet is "dismissed" if user explicitly Removed it this session
  const isConnectedButDismissed = isNasunConnected && nasunWalletAddress &&
    !walletReg.isCurrentWalletRegistered && !walletReg.isLoading &&
    sessionStorage.getItem('nasun:dismissed-wallet') === nasunWalletAddress.toLowerCase();
  // Effective connection: connected AND (registered OR not yet dismissed)
  const showAsConnected = isNasunConnected && nasunWalletAddress && !isConnectedButDismissed;

  // Primary registered wallet: shown in AccountItem when wallet is not actively connected
  const primaryRegisteredWallet = walletReg.registeredWallets[0] ?? null;
  const displayAddress = showAsConnected
    ? nasunWalletAddress!.toLowerCase()
    : hasLinkedWallet
      ? linkedWalletAddress!.toLowerCase()
      : primaryRegisteredWallet?.walletAddress ?? null;
  const isPrimaryRegistered = !!displayAddress &&
    walletReg.registeredWallets.some(w => w.walletAddress === displayAddress);
  // Additional wallets: 2nd+ registered wallets shown in sub-section
  const additionalWallets = displayAddress
    ? walletReg.registeredWallets.filter(w => w.walletAddress !== displayAddress)
    : walletReg.registeredWallets;

  // Auto-register: when a new wallet is connected and not yet registered,
  // silently attempt registration. Errors are suppressed (409 = another user owns it).
  // Fallback "Register" button shown if auto-register didn't fire or failed.
  // 4-layer defense: ref (dedup), isLoading (remount race), sessionStorage (explicit Remove)
  const autoRegisterAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isNasunConnected || !nasunWalletAddress || !user?.cognitoToken) return;
    if (walletReg.isCurrentWalletRegistered || walletReg.isRegistering) return;
    if (autoRegisterAttemptedRef.current === nasunWalletAddress) return;
    if (walletReg.isLoading) return;
    if (!walletReg.hasSigner) return; // Wait for signer to be ready
    // Prevent stale-signer registration: after importing a second wallet, the
    // signer effect may not have run yet, leaving the OLD keypair active.
    // Signing with the wrong keypair registers the wrong address and then the
    // ref guard blocks any retry for the new address.
    if (walletReg.signerAddress?.toLowerCase() !== nasunWalletAddress.toLowerCase()) return;
    const dismissed = sessionStorage.getItem('nasun:dismissed-wallet');
    if (dismissed === nasunWalletAddress.toLowerCase()) return;
    autoRegisterAttemptedRef.current = nasunWalletAddress;
    walletReg.registerCurrentWallet().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- individual properties listed to avoid re-runs from walletReg object reference change
  }, [nasunWalletAddress, isNasunConnected, user?.cognitoToken,
      walletReg.isCurrentWalletRegistered, walletReg.isRegistering,
      walletReg.isLoading, walletReg.hasSigner, walletReg.signerAddress]);

  const handleImageError = useCallback(() => setImageError(true), []);
  const handleImageLoad = useCallback(() => setImageLoaded(true), []);

  // Display Name & Avatar
  const displayName = (() => {
    if (!user) return "User";
    // 1. X (Twitter) display name - primary or linked
    const tw = user.linkedAccounts?.twitter;
    const xDisplayName = user.provider === "Twitter"
      ? user.username
      : tw?.username;
    if (xDisplayName) return xDisplayName;

    // 2. Google email name - primary or linked
    const gl = user.linkedAccounts?.google;
    const email = user.provider === "Google" ? user.email : gl?.email;
    if (email) return email.split("@")[0];

    // 3. Wallet address fallback
    if (user.walletAddress) {
      return `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
    }
    return "User";
  })();
  const profileImageUrl = user?.profileImageUrl;

  // For Nasun Wallet users, generate a deterministic identicon from wallet address
  const walletIdenticonUrl = useMemo(() => {
    if (user?.provider === "Nasun Wallet" && user.walletAddress) {
      return generateWalletIdenticon(user.walletAddress);
    }
    return null;
  }, [user?.provider, user?.walletAddress]);

  // ------------------------------------------------------------------
  // Data Preparation
  // ------------------------------------------------------------------
  if (!user)
    return (
      <OuterBox color="c1" padding="sm" className={className}>
        Loading...
      </OuterBox>
    );

  // Providers
  const isTwitterPrimary = user.provider === "Twitter";
  const isGooglePrimary = user.provider === "Google";
  const isMetaMaskPrimary = user.provider === "MetaMask";

  // Linked Data
  const twitterData = isTwitterPrimary ? user : user.linkedAccounts?.twitter;
  const googleData = isGooglePrimary ? user : user.linkedAccounts?.google;
  const metamaskData = isMetaMaskPrimary ? user : user.linkedAccounts?.metamask;
  const isMetaMaskLinked = !!metamaskData;
  const evmWalletAddress = metamaskData?.walletAddress?.toLowerCase();

  return (
    <OuterBox color="nw1" padding="sm" className={`animate-fade-slide-up ${className}`}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {(walletIdenticonUrl || (profileImageUrl && !imageError)) ? (
              <img
                src={walletIdenticonUrl ?? profileImageUrl!}
                alt={displayName}
                className={`w-16 h-16 rounded-2xl object-cover bg-gray-800 ${
                  walletIdenticonUrl || imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                onError={handleImageError}
                onLoad={handleImageLoad}
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nasun-c4 to-nasun-c5 flex items-center justify-center text-white text-2xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h6 className="font-semibold">{displayName}</h6>
              <GenesisPassBadge />
            </div>
            {(() => {
              const loginId = getLoginIdentifier(user);
              return loginId ? (
                <p className="text-nasun-white/60">
                  <span className="text-slate-400 font-medium text-sm lg:text-base">
                    {loginId.value}
                  </span>
                </p>
              ) : null;
            })()}
          </div>
        </div>

        {/* Connected Accounts List */}
        <div>
          <h6 className="text-sm lg:text-base text-nasun-white/40 uppercase mb-1 md:mb-1 lg:mb-2">
            Connected Accounts
          </h6>
          <div className="space-y-3">
            {/* 1. Nasun Wallet */}
            <AccountItem
              provider="nasun"
              identifier={
                displayAddress
                  ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`
                  : walletReg.isLoading ? "Loading..." : "No wallet registered"
              }
              statusBadge={
                showAsConnected
                  ? <ConnectedBadge />
                  : hasLinkedWallet
                    ? <LinkedBadge />
                    : undefined
              }
              actions={
                !user.cognitoToken ? [
                  <div key="connect" className="nasun-wallet-connect relative z-50">
                    <WalletConnect
                      variant="filledOutlineC7"
                      size="sm"
                      dropdownPosition="bottom"
                      dropdownAlign="right"
                    />
                  </div>,
                ] : (isPrimaryRegistered && additionalWallets.length > 0) || hasLinkedWallet ? [
                  <button
                    key="remove-primary"
                    title="Remove"
                    className="group relative w-6 h-6 rounded-full border border-red-500/40 text-red-400/60 hover:border-red-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 flex items-center justify-center disabled:opacity-30"
                    onClick={async () => {
                      await walletReg.removeWalletByAddress(displayAddress!);
                      if (nasunWalletAddress?.toLowerCase() === displayAddress) {
                        autoRegisterAttemptedRef.current = nasunWalletAddress;
                        sessionStorage.setItem('nasun:dismissed-wallet', displayAddress!);
                      }
                    }}
                    disabled={walletReg.isRemoving === displayAddress}
                  >
                    {walletReg.isRemoving === displayAddress ? (
                      <span className="text-[10px]">...</span>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />
                      </svg>
                    )}
                  </button>,
                ] : showAsConnected && !walletReg.isCurrentWalletRegistered && !walletReg.isLoading ? [
                  walletReg.isRegistering ? (
                    <span key="registering" className="text-xs text-nasun-white/40">Registering...</span>
                  ) : (
                    <Button
                      key="register"
                      size="sm"
                      variant="filledOutlineC7"
                      onClick={() => {
                        sessionStorage.removeItem('nasun:dismissed-wallet');
                        autoRegisterAttemptedRef.current = null;
                        walletReg.registerCurrentWallet();
                      }}
                    >
                      Register
                    </Button>
                  ),
                ] : []
              }
            >
              {/* State 1: No wallets registered — show Connect Wallet prompt */}
              {/* Keep mounted while walletFlowActive to prevent unmount during backup/auto-lock steps */}
              {user.cognitoToken && (!displayAddress || walletFlowActive) && !walletReg.isLoading && (
                <div className="mb-3" onClick={() => {
                  setWalletFlowActive(true);
                  sessionStorage.removeItem('nasun:dismissed-wallet');
                  autoRegisterAttemptedRef.current = null;
                }}>
                  <div className="nasun-wallet-connect relative z-50">
                    <WalletConnect
                      variant="filledOutlineC7"
                      size="sm"
                      triggerText="Connect Wallet"
                      forceShowTriggerText
                      dropdownPosition="bottom"
                      dropdownAlign="right"
                      onDropdownClose={() => setWalletFlowActive(false)}
                    />
                  </div>
                </div>
              )}
              {/* Collapsible devnet disclaimer */}
              <div className="text-xs text-nasun-white/50">
                <button
                  className="flex items-center gap-1 hover:text-nasun-white/70 transition-colors"
                  onClick={() => setDisclaimerExpanded((v) => !v)}
                >
                  <svg
                    className={`w-3 h-3 flex-shrink-0 transition-transform ${disclaimerExpanded ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Devnet notice
                </button>
                {disclaimerExpanded && (
                  <ul className="mt-1.5 space-y-1 pl-1 text-nasun-white/40 leading-relaxed">
                    <li>· Assets on Devnet have no monetary value.</li>
                    <li>· The network may be reset at any time.</li>
                    <li>· After a reset, your existing seedphrase, private key, or backup file will restore the same address — your permanent identity on Nasun Website.</li>
                    <li>· Back up your Nasun Wallet now. Even after a Devnet reset, your backup will restore the same address. zkLogin users do not need a separate backup.</li>
                  </ul>
                )}
              </div>
            </AccountItem>

            {/* Additional Wallets sub-section */}
            {user.cognitoToken && (displayAddress || walletReg.registeredWallets.length > 0) && (
              <div className="pl-2 border-l-2 border-indigo-500/20 space-y-2">
                <div className="text-xs text-nasun-white/40 uppercase">
                  Additional Wallets
                  {walletReg.isLoading && " (loading...)"}
                </div>
                {additionalWallets.map((w) => {
                  const addr = w.walletAddress;
                  const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
                  const isCurrent = nasunWalletAddress?.toLowerCase() === addr;
                  return (
                    <div key={addr} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-nasun-white/80 font-mono truncate">{short}</span>
                        {isCurrent && <ConnectedBadge />}
                      </div>
                      <button
                        title="Remove"
                        className="group relative w-6 h-6 rounded-full border border-red-500/40 text-red-400/60 hover:border-red-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 flex items-center justify-center disabled:opacity-30"
                        onClick={async () => {
                          await walletReg.removeWalletByAddress(addr);
                          if (nasunWalletAddress?.toLowerCase() === addr) {
                            autoRegisterAttemptedRef.current = nasunWalletAddress;
                            sessionStorage.setItem('nasun:dismissed-wallet', addr);
                          }
                        }}
                        disabled={walletReg.isRemoving === addr}
                      >
                        {walletReg.isRemoving === addr ? (
                          <span className="text-[10px]">...</span>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
                {/* Connected but not registered — fallback Register button (only for addresses NOT already shown in main section) */}
                {isNasunConnected && nasunWalletAddress && !walletReg.isCurrentWalletRegistered && !walletReg.isLoading &&
                  nasunWalletAddress.toLowerCase() !== displayAddress &&
                  sessionStorage.getItem('nasun:dismissed-wallet') !== nasunWalletAddress.toLowerCase() && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-nasun-white/80 font-mono truncate">
                        {nasunWalletAddress.slice(0, 6)}...{nasunWalletAddress.slice(-4)}
                      </span>
                      <ConnectedBadge />
                    </div>
                    {walletReg.isRegistering ? (
                      <span className="text-xs text-nasun-white/40">Registering...</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="filledOutlineC7"
                        onClick={() => {
                          sessionStorage.removeItem('nasun:dismissed-wallet');
                          autoRegisterAttemptedRef.current = null;
                          walletReg.registerCurrentWallet();
                        }}
                      >
                        Register
                      </Button>
                    )}
                  </div>
                )}
                {walletReg.error && (
                  <p className="text-xs text-red-400">{walletReg.error}</p>
                )}
                <Button
                  size="sm"
                  variant="filledOutlineC7"
                  onClick={() => {
                    sessionStorage.removeItem('nasun:dismissed-wallet');
                    autoRegisterAttemptedRef.current = null;
                    setAddWalletModalOpen(true);
                  }}
                >
                  Add
                </Button>
              </div>
            )}

            {/* 2. X (Twitter) */}
            <AccountItem
              provider="twitter"
              description="Required to join the Leaderboard"
              identifier={
                twitterData?.twitterHandle
                  ? `@${twitterData.originalTwitterHandle || user.originalTwitterHandle || twitterData.twitterHandle}`
                  : undefined
              }
              statusBadge={
                isTwitterPrimary ? <LoggedInBadge /> : twitterData ? <LinkedBadge /> : undefined
              }
              actions={[
                twitterData && !isTwitterPrimary ? (
                  <Button
                    key="sync"
                    size="sm"
                    variant="filledOutlineC7"
                    onClick={() => {
                      if (confirm("Update your profile from X? You'll be briefly redirected to X.")) {
                        handleLinkTwitter();
                      }
                    }}
                    disabled={isLinking}
                  >
                    Sync
                  </Button>
                ) : null,
                !twitterData ? (
                  <Button
                    key="link"
                    size="sm"
                    variant="filledOutlineC7"
                    onClick={handleLinkTwitter}
                    disabled={isLinking}
                  >
                    Link
                  </Button>
                ) : !isTwitterPrimary ? (
                  <Button
                    key="unlink"
                    size="sm"
                    variant="filledOutlineScarlet"
                    onClick={() => unlinkAccount("Twitter")}
                    disabled={isLinking}
                  >
                    Unlink
                  </Button>
                ) : null,
              ]}
            />

            {/* 3. Google */}
            <AccountItem
              provider="google"
              description="Link to receive newsletters and updates"
              identifier={googleData?.email}
              statusBadge={
                isGooglePrimary ? <LoggedInBadge /> : googleData ? <LinkedBadge /> : undefined
              }
              actions={[
                !googleData ? (
                  <Button
                    key="link"
                    size="sm"
                    variant="filledOutlineC7"
                    onClick={handleLinkGoogle}
                    disabled={isLinking}
                  >
                    Link
                  </Button>
                ) : !isGooglePrimary ? (
                  <Button
                    key="unlink"
                    size="sm"
                    variant="filledOutlineScarlet"
                    onClick={() => unlinkAccount("Google")}
                    disabled={isLinking}
                  >
                    Unlink
                  </Button>
                ) : null,
              ]}
            />

            {/* 4. Telegram */}
            <AccountItem
              provider="telegram"
              description={telegram.isVerified ? "Nasun channel membership verified" : "Join our channel first, then verify"}
              identifier={
                telegram.isLoading
                  ? "Loading..."
                  : telegram.isVerified
                    ? telegram.telegramUsername
                      ? `@${telegram.telegramUsername}`
                      : "Verified"
                    : "Not connected"
              }
              statusBadge={telegram.isVerified ? <ChannelMemberBadge /> : undefined}
              actions={[
                !telegram.isVerified && !telegram.isLoading ? (
                  <Button key="join" size="sm" variant="filledOutlineC7" asChild>
                    <a href="https://t.me/nasun_official" target="_blank" rel="noopener noreferrer">
                      Join
                    </a>
                  </Button>
                ) : null,
                !telegram.isVerified && !telegram.isLoading ? (
                  <Button
                    key="connect"
                    size="sm"
                    variant="filledOutlineC7"
                    onClick={telegram.connect}
                    disabled={telegram.isVerifying}
                  >
                    {telegram.isVerifying ? "Verifying..." : "Verify"}
                  </Button>
                ) : null,
                telegram.isVerified ? (
                  <Button
                    key="disconnect"
                    size="sm"
                    variant="filledOutlineScarlet"
                    onClick={telegram.disconnect}
                    disabled={telegram.isDisconnecting}
                  >
                    {telegram.isDisconnecting ? "Disconnecting..." : "Disconnect"}
                  </Button>
                ) : null,
              ]}
            />

            {/* 5. EVM Wallet */}
            <EvmWalletSection
              evmWalletAddress={evmWalletAddress}
              isMetaMaskPrimary={isMetaMaskPrimary}
              isMetaMaskLinked={isMetaMaskLinked}
              unlinkAccount={unlinkAccount}
              isLinking={isLinking}
            />
          </div>
        </div>
      </div>
      <AddWalletModal
        isOpen={addWalletModalOpen}
        onClose={() => setAddWalletModalOpen(false)}
      />
    </OuterBox>
  );
};

export default ProfileHeroCard;
