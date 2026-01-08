// MyWalletStatus.tsx
// Simplified after IOTA removal

import { useTranslation } from "react-i18next";
import { useCurrentAccount as useCurrentSuiAccount } from "@mysten/dapp-kit";
import { ConnectSuiWallet } from "../../features/wallets/ConnectSuiWallet";
import { ConnectMetaMaskWallet } from "../../features/wallets/ConnectMetaMaskWallet";
import { SectionLayout } from "../../layout/SectionLayout";
import { useAuth } from "../../../providers/auth/AuthContext";
import { Button } from "../../ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../ui/table";

type WalletStatus = {
  chain: "SUI" | "SOLANA" | "ETHEREUM";
  status: "Connected" | "Not Connected";
  address: string | null;
  color: "green" | "red";
  connectComponent: React.ReactNode;
  disconnectComponent?: React.ReactNode;
};

export const MyWalletStatus = () => {
  const { t } = useTranslation("myAccount");

  const suiAccount = useCurrentSuiAccount();
  const { user } = useAuth();

  // Check if user is currently logged in with MetaMask
  // "Connected" means logged in WITH MetaMask, not just having it linked
  const hasMetaMaskWallet = user?.provider === "MetaMask";
  const metamaskAddress = user?.walletAddress;

  const walletStatus: WalletStatus[] = [
    {
      chain: "ETHEREUM",
      status: hasMetaMaskWallet ? "Connected" : "Not Connected",
      address: metamaskAddress || null,
      color: hasMetaMaskWallet ? "green" : "red",
      connectComponent: <ConnectMetaMaskWallet />,
    },
    {
      chain: "SUI",
      status: suiAccount ? "Connected" : "Not Connected",
      address: suiAccount?.address || null,
      color: suiAccount ? "green" : "red",
      connectComponent: <ConnectSuiWallet />,
    },
    {
      chain: "SOLANA",
      status: "Not Connected",
      address: null,
      color: "red",
      connectComponent: (
        <Button variant="outlineC3" size="sm" className="w-full md:max-w-[60%]">
          {t("myWalletStatus.notSupported")}
        </Button>
      ),
    },
  ];

  return (
    <SectionLayout title={t("myWalletStatus.myWalletStatus")} titleAs="h3">
      <Table variant="c3">
        <TableHeader variant="c3">
          <TableRow>
            <TableHead align="left">{t("myWalletStatus.chains")}</TableHead>
            <TableHead align="left">{t("myWalletStatus.status")}</TableHead>
            <TableHead align="center">{t("myWalletStatus.connectDisconnect")}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {walletStatus.map((wallet, index) => (
            <TableRow key={wallet.chain} variant="c3" isLast={index === walletStatus.length - 1}>
              <TableCell align="left">
                <span className="font-normal">{wallet.chain}</span>
              </TableCell>
              <TableCell align="left">
                <span className={wallet.color === "green" ? "text-green-400" : "text-red-400"}>
                  {t(
                    wallet.status === "Connected"
                      ? "myWalletStatus.connected"
                      : "myWalletStatus.notConnected"
                  )}
                </span>
              </TableCell>
              <TableCell align="center">
                <div className="flex justify-center">{wallet.connectComponent}</div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionLayout>
  );
};
