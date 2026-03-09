/**
 * Genesis NFT Page
 *
 * @description
 * Genesis NFT 이벤트 메인 페이지
 * 6단계 프로세스를 관리하는 오케스트레이터 컴포넌트
 */

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useGenesisNftStore } from "../../stores/useGenesisNftStore";
import { StepperProgress } from "./StepperProgress";
import { Step1WelcomeCard } from "./cards/Step1WelcomeCard";
import { XAuthCard } from "./cards/Step2XAuthCard";
import { TaskVerificationCard } from "./cards/Step3TaskVerificationCard";
import { WalletConnectCard } from "./cards/Step4WalletConnectCard";
import { Step5ConfirmationCard } from "./cards/Step5ConfirmationCard";
import { RegistrationSuccessCard } from "./cards/Step6RegistrationSuccessCard";
import { WalletDisconnectedCard } from "./WalletDisconnectedCard";
import { ErrorAlert } from "./common/ErrorAlert";
import type { VerificationResult, ApiError } from "../../types/genesis-nft";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { checkGenesisNftStatus, registerUserApi } from "../../services/genesisNftApi";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";

const ERROR_MESSAGES: Record<string, string> = {
  missingInfo: "Missing required information. Please complete all previous steps.",
  registrationFailed: "Registration failed",
  registerFailed: "Failed to register. Please try again.",
  networkError: "A network error occurred. Please try again later.",
  statusCheckError: "An error occurred while checking status.",
  ALREADY_REGISTERED: "This wallet address is already registered.",
  X_ACCOUNT_ALREADY_REGISTERED: "This X account is already registered with a different wallet address.",
  INVALID_WALLET_ADDRESS: "Invalid wallet address.",
  INVALID_X_USER_ID: "Invalid X user ID.",
  INVALID_X_USERNAME: "Invalid X username.",
  MISSING_REQUIRED_FIELDS: "Missing required fields.",
  NOT_ELIGIBLE: "You are not eligible for this event.",
  TASKS_NOT_COMPLETED: "Please complete all required tasks first.",
  X_API_ERROR: "X API error. Please try again later.",
  X_API_RATE_LIMIT: "X API rate limit reached. Please try again later.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please try again later.",
  UNKNOWN_ERROR: "An unknown error occurred. Please try again.",
  INVALID_SIGNATURE: "Invalid wallet signature. Please try again.",
  SIGNATURE_EXPIRED: "Signature expired. Please try again.",
  ALREADY_MINTED: "This X account has already minted an NFT. Wallet changes are no longer allowed.",
};

