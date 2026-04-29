import { useWalletAuth } from "@/features/wallet/hooks/useWalletAuth";
import { UjuButton } from "../../shared";

/** Desktop/in-app: RainbowKit modal link button for EVM wallets. */
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
    <div className="flex flex-col items-end">
      <UjuButton
        size="sm"
        variant="primary"
        onClick={handleLinkWallet}
        disabled={isWalletLinking}
      >
        {isWalletLinking ? "Linking..." : "Link Wallet"}
      </UjuButton>
      {walletLinkError && (
        <p className="text-xs text-red-400 mt-1">{walletLinkError}</p>
      )}
    </div>
  );
}
