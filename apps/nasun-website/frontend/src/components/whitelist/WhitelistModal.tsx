/**
 * Whitelist Modal Component
 *
 * Whitelist 등록/철회 결과를 표시하는 모달
 * 각 상태별 UI는 modal-states 디렉토리의 컴포넌트들을 사용하여 렌더링합니다.
 */

import { Dialog } from "../ui/dialog";
import type { WhitelistModalProps } from "../../types/whitelist";
import {
  IntroState,
  ConnectingState,
  SigningState,
  SubmittingState,
  SuccessState,
  AlreadyJoinedState,
  AlreadyWithdrawnState,
  ErrorState,
} from "./modal-states";

export function WhitelistModal({
  open,
  onOpenChange,
  modalData,
  onWithdraw,
  onProceed,
}: WhitelistModalProps) {
  const { state, walletAddress, joinedAt, withdrawnAt, error } = modalData;

  const handleClose = () => onOpenChange(false);
  const handleProceedFn = onProceed || (() => {});
  const handleWithdrawFn = onWithdraw || (() => {});

  const renderContent = () => {
    switch (state) {
      case "intro":
        return <IntroState onClose={handleClose} onProceed={handleProceedFn} />;
      
      case "connecting":
        return <ConnectingState walletAddress={walletAddress} />;
      
      case "signing":
        return <SigningState walletAddress={walletAddress} />;
      
      case "submitting":
        return <SubmittingState walletAddress={walletAddress} />;
      
      case "success":
        return (
          <SuccessState
            walletAddress={walletAddress || ""}
            joinedAt={joinedAt}
            onClose={handleClose}
            onWithdraw={handleWithdrawFn}
          />
        );
      
      case "already_joined":
        return (
          <AlreadyJoinedState
            walletAddress={walletAddress || ""}
            joinedAt={joinedAt}
            onClose={handleClose}
            onWithdraw={handleWithdrawFn}
          />
        );
      
      case "already_withdrawn":
        return (
          <AlreadyWithdrawnState
            walletAddress={walletAddress}
            withdrawnAt={withdrawnAt}
            onClose={handleClose}
          />
        );
      
      case "error":
        return (
          <ErrorState
            error={error}
            walletAddress={walletAddress}
            onClose={handleClose}
          />
        );
      
      default:
        return null;
    }
  };

  if (state === "idle") return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {renderContent()}
    </Dialog>
  );
}
