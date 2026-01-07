import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EnterIcon, ExitIcon } from "@radix-ui/react-icons";
import { useAuth } from "../../providers/auth/AuthContext";
import MetaMaskLoginButton from "../auth/MetaMaskLoginButton";
import { DESKTOP_NAVIGATION_STYLES } from "../../utils/navigationStyles";

const LoginButton = () => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const {
    user,
    isLoading,
    isAuthenticated,
    signInWithGoogle,
    signInWithTwitter,
    signInWithMetaMask,
    logout,
  } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  // 로그인 메뉴 항목은 항상 inactive 스타일 사용 (active 상태 없음)
  const loginMenuItemClass = `${DESKTOP_NAVIGATION_STYLES.subMenuItem.base} ${DESKTOP_NAVIGATION_STYLES.subMenuItem.inactive}`;

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await logout();
      navigate("/logout");
    } catch (err) {
      console.error("Error signing out:", err);
      // 에러가 발생해도 로그아웃 페이지로 이동
      navigate("/logout");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSignIn = async (provider: "google" | "twitter") => {
    try {
      if (provider === "google") {
        await signInWithGoogle();
      } else if (provider === "twitter") {
        if (!import.meta.env.VITE_TWITTER_AUTH_API) {
          console.warn(
            "Twitter Auth API is not configured. Please set VITE_TWITTER_AUTH_API in .env"
          );
          return;
        }
        await signInWithTwitter();
      }
    } catch (error) {
      console.error(`${provider} sign-in failed:`, error);
    }
  };

  // Check if Twitter Auth is available
  const isTwitterAuthAvailable = !!import.meta.env.VITE_TWITTER_AUTH_API;

  // Check if MetaMask Auth is available
  const isMetaMaskEnabled = import.meta.env.VITE_ENABLE_METAMASK_LOGIN === "true";

  const handleMetaMaskSuccess = async (
    identityId: string,
    token: string,
    walletAddress: string
  ) => {
    try {
      console.log("MetaMask login successful:", { identityId, walletAddress });
      await signInWithMetaMask(identityId, walletAddress);
      navigate("/my-account");
    } catch (error) {
      console.error("Error saving MetaMask user data:", error);
    }
  };

  const handleMetaMaskError = (error: Error) => {
    console.error("MetaMask login error:", error);
  };

  if (isLoading) {
    return (
      <button
        disabled
        className="rounded-lg cursor-not-allowed p-2 text-nasun-black opacity-50"
      >
        Loading...
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isAuthenticated ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="rounded-lg cursor-pointer p-1 text-nasun-black hover:opacity-70 disabled:opacity-50 transition-all  "
            >
              {isSigningOut ? <div className="loading-spinner" /> : <ExitIcon className="size-5 xl:size-6" />}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content
            side="bottom"
            align="center"
            sideOffset={5}
            className="max-w-[150px] px-2 py-1 bg-gray-300 text-nasun-black/70 text-xs border border-gray-500 rounded-lg"
          >
            {user?.provider && `${user.provider} • `}
            {t("auth.logout")}
            <Tooltip.Arrow className="fill-gray-300" />
          </Tooltip.Content>
        </Tooltip.Root>
      ) : (
        <DropdownMenu.Root modal={false}>
          {/* layout shift 방지: 스크롤바 사라짐으로 인한 텍스트 이동 방지 */}
          <DropdownMenu.Trigger asChild>
            <button className="rounded-lg cursor-pointer p-1 text-nasun-black hover:opacity-70 transition-all">
              <EnterIcon className="size-5 xl:size-6" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={5}
              className="min-w-56 bg-nasun-white rounded-lg shadow-lg border border-nasun-black/20 p-1 z-[70]"
            >
            {isTwitterAuthAvailable && (
              <DropdownMenu.Item asChild>
                <button
                  onClick={() => handleSignIn("twitter")}
                  className={loginMenuItemClass}
                >
                  <img src="/X_logo_2023.svg.png" alt="X" className="w-4 h-4" />
                  {t("auth.login")} with X
                </button>
              </DropdownMenu.Item>
            )}
            {isMetaMaskEnabled && (
              <DropdownMenu.Item asChild>
                <MetaMaskLoginButton
                  className={loginMenuItemClass}
                  onSuccess={handleMetaMaskSuccess}
                  onError={handleMetaMaskError}
                />
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item asChild>
              <button
                onClick={() => handleSignIn("google")}
                className={loginMenuItemClass}
              >
                <img src="/Google__G__logo.svg" alt="Google" className="w-4 h-4" />
                {t("auth.login")} with Google
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      )}
    </div>
  );
};

export default LoginButton;
