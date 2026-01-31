/**
 * Battalion NFT Page
 *
 * @description
 * Wave 1 Battalion NFT Free Mint 이벤트 메인 페이지
 * 6단계 프로세스를 관리하는 오케스트레이터 컴포넌트
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useBattalionNftStore } from "../../../stores/useBattalionNftStore";
import { useBattalionNftRegistration } from "../../../hooks/useBattalionNftRegistration";
import { StepperProgress } from "./StepperProgress";
import { Step1WelcomeCard } from "./cards/Step1WelcomeCard";
import { XAuthCard } from "./cards/Step2XAuthCard";
import { TaskVerificationCard } from "./cards/Step3TaskVerificationCard";
import { WalletConnectCard } from "./cards/Step4WalletConnectCard";
import { Step5ConfirmationCard } from "./cards/Step5ConfirmationCard";
import { RegistrationSuccessCard } from "./cards/Step6RegistrationSuccessCard";
import { WalletDisconnectedCard } from "./WalletDisconnectedCard";
import { ErrorAlert } from "./common/ErrorAlert";
import type { VerificationResult, ApiError } from "../../../types/battalion-nft";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { checkBattalionNftStatus } from "../../../services/battalionNftApi";
import { FadeInUp } from "@/components/ui/FadeInUp";

export const BattalionNftPage: React.FC = () => {
  const { t } = useTranslation("battalion-nft");
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    currentStep,
    xUserId,
    xUsername,
    walletAddress,
    registered,
    whitelist,
    setXAuth,
    setVerification,
    setWalletAddress,
    setRegistered,
    setStep,
    reset,
  } = useBattalionNftStore();

  const {
    register,
    isLoading: isRegistering,
    error: registrationError,
  } = useBattalionNftRegistration();

  const [error, setError] = useState<string | null>(null);
  const isInitialMount = useRef(true);

  const isEnabled = import.meta.env.VITE_ENABLE_BATTALION_NFT === "true";

  useEffect(() => {
    if (!isEnabled) {
      console.warn(
        "[BattalionNftPage] Battalion NFT feature is disabled (VITE_ENABLE_BATTALION_NFT=false)",
      );
    }
  }, [isEnabled]);

  // Reset Battalion NFT state on initial mount only (page reload)
  useEffect(() => {
    // Only run on initial mount (page reload), not on re-renders
    if (!isInitialMount.current) {
      return;
    }
    isInitialMount.current = false;

    // Check if Twitter callback is in progress
    const searchParams = new URLSearchParams(window.location.search);
    const isTwitterCallback = searchParams.has("code") && searchParams.has("state");

    // Twitter callback 처리 중이면 reset 건너뛰기 (race condition 방지)
    if (isTwitterCallback) {
      console.log(
        "[BattalionNftPage] Twitter callback in progress - skipping reset to prevent race condition",
      );
      return;
    }

    // Case 1: Logged out -> Reset to Step 1 (except Step 6 completed)
    if (!user) {
      // If Step 6 is completed (registered), keep the data
      if (registered && currentStep === 6) {
        console.log("[BattalionNftPage] Logged out but Step 6 completed - keeping data");
        return;
      }

      // Otherwise, reset to Step 1 if not already at Step 1
      if (currentStep !== 1) {
        console.warn(
          "[BattalionNftPage] Page reload: Logged out and not at Step 1 - resetting to Step 1",
        );
        reset();
      }
      return;
    }

    // Case 2: Logged in but Store data belongs to a different user -> Reset
    if (user && xUserId) {
      const currentXUserId =
        user?.provider === "Twitter" ? user.twitterId : user?.linkedAccounts?.twitter?.twitterId;

      if (currentXUserId && currentXUserId !== xUserId) {
        console.warn(
          `[BattalionNftPage] User mismatch detected (current: ${currentXUserId}, store: ${xUserId}) - resetting store`,
        );
        reset();
        return;
      }
    }

    // Case 2.5: Wallet was unlinked but store still has walletAddress -> Reset
    const userWalletAddress = user.linkedAccounts?.metamask?.walletAddress;
    if (walletAddress && !userWalletAddress) {
      console.warn(
        `[BattalionNftPage] Wallet was unlinked but store still has address: ${walletAddress} - resetting`,
      );
      reset();
      return;
    }

    // Case 3: Logged in with MetaMask -> Check backend registration status
    if (userWalletAddress) {
      // Skip if already at Step 6 (registered)
      if (registered && currentStep === 6) {
        console.log("[BattalionNftPage] Already at Step 6 - skipping registration check");
        return;
      }

      // Check registration status from backend (only on initial page load)
      console.log("[BattalionNftPage] Checking registration status for:", userWalletAddress);
      checkBattalionNftStatus(userWalletAddress)
        .then((response) => {
          if (response.registered && response.data) {
            console.log("[BattalionNftPage] User is registered - moving to Step 6:", response.data);
            setRegistered(response.data);
          } else {
            console.log("[BattalionNftPage] User is not registered - keeping current step");
            // ✅ Do NOT reset here - let user progress through steps normally
          }
        })
        .catch((error) => {
          console.error("[BattalionNftPage] Failed to check registration status:", error);
          // On error, just log and continue - don't reset
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WITHDRAWN status 제거로 인해 해당 useEffect 삭제됨 (Hard Delete 방식으로 변경)

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  const handleXAuthSuccess = (userId: string, username: string) => {
    setXAuth(userId, username);
    setError(null);
  };

  const handleVerificationSuccess = (result: VerificationResult) => {
    console.log("[BattalionNftPage] Verification successful:", result);
    setVerification(result);

    // ✅ Task Verification 완료 시 토큰 삭제 (더 이상 필요 없음)
    console.log("[BattalionNftPage] Task verification completed - deleting xAccessToken");
    sessionStorage.removeItem("battalion_nft_x_access_token");

    setError(null);
  };

  const handleWalletConnected = (address: string) => {
    // WalletConnectCard에서 이미 link 완료했으므로 바로 진행
    console.log("[BattalionNftPage] Wallet connected:", address);
    setWalletAddress(address);
    setError(null);
  };

  const handleRegister = async () => {
    if (!xUserId || !xUsername || !walletAddress) {
      setError(t("errors.missingInfo"));
      return;
    }
    try {
      setError(null);
      const result = await register({ walletAddress, xUserId, xUsername });
      if (result.success && result.whitelist) {
        setRegistered(result.whitelist);
      } else {
        throw new Error(result.message || t("errors.registrationFailed"));
      }
    } catch (err: unknown) {
      const apiError = err as ApiError;
      setError(apiError.message || t("errors.registerFailed"));
    }
  };

  const handleReconnect = () => {
    console.log("[BattalionNftPage] Redirecting to My Account for wallet reconnection");
    navigate("/my-account");
  };

  const handleReconnectX = () => {
    console.log("[BattalionNftPage] X token expired - clearing tokens and returning to Step 2");
    sessionStorage.removeItem("battalion_nft_x_access_token");
    sessionStorage.removeItem("battalion_nft_twitter_session");
    setStep(2);
  };

  const handleReset = () => {
    console.log("[BattalionNftPage] Resetting Battalion NFT registration");
    reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Check if wallet is connected
  const isWalletConnected = !!user?.linkedAccounts?.metamask?.walletAddress;

  if (!isEnabled) {
    return (
      <>
        <SectionLayout>
          <div className="bg-yellow-900/20 rounded-lg p-6 border border-yellow-200">
            <p className="text-yellow-300">{t("featureDisabled.description")}</p>
          </div>
        </SectionLayout>
      </>
    );
  }

  return (
    <>
      <SectionLayout>
        <FadeInUp>
          <PageTitle as="h2" align="center" className="mb-6">
            {t("header.title").toUpperCase()}
          </PageTitle>
          <StepperProgress currentStep={currentStep} />
        </FadeInUp>
      </SectionLayout>

      <SectionLayout className="!py-0 mb-6 md:mb-8 lg:mb-10">
        <ErrorAlert message={error} />
        <ErrorAlert message={registrationError?.message || null} />

        <div className="">
          {currentStep === 1 && <Step1WelcomeCard onStartClick={() => setStep(2)} />}

          {currentStep === 2 && <XAuthCard onAuthSuccess={handleXAuthSuccess} />}
          {currentStep === 3 && xUserId && xUsername && (
            <TaskVerificationCard
              xUserId={xUserId}
              xUsername={xUsername}
              walletAddress={walletAddress}
              onVerificationSuccess={handleVerificationSuccess}
              onReconnectX={handleReconnectX}
            />
          )}
          {currentStep === 4 && <WalletConnectCard onWalletConnected={handleWalletConnected} />}
          {currentStep === 5 && (
            <Step5ConfirmationCard
              xUsername={xUsername || ""}
              walletAddress={walletAddress || null}
              isRegistering={isRegistering}
              onRegister={handleRegister}
            />
          )}
          {currentStep === 6 && registered && whitelist && (
            <>
              {!isWalletConnected ? (
                <WalletDisconnectedCard
                  onReconnectClick={handleReconnect}
                  onResetClick={handleReset}
                />
              ) : (
                <RegistrationSuccessCard
                  whitelist={whitelist}
                  isWalletConnected={isWalletConnected}
                />
              )}
            </>
          )}
        </div>
      </SectionLayout>
    </>
  );
};
