import React from "react";
import { useTranslation } from "react-i18next";
import { useUserStore } from "../../store/userStore";
import { useAccountLinking } from "../../sections/myAccount/hooks/useAccountLinking";

interface AccountLinkingProps {
  onLinkSuccess?: () => void;
}

// SVG icons for each provider
const GoogleIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const TwitterIcon = () => (
  <span className="text-white text-xl font-bold">{"\u{1D54F}"}</span>
);

interface LinkedAccountCardProps {
  name: string;
  icon: React.ReactNode;
  iconBgClass: string;
  isPrimary: boolean;
  isLinked: boolean;
  detail: string | undefined;
  isLinking: boolean;
  onLink: () => void;
  onUnlink: () => void;
  linkButtonClass?: string;
  linkButtonLabel?: string;
  detailClassName?: string;
}

const LinkedAccountCard: React.FC<LinkedAccountCardProps> = ({
  name,
  icon,
  iconBgClass,
  isPrimary,
  isLinked,
  detail,
  isLinking,
  onLink,
  onUnlink,
  linkButtonClass = "bg-gray-700 text-white hover:bg-gray-600",
  linkButtonLabel = "Link",
  detailClassName = "text-sm text-gray-400",
}) => (
  <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 ${iconBgClass} rounded-full flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <p className="font-medium text-white">{name}</p>
        {detail && <p className={detailClassName}>{detail}</p>}
      </div>
    </div>
    <div>
      {isPrimary ? (
        <span className="px-3 py-1 bg-green-900 text-green-200 rounded-lg text-sm">
          Primary
        </span>
      ) : isLinked ? (
        <button
          onClick={onUnlink}
          disabled={isLinking}
          className="px-4 py-2 bg-red-900 text-red-200 rounded-lg hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLinking ? "Unlinking..." : "Unlink"}
        </button>
      ) : (
        <button
          onClick={onLink}
          disabled={isLinking}
          className={`px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${linkButtonClass}`}
        >
          {isLinking ? "Linking..." : linkButtonLabel}
        </button>
      )}
    </div>
  </div>
);

export const AccountLinking: React.FC<AccountLinkingProps> = ({ onLinkSuccess }) => {
  const { t } = useTranslation(["myAccount", "common"]);
  const user = useUserStore((state) => state.user);
  const {
    isLinking,
    error,
    handleLinkGoogle,
    handleLinkTwitter,
    unlinkAccount,
  } = useAccountLinking({ user });

  if (!user) return null;

  const hasGoogleLinked = !!user.linkedAccounts?.google;
  const hasTwitterLinked = !!user.linkedAccounts?.twitter;

  const isGooglePrimary = user.provider === "Google" && !hasGoogleLinked;
  const isTwitterPrimary = user.provider === "Twitter" && !hasTwitterLinked;

  const getGoogleDetail = () => {
    if (isGooglePrimary && user.email) return user.email;
    if (hasGoogleLinked && user.linkedAccounts?.google) {
      return user.linkedAccounts.google.email || user.linkedAccounts.google.username;
    }
    return undefined;
  };

  const getTwitterDetail = () => {
    if (isTwitterPrimary && user.twitterHandle) return `@${user.twitterHandle}`;
    if (hasTwitterLinked && user.linkedAccounts?.twitter) {
      const handle = user.linkedAccounts.twitter.twitterHandle || user.linkedAccounts.twitter.username;
      return handle ? `@${handle}` : undefined;
    }
    return undefined;
  };

  const handleUnlink = (provider: string) => {
    const confirmKey = `userInfo.confirmUnlink${provider}`;
    unlinkAccount(provider, t(confirmKey) || `Are you sure you want to unlink your ${provider} account?`);
    onLinkSuccess?.();
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Linked Accounts</h3>

      {error && (
        <div className="p-3 bg-red-900 text-red-200 rounded-lg">{error}</div>
      )}

      <div className="space-y-3">
        <LinkedAccountCard
          name="Google"
          icon={<GoogleIcon />}
          iconBgClass="bg-white"
          isPrimary={isGooglePrimary}
          isLinked={hasGoogleLinked}
          detail={getGoogleDetail()}
          isLinking={isLinking}
          onLink={handleLinkGoogle}
          onUnlink={() => handleUnlink("Google")}
        />

        <LinkedAccountCard
          name="X (Twitter)"
          icon={<TwitterIcon />}
          iconBgClass="bg-black"
          isPrimary={isTwitterPrimary}
          isLinked={hasTwitterLinked}
          detail={getTwitterDetail()}
          isLinking={isLinking}
          onLink={handleLinkTwitter}
          onUnlink={() => handleUnlink("Twitter")}
        />

        {/* Wallet linking is handled by ProfileHeroCard via useWalletAuth */}
      </div>

      <p className="text-sm text-gray-400">
        Link your social accounts to access all features and sync your profile across platforms.
      </p>
    </div>
  );
};
