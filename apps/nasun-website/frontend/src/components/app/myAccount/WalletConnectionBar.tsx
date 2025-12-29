/**
 * WalletConnectionBar Component
 *
 * Unified wallet connection management bar for My Account page.
 * Displays MetaMask and Nasun Wallet connection status in a single location.
 */

import { FC, useState } from "react";
import { useWallet } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useUserStore } from "../../../store/userStore";
import { useAuth } from "../../../providers/auth/AuthContext";
import { useMetaMaskConnection } from "../../../hooks/wallet/useMetaMaskConnection";
import { DashboardCard } from "../../ui/DashboardCard";
import { WalletItem } from "./WalletItem";
import { Button } from "../../ui/button";
import logger from "../../../lib/logger";

// MetaMask icon (official SVG)
const MetaMaskIcon = () => (
  <img
    src="/MetaMask_Fox.svg"
    alt="MetaMask"
    className="w-6 h-6"
  />
);

// Nasun Wallet icon (official SVG)
const NasunIcon = () => (
  <img
    src="/nasun_symbol_white.svg"
    alt="Nasun"
    className="w-6 h-6"
  />
);

interface WalletConnectionBarProps {
  className?: string;
}

export const WalletConnectionBar: FC<WalletConnectionBarProps> = ({
  className = "",
}) => {
  const [isUnlinking, setIsUnlinking] = useState(false);

  // Auth and user store
  const { user: authUser } = useAuth();
  const { user, updateUserProfile } = useUserStore();
  const ethAddress = user?.linkedAccounts?.metamask?.walletAddress;
  const isMetaMaskConnected = !!ethAddress;

  // MetaMask connect handler
  const { handleConnect: handleMetaMaskConnect, isConnecting: isMetaMaskConnecting } =
    useMetaMaskConnection({ mode: "link" });

  // Nasun Wallet connection state
  const { status: nasunStatus, account: nasunAccount, lockWallet } = useWallet();
  const isNasunConnected = nasunStatus === "unlocked" && !!nasunAccount;

  // MetaMask disconnect (unlink from account with signature verification)
  const handleMetaMaskDisconnect = async () => {
    // 1. Check if MetaMask is installed
    if (typeof window.ethereum === "undefined") {
      const installConfirm = confirm(
        "MetaMask is not installed. Would you like to install it?"
      );
      if (installConfirm) {
        window.open("https://metamask.io/download/", "_blank");
      }
      return;
    }

    // 2. Show signature warning message
    const proceedWithSignature = confirm(
      "This signature is only to verify wallet ownership.\n" +
      "No funds will be transferred.\n\n" +
      "Do you want to proceed?"
    );
    if (!proceedWithSignature) return;

    setIsUnlinking(true);
    try {
      // 3. Request MetaMask accounts
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      }) as string[];
      const address = accounts[0];

      // 4. Generate signature message
      const message = `Unlink MetaMask wallet from Nasun account.\n\nAddress: ${address}\nTimestamp: ${Date.now()}`;

      // 5. Request personal_sign
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });

      if (!signature) {
        throw new Error("Signature rejected");
      }

      // 6. Call Unlink API
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryIdentityId: authUser?.identityId,
          provider: "metamask",
        }),
      });
      if (!response.ok) throw new Error("Failed to unlink MetaMask wallet");

      // 7. Refresh user profile
      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(
        `${userProfileApi}?identityId=${authUser?.identityId}`
      );
      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
      }
      alert("MetaMask wallet unlinked successfully!");
    } catch (err: unknown) {
      logger.error("Failed to unlink MetaMask:", err);
      if (err instanceof Error) {
        if (err.message.includes("rejected") || err.message.includes("denied")) {
          alert("Signature was rejected. Wallet not unlinked.");
        } else {
          alert("Failed to unlink MetaMask wallet: " + err.message);
        }
      } else {
        alert("Failed to unlink MetaMask wallet");
      }
    } finally {
      setIsUnlinking(false);
    }
  };

  // Nasun Wallet disconnect (lock wallet)
  const handleNasunDisconnect = () => {
    if (!confirm("Lock Nasun Wallet?")) return;
    lockWallet();
  };

  return (
    <DashboardCard className={className}>
      <h5 className="uppercase text-nasun-white mb-4">
        WALLET CONNECTIONS
      </h5>
      <div className="flex flex-col gap-3">
        {/* MetaMask */}
        <WalletItem
          icon={<MetaMaskIcon />}
          name="MetaMask"
          address={ethAddress}
          isConnected={isMetaMaskConnected}
          description="For: NFT Status, Ethereum Assets"
          onConnect={handleMetaMaskConnect}
          onDisconnect={handleMetaMaskDisconnect}
          isConnecting={isMetaMaskConnecting}
          isDisconnecting={isUnlinking}
        />

        {/* Nasun Wallet */}
        <WalletItem
          icon={<NasunIcon />}
          name="Nasun Wallet"
          address={nasunAccount?.address}
          isConnected={isNasunConnected}
          description="For: Governance, Nasun Assets"
          renderConnect={<WalletConnect />}
          renderDisconnect={
            <Button
              variant="filledOutlineScarlet"
              size="xs"
              onClick={handleNasunDisconnect}
              className="w-full"
            >
              Lock Wallet
            </Button>
          }
        />
      </div>
    </DashboardCard>
  );
};

export default WalletConnectionBar;
