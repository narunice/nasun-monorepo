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

  // Unlink Google handler
  const handleUnlinkGoogle = async () => {
    if (
      !confirm(
        t("userInfo.confirmUnlinkGoogle") || "Are you sure you want to unlink your Google account?"
      )
    ) {
      return;
    }

    setIsLinking(true);
    setLinkError(null);

    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          provider: "google",
        }),
      });

      if (!response.ok) {
        throw new Error(t("userInfo.unlinkGoogleError") || "Failed to unlink Google account");
      }

      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);

      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
      }

      alert(t("userInfo.unlinkGoogleSuccess") || "Google account unlinked successfully!");
    } catch (err) {
      logger.error("Failed to unlink Google account:", err);
      setLinkError(
        (err instanceof Error ? err.message : null) ||
          t("userInfo.unlinkGoogleError") ||
          "Failed to unlink Google account"
      );
    } finally {
      setIsLinking(false);
    }
  };

  // Unlink Twitter handler
  const handleUnlinkTwitter = async () => {
    if (
      !confirm(
        t("userInfo.confirmUnlinkTwitter") ||
          "Are you sure you want to unlink your Twitter account?"
      )
    ) {
      return;
    }

    setIsLinking(true);
    setLinkError(null);

    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          provider: "twitter",
        }),
      });

      if (!response.ok) {
        throw new Error(t("userInfo.unlinkTwitterError") || "Failed to unlink Twitter account");
      }

      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);

      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
      }

      alert(t("userInfo.unlinkTwitterSuccess") || "Twitter account unlinked successfully!");
    } catch (err) {
      logger.error("Failed to unlink Twitter account:", err);
      setLinkError(
        (err instanceof Error ? err.message : null) ||
          t("userInfo.unlinkTwitterError") ||
          "Failed to unlink Twitter account"
      );
    } finally {
      setIsLinking(false);
    }
  };

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
      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);

      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
      }

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
                <svg
                  className={showMetaMask ? "w-5 h-5" : "w-5 h-5 opacity-50"}
                  viewBox="0 0 318.6 318.6"
                >
                  <path fill="#E2761B" stroke="#E2761B" d="M274.1,35.5l-99.5,73.9L193,65.8z" />
                  <path
                    fill="#E4761B"
                    stroke="#E4761B"
                    d="M44.4,35.5l98.7,74.6l-17.5-44.3L44.4,35.5z M238.3,206.8l-26.5,40.6l56.7,15.6l16.3-55.3 L238.3,206.8z M33.9,207.7L50.1,263l56.7-15.6l-26.5-40.6L33.9,207.7z"
                  />
                  <path
                    fill="#E4761B"
                    stroke="#E4761B"
                    d="M103.6,138.2l-15.8,23.9l56.3,2.5l-2-60.5L103.6,138.2z M214.9,138.2l-39.2-34.8l-1.3,61.2 l56.2-2.5L214.9,138.2z M106.8,247.4l33.8-16.5l-29.2-22.8L106.8,247.4z M177.9,230.9l33.9,16.5l-4.7-39.3L177.9,230.9z"
                  />
                  <path
                    fill="#D7C1B3"
                    stroke="#D7C1B3"
                    d="M211.8,247.4l-33.9-16.5l2.7,22.1l-0.3,9.3L211.8,247.4z M106.8,247.4l31.5,14.9l-0.2-9.3 l2.5-22.1l-33.8,16.5H106.8z"
                  />
                  <path
                    fill="#233447"
                    stroke="#233447"
                    d="M138.8,193.5l-28.2-8.3l19.9-9.1L138.8,193.5z M179.7,193.5l8.3-17.4l20,9.1L179.7,193.5z"
                  />
                  <path
                    fill="#CD6116"
                    stroke="#CD6116"
                    d="M106.8,247.4l4.8-40.6l-31.3,0.9L106.8,247.4z M207.1,206.8l4.7,40.6l26.5-39.7 L207.1,206.8z M230.8,162.1l-56.2,2.5l5.2,28.9l8.3-17.4l20,9.1L230.8,162.1z M110.6,185.2l20-9.1l8.2,17.4l5.3-28.9l-56.3-2.5 L110.6,185.2z"
                  />
                  <path
                    fill="#E4751F"
                    stroke="#E4751F"
                    d="M87.8,162.1l23.6,46l-0.8-22.9L87.8,162.1z M208.1,185.2l-1,22.9l23.7-46L208.1,185.2z M144.1,164.6l-5.3,28.9l6.6,34.1l1.5-44.9L144.1,164.6z M174.6,164.6l-2.7,18l1.2,45l6.7-34.1L174.6,164.6z"
                  />
                  <path
                    fill="#F6851B"
                    stroke="#F6851B"
                    d="M179.8,193.5l-6.7,34.1l4.8,3.3l29.2-22.8l1-22.9L179.8,193.5z M110.6,185.2l0.8,22.9 l29.2,22.8l4.8-3.3l-6.6-34.1L110.6,185.2z"
                  />
                  <path
                    fill="#C0AD9E"
                    stroke="#C0AD9E"
                    d="M180.3,262.3l0.3-9.3l-2.5-2.2h-37.7l-2.3,2.2l0.2,9.3l-31.5-14.9l11,9l22.3,15.5h38.3 l22.4-15.5l11-9L180.3,262.3z"
                  />
                  <path
                    fill="#161616"
                    stroke="#161616"
                    d="M177.9,230.9l-4.8-3.3h-27.7l-4.8,3.3l-2.5,22.1l2.3-2.2h37.7l2.5,2.2L177.9,230.9z"
                  />
                  <path
                    fill="#763D16"
                    stroke="#763D16"
                    d="M278.3,114.2l8.5-40.8l-12.7-37.9l-96.2,71.4l37,31.3l52.3,15.3l11.6-13.5l-5-3.6l8-7.3 l-6.2-4.8l8-6.1L278.3,114.2z M31.8,73.4l8.5,40.8l-5.4,4l8,6.1l-6.1,4.8l8,7.3l-5,3.6l11.5,13.5l52.3-15.3l37-31.3L44.4,35.5 L31.8,73.4z"
                  />
                  <path
                    fill="#F6851B"
                    stroke="#F6851B"
                    d="M267.2,153.5l-52.3-15.3l15.9,23.9l-23.7,46l31.2-0.4h46.5L267.2,153.5z M103.6,138.2 l-52.3,15.3l-17.4,54.2h46.4l31.1,0.4l-23.6-46L103.6,138.2z M174.6,164.6l3.3-57.7l15.2-41.1h-67.5l15,41.1l3.5,57.7l1.2,18.2 l0.1,44.8h27.7l0.2-44.8L174.6,164.6z"
                  />
                </svg>
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
                <svg className={showGoogle ? "w-5 h-5" : "w-5 h-5 opacity-50"} viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
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
