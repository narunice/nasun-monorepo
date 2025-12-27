import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { Tag } from "../../ui/tag";
import { SectionLayout } from "../../layout/SectionLayout";
import {
  checkWhitelistStatus,
  joinWhitelistWithSignature,
  withdrawWhitelistWithSignature,
  WhitelistApiError,
} from "../../../services/whitelistApi";
import { Table, TableBody, TableRow, TableCell } from "../../ui/table";
import {
  signMessage,
  getMetaMaskErrorType,
  isMetaMaskInstalled,
  connectWallet,
} from "../../../utils/metamaskUtils";
import { WhitelistModal } from "../../whitelist/WhitelistModal";
import type { WhitelistModalData } from "../../../types/whitelist";
import { truncateAddress } from "../../../utils/addressUtils";

interface WhitelistStatusProps {
  walletAddress: string | null | undefined;
}

export const WhitelistStatus = ({ walletAddress }: WhitelistStatusProps) => {
  const { t } = useTranslation(["myAccount", "common"]);
  const [status, setStatus] = useState<{ registered: boolean; joinedAt?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<WhitelistModalData>({ state: "idle" });

  useEffect(() => {
    if (!walletAddress) {
      setIsLoading(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        setIsLoading(true);
        const response = await checkWhitelistStatus(walletAddress);
        setStatus(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch status");
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, [walletAddress]);

  const handleJoin = async () => {
    if (!isMetaMaskInstalled()) {
      setModalData({
        state: "error",
        error: "MetaMask is not installed.",
        errorCode: "NO_METAMASK",
      });
      setModalOpen(true);
      return;
    }
    try {
      setModalData({ state: "connecting" });
      setModalOpen(true);
      const connectedAddress = await connectWallet();
      setModalData({ state: "signing", walletAddress: connectedAddress });
      const response = await joinWhitelistWithSignature(connectedAddress, (message) =>
        signMessage(message, connectedAddress)
      );
      setModalData({
        state: "success",
        walletAddress: connectedAddress,
        joinedAt: response.data.joinedAt,
      });
      setStatus({ registered: true, joinedAt: response.data.joinedAt });
    } catch (error: unknown) {
      const metamaskErrorType = getMetaMaskErrorType(error);
      if (error instanceof WhitelistApiError) {
        setModalData({
          state: "error",
          walletAddress: modalData.walletAddress,
          error: error.message,
          errorCode: error.errorCode,
        });
      } else if (metamaskErrorType === "USER_REJECTED") {
        setModalData({
          state: "error",
          walletAddress: modalData.walletAddress,
          error: "You rejected the signature request.",
          errorCode: "USER_REJECTED",
        });
      } else {
        const errorMessage =
          error instanceof Error ? error.message : "An unexpected error occurred.";
        setModalData({
          state: "error",
          walletAddress: modalData.walletAddress,
          error: errorMessage,
          errorCode: "UNKNOWN",
        });
      }
    }
  };

  const handleWithdraw = async () => {
    if (!walletAddress) return;
    try {
      setModalData({ state: "signing", walletAddress });
      await withdrawWhitelistWithSignature(walletAddress, (message) =>
        signMessage(message, walletAddress)
      );
      alert(t("myAccount:whitelist.modal.withdrawSuccess.message"));
      setStatus({ registered: false });
      setModalOpen(false);
    } catch (error: unknown) {
      const metamaskErrorType = getMetaMaskErrorType(error);
      if (error instanceof WhitelistApiError) {
        setModalData({
          state: "error",
          walletAddress,
          error: error.message,
          errorCode: error.errorCode,
        });
      } else if (metamaskErrorType === "USER_REJECTED") {
        // Reset to previous state if user rejects
        setModalData({ state: "already_joined", walletAddress });
      } else {
        const errorMessage =
          error instanceof Error ? error.message : "An unexpected error occurred.";
        setModalData({
          state: "error",
          walletAddress,
          error: errorMessage,
          errorCode: "UNKNOWN",
        });
      }
      setModalOpen(true);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <p>{t("common:info.loading")}</p>;
    }
    if (error) {
      return <div className="p-3 bg-red-900 text-red-200 rounded-lg">{error}</div>;
    }
    if (!walletAddress) {
      return <p className="text-nasun-white/70">{t("myAccount:whitelist.connectWallet")}</p>;
    }
    if (status?.registered) {
      return (
        <>
          <Table variant="c3">
            <TableBody>
              {/* Wallet Address */}
              <TableRow variant="c3">
                <TableCell align="center" className="w-[35%]">
                  <span>{t("myAccount:whitelist.walletAddress")}</span>
                </TableCell>
                <TableCell>
                  <span className="font-mono">{truncateAddress(walletAddress)}</span>
                </TableCell>
              </TableRow>

              {/* Joined At */}
              {status.joinedAt && (
                <TableRow variant="c3">
                  <TableCell align="center" className="w-[35%]">
                    <span>{t("myAccount:whitelist.joinedAtLabel")}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-nasun-white/70">
                      {new Date(status.joinedAt).toLocaleString()}
                    </span>
                  </TableCell>
                </TableRow>
              )}

              {/* Status with Withdraw Button */}
              <TableRow variant="c3" isLast={true}>
                <TableCell align="center" className="w-[35%]">
                  <span>{t("myAccount:whitelist.statusLabel")}</span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-3 items-center">
                    <Tag variant="filledC4" size="sm">
                      {t("myAccount:whitelist.registered")}
                    </Tag>
                    <Button onClick={handleWithdraw} variant="destructive" size="sm">
                      {t("myAccount:whitelist.withdraw")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </>
      );
    }
    return (
      <div>
        <p className="text-nasun-white/70 mb-4">{t("myAccount:whitelist.notRegistered")}</p>
        <Button onClick={handleJoin} variant="c4" size="sm">
          {t("myAccount:whitelist.join")}
        </Button>
      </div>
    );
  };

  return (
    <SectionLayout title={t("myAccount:whitelist.title")} titleAs="h3">
      {renderContent()}
      <WhitelistModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        modalData={modalData}
        onWithdraw={handleWithdraw}
      />
    </SectionLayout>
  );
};
