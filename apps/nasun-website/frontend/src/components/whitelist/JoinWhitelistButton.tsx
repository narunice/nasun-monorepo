/**
 * Join Whitelist Button Component
 *
 * Genesis NFT Whitelist에 등록하는 버튼 컴포넌트
 * MetaMask 연결 → 서명 → API 호출 → 모달 표시
 */

import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { WhitelistModal } from "./WhitelistModal";
import { useWhitelistRegistration } from "../../hooks/whitelist/useWhitelistRegistration";
import type { JoinWhitelistButtonProps } from "../../types/whitelist";

/**
 * JoinWhitelistButton Component
 */
export function JoinWhitelistButton({
  className,
  variant = "white",
  size = "default",
  onSuccess,
  children,
}: JoinWhitelistButtonProps) {
  const { t } = useTranslation(["myAccount", "common"]);
  
  const {
    modalOpen,
    modalData,
    openIntroModal,
    handleModalOpenChange,
    handleProceed,
    handleWithdraw,
  } = useWhitelistRegistration(onSuccess);

  return (
    <>
      <Button onClick={openIntroModal} className={className} variant={variant} size={size}>
        {children || t("myAccount:whitelist.join")}
      </Button>

      <WhitelistModal
        open={modalOpen}
        onOpenChange={handleModalOpenChange}
        modalData={modalData}
        onWithdraw={handleWithdraw}
        onProceed={handleProceed}
      />
    </>
  );
}
