import { FC } from "react";
import { AccountIcons } from "./AccountIcons";

interface AccountItemProps {
  provider: "twitter" | "google" | "metamask" | "wallet" | "nasun" | "telegram";
  identifier?: string;
  description?: string;
  statusBadge?: React.ReactNode;
  actions: React.ReactNode[];
  children?: React.ReactNode;
}

const LABELS: Record<string, string> = {
  twitter: "X (Twitter)",
  google: "Google",
  metamask: "MetaMask",
  wallet: "Wallet",
  nasun: "Nasun Wallet",
  telegram: "Telegram",
};

export const AccountItem: FC<AccountItemProps> = ({
  provider,
  identifier,
  description,
  statusBadge,
  actions,
  children,
}) => {
  return (
    <div className="flex flex-col py-3 px-4 bg-gray-800/60 rounded-sm border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/5 rounded-full">
          {AccountIcons[provider]}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-medium text-nasun-white">{LABELS[provider]}</span>
            {statusBadge}
          </div>
          <div className="text-base font-light text-nasun-white/80 truncate">{identifier || "Not linked"}</div>
          {description && (
            <div className="text-sm text-nasun-nw4 mt-0.5">{description}</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {children && <div className="mt-2 pl-11">{children}</div>}
    </div>
  );
};
