// components/DisconnectSuiButton.tsx

import { useDisconnectWallet } from "@mysten/dapp-kit";

export function DisconnectSuiButton() {
  const { mutate: disconnect } = useDisconnectWallet();

  return (
    <button
      onClick={() => disconnect()}
      className="h-8 px-3 text-sm rounded-lg-full bg-red-200 hover:text-gray-200 hover:bg-red-600 ease-in-out transition-all"
    >
      Disconnect
    </button>
  );
}
