import {
  ConnectModal,
  useAccounts,
  useCurrentAccount,
  useDisconnectWallet,
  useSwitchAccount,
} from "@mysten/dapp-kit";
import { formatAddress } from "@mysten/sui/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next"; // Import useTranslation

import { cn } from "../../../utils/utils";

import { Button } from "../../ui/button"; // Corrected relative path
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";

function SuiConnectedButton() {
  const { t } = useTranslation("common"); // Assuming common namespace for wallet text
  const accounts = useAccounts();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: switchAccount } = useSwitchAccount();
  const { mutateAsync: disconnect } = useDisconnectWallet();
  const [open, setOpen] = useState(false);

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
          {currentAccount ? formatAddress(currentAccount.address) : "..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-full p-0 mt-1 rounded-lg border bg-gray-800 shadow-sm z-50",
          "border-gray-600"
        )}
        align="end"
      >
        <Command>
          <CommandInput
            placeholder={t("wallet.search_accounts")}
            className={cn(
              "text-sm lg:text-base px-3 py-2",
              "bg-gray-800 text-white",
              "border-b border-gray-600 focus:ring-0 focus:outline-none"
            )}
          />

          <CommandList className="max-h-[200px]">
            <CommandEmpty className="px-2 py-3 text-sm lg:text-base text-gray-400">
              {t("wallet.no_account_found")}
            </CommandEmpty>
            <CommandGroup className="p-0">
              {accounts.map((account) => (
                <CommandItem
                  key={account.address}
                  value={account.address}
                  className={cn(
                    "cursor-pointer text-sm lg:text-base px-3 py-2",
                    "hover:bg-gray-700",
                    "transition-all",
                    "data-[highlighted]:bg-gray-700",
                    "data-[highlighted]:text-white"
                  )}
                  onSelect={() => {
                    switchAccount({ account });
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentAccount?.address === account.address
                        ? "text-white opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <span className="truncate text-white">
                    {formatAddress(account.address)}
                  </span>
                </CommandItem>
              ))}

              <CommandItem
                className={cn(
                  "cursor-pointer text-sm lg:text-base px-3 py-2",
                  "text-white hover:bg-gray-700",
                  "transition-all",
                  "data-[highlighted]:bg-gray-700",
                  "data-[highlighted]:text-white"
                )}
                onSelect={() => {
                  disconnect();
                }}
              >
                {t("wallet.disconnect")}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ConnectSuiWallet() {
  const { t } = useTranslation("common"); // Assuming common namespace
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const currentAccount = useCurrentAccount();

  return (
    <>
      {currentAccount ? (
        <SuiConnectedButton />
      ) : (
        <Button
          variant="default"
          size="sm"
          onClick={() => setConnectModalOpen(true)}
          className="w-full md:max-w-[60%]"
        >
          {t("wallet.connect_sui_wallet")}
        </Button>
      )}

      <ConnectModal
        trigger={<></>}
        open={connectModalOpen}
        onOpenChange={(open) => setConnectModalOpen(open)}
      />
    </>
  );
}
