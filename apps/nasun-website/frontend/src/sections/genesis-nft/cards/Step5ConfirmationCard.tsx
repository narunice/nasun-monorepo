/**
 * Step 5 Confirmation Card
 *
 * @description
 * NFT Event의 다섯 번째 단계 - 입력 정보 확인 및 최종 등록
 */

import React from "react";
import { ButtonV3 } from "@/components/ui/button-v3";
import { InlineLoading, DividerBox, OuterBox } from "@/components/ui";

interface Step5ConfirmationCardProps {
  xUsername: string;
  walletAddress: string | null;
  isRegistering: boolean;
  onRegister: () => void;
  onCancel: () => void;
}

export const Step5ConfirmationCard: React.FC<Step5ConfirmationCardProps> = ({
  xUsername,
  walletAddress,
  isRegistering,
  onRegister,
  onCancel,
}) => {
  return (
    <OuterBox color="nw0" className=" max-w-3xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-6">
        <div className="flex-shrink-0 w-12 h-12 md:w-16 md:h-16 bg-nasun-nw2/20 rounded-full flex items-center justify-center">
          <svg
            className="w-8 h-8 md:w-10 md:h-10 text-nasun-nw4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <div className="text-center">
          <h4 className="!font-rubik font-medium mb-2">Review & Submit</h4>
        </div>
      </div>
      <p className="w-full mx-auto text-center mb-2">Please review your information and confirm to register.</p>
      <DividerBox color="nw3" padding="sm" className="mb-8 text-left">
        <div className="flex flex-col md:flex-row md:gap-8 space-y-4 md:space-y-0 mb-4">
          <div className="flex-1">
            <p className="mb-1 font-medium">X Account:</p>
            <p>@{xUsername}</p>
          </div>
          <div className="flex-1">
            <p className="mb-1 font-medium">Wallet Address:</p>
            <p>
              {walletAddress
                ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}`
                : "Not connected"}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-green-500">{"\u2705 All tasks verified"}</span>
        </div>
      </DividerBox>
      <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-3">
        <ButtonV3
          onClick={onCancel}
          disabled={isRegistering}
          variant="nw1"
          outline
          className="w-full sm:w-auto"
          size="lg"
        >
          Cancel
        </ButtonV3>
        <ButtonV3
          onClick={onRegister}
          disabled={isRegistering}
          variant="nw1"
          className="disabled:opacity-90 w-full sm:w-auto"
          size="lg"
        >
          {isRegistering ? (
            <InlineLoading message="Registering..." size="md" />
          ) : (
            <span>Register for Allowlist</span>
          )}
        </ButtonV3>
      </div>
    </OuterBox>
  );
};
