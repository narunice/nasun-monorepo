/**
 * Battalion NFT Allowlist Status Component
 *
 * @description
 * My Account 페이지에 표시되는 Battalion NFT Allowlist 등록 상태 섹션
 * User Information 섹션의 테이블 디자인 사용
 *
 * @author Claude Code
 * @date 2025-12-01
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionLoading } from "@/components/ui";
import { useBattalionNftStatus } from "../../hooks/useBattalionNftStatus";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { useBattalionNftStore } from "../../stores/useBattalionNftStore";
import { withdrawBattalionNftWithSignature } from "../../services/battalionNftApi";
import { signMessage } from "../../utils/metamaskUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { truncateAddress } from "../../utils/addressUtils";

// 브랜드 아이콘 추가
library.add(fab);

interface BattalionNftAllowlistStatusProps {
  walletAddress: string | null | undefined;
}

export const BattalionNftAllowlistStatus = ({
  walletAddress,
}: BattalionNftAllowlistStatusProps) => {
  const { t } = useTranslation(["myAccount", "common"]);
  const navigate = useNavigate();
  const { status, isRegistered, isLoading, error, refetch } = useBattalionNftStatus(walletAddress);
  const { reset } = useBattalionNftStore();
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  /**
   * Withdraw from Battalion NFT Allowlist
   * MetaMask 서명 후 Backend API 호출
   */
  const handleWithdraw = async () => {
    if (!walletAddress) {
      alert(t("myAccount:battalionNftAllowlist.connectWallet"));
      return;
    }

    if (!confirm(t("myAccount:battalionNftAllowlist.confirmWithdraw"))) {
      return;
    }

    try {
      setIsWithdrawing(true);

      console.log("[BattalionNftAllowlistStatus] Starting withdraw process for:", walletAddress);

      // MetaMask 서명 + Backend API 호출
      await withdrawBattalionNftWithSignature(walletAddress, (message) =>
        signMessage(message, walletAddress)
      );

      console.log("[BattalionNftAllowlistStatus] Withdraw successful, clearing state...");

      // Zustand store 초기화
      reset();

      // 상태 새로고침
      refetch();

      alert(t("myAccount:battalionNftAllowlist.withdrawSuccess"));
    } catch (err: unknown) {
      console.error("[BattalionNftAllowlistStatus] Withdraw error:", err);

      // 사용자 친화적인 에러 메시지 표시
      let errorMessage = t("myAccount:battalionNftAllowlist.withdrawError");

      // 타입 가드를 사용하여 안전하게 에러 속성 접근
      const errorCode = (err as { code?: string })?.code;
      const errorMsg = err instanceof Error ? err.message : undefined;

      if (errorCode === "USER_NOT_FOUND") {
        errorMessage = t("myAccount:battalionNftAllowlist.notRegistered");
      } else if (errorCode === "ALREADY_WITHDRAWN") {
        errorMessage = t("myAccount:battalionNftAllowlist.alreadyWithdrawn");
      } else if (errorCode === "INVALID_SIGNATURE" || errorCode === "SIGNATURE_EXPIRED") {
        errorMessage = t("myAccount:battalionNftAllowlist.signatureError");
      } else if (errorMsg) {
        errorMessage = errorMsg;
      }

      alert(errorMessage);
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (isLoading) {
    return (
      <SectionLayout title={t("myAccount:battalionNftAllowlist.title")} titleAs="h3">
        <SectionLoading showLayout={false} />
      </SectionLayout>
    );
  }

  if (error) {
    return (
      <SectionLayout title={t("myAccount:battalionNftAllowlist.title")} titleAs="h3">
        <div className="p-3 bg-red-900 text-red-200 rounded-lg">{error}</div>
      </SectionLayout>
    );
  }

  if (!walletAddress) {
    return (
      <SectionLayout
        title={t("myAccount:battalionNftAllowlist.title")}
        titleAs="h3"
        className="mx-auto"
      >
        <p className="text-nasun-white/70">{t("myAccount:battalionNftAllowlist.connectWallet")}</p>
      </SectionLayout>
    );
  }

  return (
    <SectionLayout
      title={t("myAccount:battalionNftAllowlist.title")}
      titleAs="h3"
      className="mx-auto"
    >
      {isRegistered && status ? (
        <>
          <Table variant="c3">
            <TableBody>
              {/* X Handle */}
              <TableRow variant="c3">
                <TableCell align="center" className="w-[35%]">
                  <div className="flex items-center justify-center gap-2">
                    <FontAwesomeIcon icon={["fab", "x-twitter"]} className="w-4 h-4" />
                    <span>{t("myAccount:battalionNftAllowlist.handle")}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono">@{status.xUsername}</span>
                </TableCell>
              </TableRow>

              {/* Wallet Address */}
              <TableRow variant="c3">
                <TableCell align="center" className="w-[35%]">
                  <span>{t("myAccount:battalionNftAllowlist.walletAddress")}</span>
                </TableCell>
                <TableCell>
                  <span className="font-mono">{truncateAddress(status.walletAddress)}</span>
                </TableCell>
              </TableRow>

              {/* Verified At */}
              <TableRow variant="c3">
                <TableCell align="center" className="w-[35%]">
                  <span>{t("myAccount:battalionNftAllowlist.verifiedAtLabel")}</span>
                </TableCell>
                <TableCell>
                  <span className="text-nasun-white/70">
                    {new Date(status.verifiedAt).toLocaleString()}
                  </span>
                </TableCell>
              </TableRow>

              {/* Status with Withdraw Button */}
              <TableRow variant="c3" isLast={true}>
                <TableCell align="center" className="w-[35%]">
                  <span>{t("myAccount:battalionNftAllowlist.status")}</span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-3 items-center">
                    <Tag variant="filledC4" size="sm">
                      {t("myAccount:battalionNftAllowlist.registered")}
                    </Tag>
                    <Button
                      onClick={handleWithdraw}
                      disabled={isWithdrawing}
                      variant="destructive"
                      size="sm"
                    >
                      {t("myAccount:battalionNftAllowlist.withdraw")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </>
      ) : (
        <div>
          <p className="text-nasun-white/70 mb-4">
            {t("myAccount:battalionNftAllowlist.notRegistered")}
          </p>
          <Button onClick={() => navigate("/wave1/battalion-nft")} variant="c4" size="sm">
            Go to Event Page
          </Button>
        </div>
      )}
    </SectionLayout>
  );
};
