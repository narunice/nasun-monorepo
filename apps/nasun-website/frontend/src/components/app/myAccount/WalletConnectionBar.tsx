/**
 * WalletConnectionBar Component
 *
 * Unified wallet connection management bar for My Account page.
 * Displays MetaMask and Nasun Wallet connection status in a single location.
 *
 * IMPORTANT: MetaMask connection here is SESSION-ONLY for NFT verification.
 * Account linking (DB operations) is handled in ProfileHeroCard.
 */

import { FC, useState, useEffect } from "react";
import { useWallet } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useUserStore } from "../../../store/userStore";
import { useMetaMaskConnection } from "../../../hooks/wallet/useMetaMaskConnection";
import { isMetaMaskInstalled, connectWallet } from "../../../utils/metamaskUtils";
import { DashboardCard } from "../../ui/DashboardCard";
import { WalletItem } from "./WalletItem";
import { Button } from "../../ui/button";

// MetaMask icon (official SVG)
const MetaMaskIcon = () => <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />;

// Nasun Wallet icon (official SVG)
const NasunIcon = () => <img src="/nasun_symbol_white.svg" alt="Nasun" className="w-6 h-6" />;

// Helper to shorten address
const shortenAddress = (address: string): string => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// localStorage key for session persistence
const METAMASK_SESSION_KEY = "nasun_metamask_session";

interface WalletConnectionBarProps {
  className?: string;
}

