/**
 * WalletConnectionBar Component
 *
 * Unified wallet connection management bar for My Account page.
 * Displays MetaMask and Nasun Wallet connection status in a single location.
 */

import { FC } from "react";
import { useWallet } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useUserStore } from "../../../store/userStore";
import { useMetaMaskConnection } from "../../../hooks/wallet/useMetaMaskConnection";
import { DashboardCard } from "../../ui/DashboardCard";
import { WalletItem } from "./WalletItem";

// MetaMask icon SVG
const MetaMaskIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M21.5 4L13.5 10L15 6.5L21.5 4Z"
      fill="#E2761B"
      stroke="#E2761B"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2.5 4L10.4 10.1L9 6.5L2.5 4Z"
      fill="#E4761B"
      stroke="#E4761B"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18.5 16.5L16.5 19.5L21 20.8L22.4 16.6L18.5 16.5Z"
      fill="#E4761B"
      stroke="#E4761B"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M1.6 16.6L3 20.8L7.5 19.5L5.5 16.5L1.6 16.6Z"
      fill="#E4761B"
      stroke="#E4761B"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.3 10.8L6 12.8L10.4 13L10.2 8.3L7.3 10.8Z"
      fill="#E4761B"
      stroke="#E4761B"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16.7 10.8L13.7 8.2L13.6 13L18 12.8L16.7 10.8Z"
      fill="#E4761B"
      stroke="#E4761B"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.5 19.5L10.1 18.2L7.8 16.6L7.5 19.5Z"
      fill="#E4761B"
      stroke="#E4761B"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13.9 18.2L16.5 19.5L16.2 16.6L13.9 18.2Z"
      fill="#E4761B"
      stroke="#E4761B"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Nasun Wallet icon (using a simple diamond/gem shape)
const NasunIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2L3 9L12 22L21 9L12 2Z"
      fill="#00D4AA"
      stroke="#00D4AA"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <path
      d="M3 9H21L12 2L3 9Z"
      fill="#00B894"
      stroke="#00B894"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <path d="M12 2V22" stroke="#009B7D" strokeWidth="1" />
  </svg>
);

interface WalletConnectionBarProps {
  className?: string;
}

export const WalletConnectionBar: FC<WalletConnectionBarProps> = ({
  className = "",
}) => {
  // MetaMask connection state from userStore
  const { user } = useUserStore();
  const ethAddress = user?.linkedAccounts?.metamask?.walletAddress;
  const isMetaMaskConnected = !!ethAddress;

  // MetaMask connect handler
  const { handleConnect: handleMetaMaskConnect, isConnecting: isMetaMaskConnecting } =
    useMetaMaskConnection({ mode: "link" });

  // Nasun Wallet connection state
  const { status: nasunStatus, account: nasunAccount } = useWallet();
  const isNasunConnected = nasunStatus === "unlocked" && !!nasunAccount;

  return (
    <DashboardCard className={className}>
      <h3 className="text-sm font-medium text-nasun-white/60 uppercase tracking-wide mb-3">
        Wallet Connections
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* MetaMask */}
        <WalletItem
          icon={<MetaMaskIcon />}
          name="MetaMask"
          address={ethAddress}
          isConnected={isMetaMaskConnected}
          description="For: NFT Status, Ethereum Assets"
          onConnect={handleMetaMaskConnect}
          isConnecting={isMetaMaskConnecting}
        />

        {/* Nasun Wallet */}
        <WalletItem
          icon={<NasunIcon />}
          name="Nasun Wallet"
          address={nasunAccount?.address}
          isConnected={isNasunConnected}
          description="For: Governance, Nasun Assets"
          renderConnect={<WalletConnect />}
        />
      </div>
    </DashboardCard>
  );
};

export default WalletConnectionBar;