export const GenesisNftPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    currentStep,
    xUserId,
    xUsername,
    walletAddress,
    walletProof,
    proofIssuedAt,
    registered,
    whitelist,
    setXAuth,
    setVerification,
    setWalletAddress,
    setRegistered,
    setStep,
    reset,
  } = useGenesisNftStore();

  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInitialMount = useRef(true);

  const isEnabled = import.meta.env.VITE_ENABLE_GENESIS_NFT === "true";

  useEffect(() => {
    if (!isEnabled) {
      console.warn(
        "[GenesisNftPage] Genesis NFT feature is disabled (VITE_ENABLE_GENESIS_NFT=false)",
      );
    }
  }, [isEnabled]);

  // Reset Genesis NFT state on initial mount only (page reload)
  useEffect(() => {
    if (!isInitialMount.current) {
      return;
    }
    isInitialMount.current = false;

    const searchParams = new URLSearchParams(window.location.search);
    const isTwitterCallback = searchParams.has("code") && searchParams.has("state");

    if (isTwitterCallback) {
      console.log(
        "[GenesisNftPage] Twitter callback in progress - skipping reset to prevent race condition",
      );
      return;
    }

    // Case 1: Logged out -> Always reset to Step 1
    if (!user) {
      if (currentStep !== 1) {
        console.warn(
          "[GenesisNftPage] Page reload: Logged out and not at Step 1 - resetting to Step 1",
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
          `[GenesisNftPage] User mismatch detected (current: ${currentXUserId}, store: ${xUserId}) - resetting store`,
        );
        reset();
        return;
      }
    }

    // Case 2.5: Wallet was unlinked but store still has walletAddress -> Reset
    const userWalletAddress = user.linkedAccounts?.metamask?.walletAddress;
    if (walletAddress && !userWalletAddress) {
      console.warn(
        `[GenesisNftPage] Wallet was unlinked but store still has address: ${walletAddress} - resetting`,
      );
      reset();
      return;
    }

    // Case 3: Logged in with MetaMask -> Check backend registration status
    if (userWalletAddress) {
      if (registered && currentStep === 6) {
        console.log("[GenesisNftPage] Already at Step 6 - skipping registration check");
        return;
      }

      console.log("[GenesisNftPage] Checking registration status for:", userWalletAddress);
      const twitterIdForLookup = user?.twitterId || user?.linkedAccounts?.twitter?.twitterId || undefined;
      checkGenesisNftStatus(userWalletAddress, twitterIdForLookup)
        .then((response) => {
          if (response.registered && response.data) {
            console.log("[GenesisNftPage] User is registered - moving to Step 6:", response.data);
            setRegistered(response.data);
          } else {
            console.log("[GenesisNftPage] User is not registered - keeping current step");
          }
        })
        .catch((error) => {
          console.error("[GenesisNftPage] Failed to check registration status:", error);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  const handleXAuthSuccess = (userId: string, username: string, identityId: string, cognitoToken?: string) => {
    trackEvent(AnalyticsEvent.NFT_X_AUTH_SUCCESS);
    setXAuth(userId, username, identityId, cognitoToken);
    setError(null);
  };

  const handleVerificationSuccess = (result: VerificationResult) => {
    console.log("[GenesisNftPage] Verification successful:", result);
    trackEvent(AnalyticsEvent.NFT_TASK_VERIFIED);
    setVerification(result);
    setError(null);
  };

  const handleWalletConnected = (address: string) => {
    console.log("[GenesisNftPage] Wallet connected:", address);
    trackEvent(AnalyticsEvent.NFT_WALLET_CONNECTED);
    setWalletAddress(address);
    setError(null);
  };

  const handleRegister = async () => {
    if (!xUserId || !xUsername || !walletAddress || !walletProof || !proofIssuedAt) {
      setError(ERROR_MESSAGES.missingInfo);
      return;
    }
    try {
      setError(null);
      setIsRegistering(true);
      trackEvent(AnalyticsEvent.NFT_REGISTER_START);
      const result = await registerUserApi({
        walletAddress: walletAddress.toLowerCase(),
        xUserId,
        xUsername,
        walletProof,
        proofIssuedAt,
      });
      if (result.success && result.whitelist) {
        if (result.whitelist.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
          console.warn("[GenesisNftPage] Register response wallet mismatch (unexpected):", {
            response: result.whitelist.walletAddress,
            current: walletAddress,
          });
        }
        trackEvent(AnalyticsEvent.NFT_REGISTER_SUCCESS);
        setRegistered(result.whitelist);
      } else if (result.success && result.registered && !result.whitelist) {
        const statusResponse = await checkGenesisNftStatus(walletAddress, xUserId || user?.twitterId || undefined);
        if (statusResponse.registered && statusResponse.data) {
          trackEvent(AnalyticsEvent.NFT_REGISTER_SUCCESS);
          setRegistered(statusResponse.data);
        } else {
          throw new Error(result.message || ERROR_MESSAGES.registrationFailed);
        }
      } else {
        throw new Error(result.message || ERROR_MESSAGES.registrationFailed);
      }
    } catch (err: unknown) {
      trackEvent(AnalyticsEvent.NFT_REGISTER_ERROR);
      const apiError = err as ApiError;
      const errorCode = apiError.code;
      const translated = errorCode ? ERROR_MESSAGES[errorCode] : null;
      setError(translated || ERROR_MESSAGES.registerFailed);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleReconnect = () => {
    console.log("[GenesisNftPage] Reconnecting wallet - returning to Step 4");
    setStep(4);
    setError(null);
  };

  const handleReconnectX = () => {
    console.log("[GenesisNftPage] X token expired - clearing tokens and returning to Step 2");
    sessionStorage.removeItem("genesis_nft_twitter_session");
    localStorage.removeItem("genesis_nft_session_id");
    localStorage.removeItem("auth_flow_type");
    setStep(2);
  };

  const handleReset = () => {
    console.log("[GenesisNftPage] Resetting Genesis NFT registration");
    reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isWalletConnected = !!walletAddress || !!user?.linkedAccounts?.metamask?.walletAddress;

  if (!isEnabled) {
    return (
      <>
        <SectionLayout>
          <div className="bg-yellow-900/20 rounded-lg p-6 border border-yellow-200">
            <p className="text-yellow-300">The NFT event feature is currently disabled. Please check back later.</p>
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
            {"GENESIS NFT"}
          </PageTitle>
          <StepperProgress currentStep={currentStep} />
        </FadeInUp>
      </SectionLayout>

      <SectionLayout className="!py-0 mb-6 md:mb-8 lg:mb-10">
        <ErrorAlert message={error} />

        <div key={currentStep} className="animate-fadeIn">
          {currentStep === 1 && <Step1WelcomeCard onStartClick={() => { trackEvent(AnalyticsEvent.NFT_STEP_START); setStep(2); }} />}

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
              onCancel={handleReset}
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
