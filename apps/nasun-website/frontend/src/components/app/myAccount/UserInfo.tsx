import { useTranslation } from "react-i18next";
import { useState } from "react";
import { SectionLayout } from "../../../components/layout/SectionLayout";
import { UserData, useUserStore } from "../../../store/userStore";
import logger from "../../../lib/logger";
import { InlineLoading } from "../../../components/ui";
import { Button } from "../../../components/ui/button";
import { Tag } from "../../../components/ui/tag";
import { useMetaMaskConnection } from "../../../hooks/wallet/useMetaMaskConnection";
import { Table, TableBody, TableRow, TableCell } from "../../ui/table";

type UserInfoProps = {
  user: UserData | null;
  isLoading: boolean;
  error: string | null;
};

const UserInfo = ({ user, isLoading, error }: UserInfoProps) => {
  const { t } = useTranslation(["myAccount", "common"]);
  const updateUserProfile = useUserStore((state) => state.updateUserProfile);
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Use the unified MetaMask connection hook for linking
  const { handleConnect: handleMetaMaskConnect, isConnecting: isMetaMaskConnecting } =
    useMetaMaskConnection({
      mode: "link",
      onSuccess: (address) => {
        logger.info("MetaMask wallet linked successfully:", address);
        alert(t("userInfo.linkMetaMaskSuccess") || "MetaMask wallet linked successfully!");
      },
      onError: (error) => {
        logger.error("Failed to link MetaMask account:", error);
        const errorMessage = error.message;
        if (errorMessage?.includes("User denied") || errorMessage?.includes("User rejected")) {
          setLinkError(
            t("wallet.signature_rejected", { ns: "common" }) ||
              "Signature request was rejected. Link cancelled."
          );
        } else {
          setLinkError(errorMessage || "Failed to link MetaMask account");
        }
      },
    });

  // isLoading이 true이거나 user가 null일 때 로딩 표시 (로그아웃 중 포함)
  if (isLoading || !user) {
    return (
      <SectionLayout title={t("userInfo.userInfo")} titleAs="h3">
        <InlineLoading />
      </SectionLayout>
    );
  }

  if (error) {
    return (
      <SectionLayout title={t("userInfo.userInfo")} titleAs="h3">
        <p className="text-nasun-latte">{error}</p>
      </SectionLayout>
    );
  }

  // Determine account states
  const hasGoogleLinked = !!user.linkedAccounts?.google;
  const hasTwitterLinked = !!user.linkedAccounts?.twitter;
  const hasMetaMaskLinked = !!user.linkedAccounts?.metamask;
  const isGooglePrimary = user.provider === "Google" && !hasGoogleLinked;
  const isTwitterPrimary = user.provider === "Twitter" && !hasTwitterLinked;
  const isMetaMaskPrimary = user.provider === "MetaMask" && !hasMetaMaskLinked;

  // Link Google handler
  const handleLinkGoogle = async () => {
    setIsLinking(true);
    setLinkError(null);

    try {
      const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const redirectUri = `${window.location.origin}/callback`;

      if (!googleClientId) {
        throw new Error("Google Client ID is not configured");
      }

      sessionStorage.setItem(
        "google_link_session",
        JSON.stringify({
          primaryIdentityId: user.identityId,
          isLinking: true,
        })
      );

      localStorage.setItem("auth_provider_preference", "Google");

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.append("client_id", googleClientId);
      authUrl.searchParams.append("redirect_uri", redirectUri);
      authUrl.searchParams.append("response_type", "id_token");
      authUrl.searchParams.append("scope", "openid email profile");
      authUrl.searchParams.append("nonce", Math.random().toString(36).substring(2));
      authUrl.searchParams.append("prompt", "select_account");

      window.location.href = authUrl.toString();
    } catch (err) {
      logger.error("Failed to start Google linking:", err);
      setLinkError(err instanceof Error ? err.message : "Failed to link Google account");
      setIsLinking(false);
    }
  };

  // Link Twitter handler
  const handleLinkTwitter = async () => {
    setIsLinking(true);
    setLinkError(null);

    try {
      const twitterAuthApi = import.meta.env.VITE_TWITTER_AUTH_API;
      if (!twitterAuthApi) {
        throw new Error("Twitter Auth API is not configured");
      }

      const response = await fetch(`${twitterAuthApi}/login?link=true`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to initialize Twitter OAuth");
      }

      const data = await response.json();

      sessionStorage.setItem(
        "twitter_link_session",
        JSON.stringify({
          sessionId: data.sessionId,
          state: data.state,
          primaryIdentityId: user.identityId,
        })
      );

      localStorage.setItem("auth_provider_preference", "Twitter");
      window.location.href = data.authUrl;
    } catch (err) {
      logger.error("Failed to start Twitter linking:", err);
      setLinkError(err instanceof Error ? err.message : "Failed to link Twitter account");
      setIsLinking(false);
    }
  };

  // Shared helper: refresh user profile after unlink
  const refreshUserProfile = async () => {
    const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
    const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);
    if (profileResponse.ok) {
      const updatedProfile = await profileResponse.json();
      updateUserProfile(updatedProfile);
      localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
    }
  };

  // Generic unlink handler for Google/Twitter
  const handleUnlinkProvider = async (
    provider: "google" | "twitter",
    confirmKey: Parameters<typeof t>[0],
    successKey: Parameters<typeof t>[0],
    errorKey: Parameters<typeof t>[0]
  ) => {
    if (!confirm(t(confirmKey) || `Are you sure you want to unlink your ${provider} account?`)) {
      return;
    }

    setIsLinking(true);
    setLinkError(null);

    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryIdentityId: user.identityId, provider }),
      });

      if (!response.ok) {
        throw new Error(t(errorKey) || `Failed to unlink ${provider} account`);
      }

      await refreshUserProfile();
      alert(t(successKey) || `${provider} account unlinked successfully!`);
    } catch (err) {
      logger.error(`Failed to unlink ${provider} account:`, err);
      setLinkError((err instanceof Error ? err.message : null) || t(errorKey) || `Failed to unlink ${provider} account`);
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkGoogle = () =>
    handleUnlinkProvider("google", "userInfo.confirmUnlinkGoogle", "userInfo.unlinkGoogleSuccess", "userInfo.unlinkGoogleError");

  const handleUnlinkTwitter = () =>
    handleUnlinkProvider("twitter", "userInfo.confirmUnlinkTwitter", "userInfo.unlinkTwitterSuccess", "userInfo.unlinkTwitterError");

  // Link MetaMask handler (now uses unified hook)
  const handleLinkMetaMask = async () => {
    setLinkError(null);
    await handleMetaMaskConnect();
  };

  // Unlink MetaMask handler
  const handleUnlinkMetaMask = async () => {
    if (
      !confirm(
        t("userInfo.confirmUnlinkMetaMask") ||
          "Are you sure you want to unlink your MetaMask wallet? You will need to sign a message to confirm."
      )
    ) {
      return;
    }

    setIsLinking(true);
    setLinkError(null);

    try {
      // Step 1: Get wallet address to unlink
      const walletAddress = user.linkedAccounts?.metamask?.walletAddress;
      if (!walletAddress) {
        throw new Error("No MetaMask wallet found to unlink");
      }

      // Step 2: Check MetaMask is installed and connected
      if (!window.ethereum) {
        throw new Error(
          t("wallet.metamask_not_installed", { ns: "common" }) ||
            "MetaMask is not installed. Please install MetaMask extension."
        );
      }

      // Step 3: Request challenge (nonce) from backend
      const { requestChallenge } = await import("../../../services/metamaskApi");
      const challengeResponse = await requestChallenge(walletAddress);

      // Step 4: Request signature from MetaMask
      const { signMessage } = await import("../../../utils/metamaskUtils");
      const signature = await signMessage(challengeResponse.message, walletAddress);

      // Step 5: Verify signature and unlink
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          provider: "metamask",
          walletAddress: walletAddress,
          signature: signature,
          nonce: challengeResponse.nonce,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to unlink MetaMask account");
      }

      // Step 6: Refresh user profile
      await refreshUserProfile();
      alert(t("userInfo.unlinkMetaMaskSuccess") || "MetaMask wallet unlinked successfully!");
    } catch (err) {
      logger.error("Failed to unlink MetaMask account:", err);
      const errorMessage = err instanceof Error ? err.message : null;
      if (errorMessage?.includes("User denied") || errorMessage?.includes("User rejected")) {
        setLinkError(
          t("wallet.signature_rejected", { ns: "common" }) ||
            "Signature request was rejected. Unlink cancelled."
        );
      } else {
        setLinkError(errorMessage || "Failed to unlink MetaMask account");
      }
    } finally {
      setIsLinking(false);
    }
  };

  const showGoogle = isGooglePrimary || hasGoogleLinked;
  const showTwitter = isTwitterPrimary || hasTwitterLinked;
  const showMetaMask = isMetaMaskPrimary || hasMetaMaskLinked;

  return (
    <SectionLayout
      title={t("userInfo.userInfo")}
      titleAs="h3"
      className="!mt-4 md:!mt-5 lg:!mt-6 xl:!mt-7"
    >
      {linkError && <div className="mb-4 p-3 bg-red-900 text-red-200 rounded-lg">{linkError}</div>}

      <Table variant="c3">
        <TableBody>
          {/* MetaMask Account - Always displayed */}
          <TableRow variant="c3">
            <TableCell align="center" className="w-[30%]">
              <div className="flex items-center justify-center gap-2">
                <img
                  src="/MetaMask_Fox.svg"
                  alt="MetaMask"
                  className={showMetaMask ? "w-5 h-5" : "w-5 h-5 opacity-50"}
                />
                <span className={showMetaMask ? "" : "opacity-50"}>MetaMask</span>
              </div>
            </TableCell>
            <TableCell>
              {showMetaMask ? (
                <div className="flex gap-3 items-center flex-wrap">
                  <span className="font-mono">
                    {isMetaMaskPrimary
                      ? user.walletAddress
                      : user.linkedAccounts?.metamask?.walletAddress}
                  </span>
                  {hasMetaMaskLinked && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleUnlinkMetaMask}
                      disabled={isLinking}
                    >
                      {t("userInfo.clickToUnlink")}
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  variant="c4"
                  size="sm"
                  onClick={handleLinkMetaMask}
                  disabled={isLinking || isMetaMaskConnecting}
                >
                  {isMetaMaskConnecting
                    ? t("wallet.connecting", { ns: "common" }) || "Connecting..."
                    : t("userInfo.linkMetaMaskAccount")}
                </Button>
              )}
            </TableCell>
            <TableCell align="center" className="w-[15%]">
              {isMetaMaskPrimary ? (
                <Tag variant="filledC3" size="sm">
                  {t("userInfo.currentlyLoggedIn")}
                </Tag>
              ) : hasMetaMaskLinked ? (
                <Tag variant="filledC4" size="sm">
                  {t("userInfo.linked")}
                </Tag>
              ) : null}
            </TableCell>
          </TableRow>

          {/* Twitter Account - Always displayed */}
          <TableRow variant="c3">
            <TableCell align="center" className="w-[30%]">
              <div className="flex items-center justify-center gap-2">
                <img
                  src="/X_logo_2023.svg.png"
                  alt="X (Twitter)"
                  className={`w-4 h-4 ${showTwitter ? "dark:invert" : "opacity-50 dark:invert"}`}
                />
                <span className={showTwitter ? "" : "opacity-50"}>Twitter</span>
              </div>
            </TableCell>
            <TableCell>
              {showTwitter ? (
                <div className="flex gap-3 items-center flex-wrap">
                  <span className="font-mono">
                    @
                    {isTwitterPrimary
                      ? user.twitterHandle
                      : user.linkedAccounts?.twitter?.twitterHandle}
                  </span>
                  {hasTwitterLinked && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleUnlinkTwitter}
                      disabled={isLinking}
                    >
                      {t("userInfo.clickToUnlink")}
                    </Button>
                  )}
                </div>
              ) : (
                <Button variant="c4" size="sm" onClick={handleLinkTwitter} disabled={isLinking}>
                  {t("userInfo.linkTwitterAccount")}
                </Button>
              )}
            </TableCell>
            <TableCell align="center" className="w-[15%]">
              {isTwitterPrimary ? (
                <Tag variant="filledC3" size="sm">
                  {t("userInfo.currentlyLoggedIn")}
                </Tag>
              ) : hasTwitterLinked ? (
                <Tag variant="filledC4" size="sm">
                  {t("userInfo.linked")}
                </Tag>
              ) : null}
            </TableCell>
          </TableRow>

          {/* Google Account - Always displayed */}
          <TableRow variant="c3" isLast={true}>
            <TableCell align="center" className="w-[30%]">
              <div className="flex items-center justify-center gap-2">
                <img
                  src="/Google__G__logo.svg"
                  alt="Google"
                  className={showGoogle ? "w-5 h-5" : "w-5 h-5 opacity-50"}
                />
                <span className={showGoogle ? "" : "opacity-50"}>Google</span>
              </div>
            </TableCell>
            <TableCell>
              {showGoogle ? (
                <div className="flex gap-3 items-center flex-wrap">
                  <span className="font-mono">
                    {isGooglePrimary ? user.email : user.linkedAccounts?.google?.email}
                  </span>
                  {hasGoogleLinked && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleUnlinkGoogle}
                      disabled={isLinking}
                    >
                      {t("userInfo.clickToUnlink")}
                    </Button>
                  )}
                </div>
              ) : (
                <Button variant="c4" size="sm" onClick={handleLinkGoogle} disabled={isLinking}>
                  {t("userInfo.linkGoogleAccount")}
                </Button>
              )}
            </TableCell>
            <TableCell align="center" className="w-[15%]">
              {isGooglePrimary ? (
                <Tag variant="filledC3" size="sm">
                  {t("userInfo.currentlyLoggedIn")}
                </Tag>
              ) : hasGoogleLinked ? (
                <Tag variant="filledC4" size="sm">
                  {t("userInfo.linked")}
                </Tag>
              ) : null}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </SectionLayout>
  );
};

export default UserInfo;