export const WalletConnectionBar: FC<WalletConnectionBarProps> = ({ className = "" }) => {
  // Session state for MetaMask connection (NOT linked to DB)
  const [sessionEthAddress, setSessionEthAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // User store - registered address from User Info (AWS Cognito DB)
  const { user } = useUserStore();
  const registeredEthAddress = user?.linkedAccounts?.metamask?.walletAddress;

  // MetaMask link hook for auto-linking when no wallet is registered
  const { handleConnect: linkMetaMask, isConnecting: isLinking } = useMetaMaskConnection({
    mode: "link",
    onSuccess: (address) => {
      // After successful link, also set up session
      setSessionEthAddress(address.toLowerCase());
      localStorage.setItem(METAMASK_SESSION_KEY, address.toLowerCase());
      alert("MetaMask wallet has been linked to your profile and connected.");
    },
    onError: (error) => {
      if (!error.message.includes("rejected") && !error.message.includes("denied")) {
        alert("Failed to link MetaMask: " + error.message);
      }
    },
  });

  // MetaMask connection status (session-based)
  const isMetaMaskConnected = !!sessionEthAddress;

  // Nasun Wallet connection state
  const { status: nasunStatus, account: nasunAccount, lockWallet, deleteWallet } = useWallet();
  const isNasunConnected = nasunStatus === "unlocked" && !!nasunAccount;

  // Restore session on mount
  useEffect(() => {
    const savedSession = localStorage.getItem(METAMASK_SESSION_KEY);
    if (savedSession && registeredEthAddress) {
      // Only restore if saved session matches registered address
      if (savedSession.toLowerCase() === registeredEthAddress.toLowerCase()) {
        setSessionEthAddress(savedSession);
      } else {
        // Mismatch - clear invalid session
        localStorage.removeItem(METAMASK_SESSION_KEY);
      }
    }
  }, [registeredEthAddress]);

  // Clear session if registered address is removed (unlinked from User Info)
  useEffect(() => {
    if (!registeredEthAddress && sessionEthAddress) {
      setSessionEthAddress(null);
      localStorage.removeItem(METAMASK_SESSION_KEY);
    }
  }, [registeredEthAddress, sessionEthAddress]);

  /**
   * MetaMask Connect Handler
   *
   * Flow:
   * 1. If no wallet registered in profile → auto-link via useMetaMaskConnection hook
   * 2. If wallet registered but different address connected → show error
   * 3. If wallet registered and same address connected → session connect with signature
   */
  const handleMetaMaskConnect = async () => {
    // 1. Check if MetaMask is installed
    if (!isMetaMaskInstalled()) {
      const installConfirm = confirm("MetaMask is not installed.\n\nWould you like to install it?");
      if (installConfirm) {
        window.open("https://metamask.io/download/", "_blank");
      }
      return;
    }

    // 2. If no wallet registered in profile → auto-link
    if (!registeredEthAddress) {
      // First connect to get the address
      try {
        const address = await connectWallet();
        const normalizedAddress = address.toLowerCase();

        // Ask user if they want to link this wallet
        const confirmLink = confirm(
          `No MetaMask wallet is linked to your profile.\n\n` +
            `Would you like to link wallet ${shortenAddress(normalizedAddress)}?\n\n` +
            `This will:\n` +
            `• Link this wallet to your profile\n` +
            `• Connect it for this session`
        );

        if (!confirmLink) {
          return;
        }

        // Use the link hook to perform Challenge-Response auth and link
        await linkMetaMask();
        return;
      } catch (err) {
        if (err instanceof Error) {
          if (!err.message.includes("rejected") && !err.message.includes("denied")) {
            alert("Failed to connect MetaMask: " + err.message);
          }
        }
        return;
      }
    }

    // 3. Wallet is registered - proceed with session connection
    setIsConnecting(true);
    try {
      // Request MetaMask accounts
      const accounts = (await window.ethereum!.request({
        method: "eth_requestAccounts",
      })) as string[];
      const connectedAddress = accounts[0].toLowerCase();

      // 4. Validate address matches registered address
      if (connectedAddress !== registeredEthAddress.toLowerCase()) {
        alert(
          `The connected wallet does not match the wallet linked to your profile.\n\n` +
            `Profile wallet: ${shortenAddress(registeredEthAddress)}\n` +
            `Connected wallet: ${shortenAddress(connectedAddress)}\n\n` +
            `Please switch to the correct account in MetaMask.`
        );
        return;
      }

      // 5. Request signature to verify wallet ownership
      const message = `Nasun Wallet Verification

✅ NO funds will be transferred
✅ NO transaction will be executed
✅ This only verifies wallet ownership
✅ This is a SIGNATURE request only

Address: ${connectedAddress}
Timestamp: ${Date.now()}`;

      // Convert message to hex for personal_sign
      const messageHex =
        "0x" +
        Array.from(new TextEncoder().encode(message))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      const signature = (await window.ethereum!.request({
        method: "personal_sign",
        params: [messageHex, connectedAddress],
      })) as string;

      if (!signature) {
        throw new Error("Signature rejected");
      }

      // 6. Save session (signature verified)
      setSessionEthAddress(connectedAddress);
      localStorage.setItem(METAMASK_SESSION_KEY, connectedAddress);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("rejected") || err.message.includes("denied")) {
          // User rejected - do nothing
        } else {
          alert("Failed to connect MetaMask: " + err.message);
        }
      }
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * MetaMask Disconnect Handler (Session Only)
   *
   * This only clears the browser session.
   * It does NOT unlink the wallet from the user account (that's done in ProfileHeroCard).
   */
  const handleMetaMaskDisconnect = () => {
    setSessionEthAddress(null);
    localStorage.removeItem(METAMASK_SESSION_KEY);
  };

  // Nasun Wallet lock (preserves encrypted data)
  const handleLockWallet = () => {
    if (!confirm("Lock Nasun Wallet?\n\nYou can unlock it later with your password.")) return;
    lockWallet();
  };

  // Nasun Wallet delete (permanent)
  const handleDeleteWallet = () => {
    const confirmed = confirm(
      "⚠️ Delete Nasun Wallet?\n\n" +
        "This will permanently delete your wallet data.\n" +
        "Make sure you have backed up your recovery phrase!\n\n" +
        "This action cannot be undone."
    );
    if (!confirmed) return;

    deleteWallet();
    alert("Wallet deleted successfully.");
  };

  return (
    <DashboardCard className={className}>
      <h5 className="uppercase text-nasun-white mb-4">WALLET CONNECTIONS</h5>
      <div className="flex flex-col gap-3">
        {/* MetaMask - Session connection for NFT verification */}
        <WalletItem
          icon={<MetaMaskIcon />}
          name="MetaMask"
          nameExtra={
            <Tooltip.Provider delayDuration={200}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button className="text-nasun-white/50 hover:text-nasun-white/80 transition-colors">
                    <InfoCircledIcon className="w-4 h-4" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="max-w-[280px] px-3 py-2 bg-gray-300 text-nasun-black/70 text-xs border border-gray-500 rounded-lg shadow-lg z-50"
                    side="top"
                    sideOffset={5}
                  >
                    MetaMask verification is required to register your address for NFT drop
                    allowlists or to verify membership NFT ownership for voting power bonus.
                    <Tooltip.Arrow className="fill-gray-300" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          }
          address={sessionEthAddress || undefined}
          isConnected={isMetaMaskConnected}
          onConnect={handleMetaMaskConnect}
          onDisconnect={handleMetaMaskDisconnect}
          isConnecting={isConnecting || isLinking}
        />

        {/* Nasun Wallet */}
        <WalletItem
          icon={<NasunIcon />}
          name="Nasun Wallet"
          nameExtra={
            <Tooltip.Provider delayDuration={200}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button className="text-nasun-white/50 hover:text-nasun-white/80 transition-colors">
                    <InfoCircledIcon className="w-4 h-4" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="max-w-[280px] px-3 py-2 bg-gray-300 text-nasun-black/70 text-xs border border-gray-500 rounded-lg shadow-lg z-50"
                    side="top"
                    sideOffset={5}
                  >
                    Nasun Wallet is required to participate in governance voting or test the Pado prototype. Nasun is currently on devnet and may be reset without notice.
                    <Tooltip.Arrow className="fill-gray-300" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          }
          address={nasunAccount?.address}
          isConnected={isNasunConnected}
          renderConnect={<WalletConnect />}
          renderDisconnect={
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="filledOutlineScarlet" size="sm" className="w-full">
                  Manage ▼
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[180px] bg-nasun-c6 border border-nasun-c5/50 rounded-lg p-1 shadow-lg z-50"
                  sideOffset={5}
                >
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-sm text-nasun-white rounded cursor-pointer outline-none hover:bg-nasun-c5/30 focus:bg-nasun-c5/30"
                    onClick={handleLockWallet}
                  >
                    🔒 Lock Wallet
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-nasun-c5/30 my-1" />
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 rounded cursor-pointer outline-none hover:bg-red-950/30 focus:bg-red-950/30"
                    onClick={handleDeleteWallet}
                  >
                    🗑️ Delete Wallet
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          }
        />
      </div>
    </DashboardCard>
  );
};

export default WalletConnectionBar;
