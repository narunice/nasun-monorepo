import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { useAuth } from "@/features/auth";
import { cn } from "@/utils/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { isMetaMaskInstalled } from "@/utils/metamaskUtils";
import { useMetaMaskConnection } from "../hooks/useMetaMaskConnection";

function MetaMaskConnectedButton({
  walletAddress,
  onDisconnect,
  isOnlyLoginMethod,
}: {
  walletAddress: string;
  onDisconnect: () => void;
  isOnlyLoginMethod: boolean;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(38)}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="default"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="w-full md:max-w-[60%] justify-between"
        >
          {formatAddress(walletAddress)}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-full p-0 mt-1 rounded-lg border bg-gray-800 shadow-sm z-50",
          "border-gray-600",
        )}
        align="end"
      >
        <Command>
          <CommandList className="max-h-[200px]">
            <CommandGroup className="p-0">
              <CommandItem
                className={cn(
                  "cursor-pointer text-sm lg:text-base px-3 py-2",
                  "hover:bg-gray-700",
                  "transition-all",
                  "data-[highlighted]:bg-gray-700",
                  "data-[highlighted]:text-white",
                )}
              >
                <Check className="mr-2 h-4 w-4 text-white opacity-100" />
                <span className="truncate text-white">{formatAddress(walletAddress)}</span>
              </CommandItem>

              <div
                className="relative"
                onMouseEnter={() => {
                  if (isOnlyLoginMethod) {
                    setShowTooltip(true);
                  }
                }}
                onMouseLeave={() => {
                  setShowTooltip(false);
                }}
              >
                <CommandItem
                  className={cn(
                    "text-sm lg:text-base px-3 py-2",
                    isOnlyLoginMethod
                      ? "opacity-50 cursor-not-allowed text-gray-500 pointer-events-none"
                      : "cursor-pointer text-white hover:bg-gray-700",
                    "transition-all",
                    !isOnlyLoginMethod && "data-[highlighted]:bg-gray-700",
                    !isOnlyLoginMethod && "data-[highlighted]:text-white",
                  )}
                  onSelect={() => {
                    if (!isOnlyLoginMethod) {
                      onDisconnect();
                      setOpen(false);
                    }
                  }}
                >
                  {t("wallet.disconnect")}
                </CommandItem>
                {showTooltip && isOnlyLoginMethod && (
                  <div className="absolute left-full top-0 ml-2 w-64 px-3 py-2 bg-gray-100 text-gray-900 text-xs rounded-lg shadow-lg z-[9999] pointer-events-none whitespace-normal">
                    {t("wallet.cannot_disconnect_only_method") ||
                      "Cannot disconnect. This is your only login method."}
                  </div>
                )}
              </div>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ConnectMetaMaskWallet() {
  const { t } = useTranslation("common");
  const { user } = useAuth();

  // Check if user is currently logged in with MetaMask
  // "Connected" means logged in WITH MetaMask, not just having it linked
  const hasMetaMaskWallet = user?.provider === "MetaMask";
  const walletAddress = user?.walletAddress;

  // Check if MetaMask is the only login method
  const isOnlyLoginMethod =
    user?.provider === "MetaMask" &&
    (!user?.linkedAccounts || Object.keys(user.linkedAccounts).length === 0);

  // Use the unified MetaMask connection hook in 'login' mode
  // MY WALLET STATUS: Login with MetaMask (change provider to "MetaMask")
  const { handleConnect, isConnecting } = useMetaMaskConnection({
    mode: "login",
    onSuccess: (address) => {
      console.log("MetaMask login successful:", address);
      alert(`Successfully logged in with MetaMask (${address.slice(0, 6)}...${address.slice(-4)})`);
    },
    onError: (error) => {
      console.error("Error logging in with MetaMask:", error);
      alert(error.message);
    },
  });

  // Wrapper to add pre-flight checks
  const handleConnectWithCheck = async () => {
    // Check 1: MetaMask installation
    if (!isMetaMaskInstalled()) {
      alert(
        t("wallet.metamask_not_installed") ||
          "MetaMask is not installed. Please install MetaMask extension.",
      );
      return;
    }

    // Proceed with connection
    await handleConnect();
  };

  const handleDisconnect = async () => {
    // Safety check - should not be called if it's the only login method
    if (isOnlyLoginMethod) {
      alert(
        t("wallet.cannot_disconnect_only_method") ||
          "Cannot disconnect. This is your only login method. Use the Logout button in the navigation bar to sign out.",
      );
      return;
    }

    if (
      !confirm(
        t("wallet.confirm_disconnect") ||
          "Are you sure you want to disconnect your MetaMask wallet?",
      )
    ) {
      return;
    }

    try {
      console.log("Disconnecting MetaMask wallet...");

      // TODO: Backend API call to remove walletAddress from user profile
      // For now, show informational message
      alert(
        t("wallet.disconnect_feature_coming_soon") ||
          "Wallet disconnect feature will be implemented soon. " +
            "For now, please use the account unlinking feature in the Account Linking section.",
      );

      /* Future implementation:
      const response = await fetch(`${import.meta.env.VITE_USER_PROFILE_API}/wallet`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId: user.identityId }),
      });

      if (response.ok) {
        // Update localStorage and state
        const updatedUser = { ...user };
        delete updatedUser.walletAddress;
        localStorage.setItem('nasun_user_profile', JSON.stringify(updatedUser));
        // Call setUser from context to update state
      }
      */
    } catch (error) {
      console.error("Error disconnecting MetaMask wallet:", error);
      alert(t("wallet.disconnect_error") || "Failed to disconnect wallet. Please try again.");
    }
  };

  if (
    !import.meta.env.VITE_ENABLE_METAMASK_LOGIN ||
    import.meta.env.VITE_ENABLE_METAMASK_LOGIN !== "true"
  ) {
    return (
      <Button variant="black" size="sm" disabled className="w-full md:max-w-[60%]">
        {t("myWalletStatus.notSupported", { ns: "myAccount" })}
      </Button>
    );
  }

  return (
    <>
      {hasMetaMaskWallet && walletAddress ? (
        <MetaMaskConnectedButton
          walletAddress={walletAddress}
          onDisconnect={handleDisconnect}
          isOnlyLoginMethod={isOnlyLoginMethod}
        />
      ) : (
        <Button
          variant="default"
          size="sm"
          onClick={handleConnectWithCheck}
          disabled={isConnecting}
          className="w-full md:max-w-[60%]"
        >
          {isConnecting
            ? t("wallet.connecting") || "Connecting..."
            : t("wallet.connect_metamask_wallet") || "Connect MetaMask"}
        </Button>
      )}
    </>
  );
}
