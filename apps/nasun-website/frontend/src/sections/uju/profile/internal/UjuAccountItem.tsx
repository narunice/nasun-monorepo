import { FC } from "react";
import { UjuAccountIcons } from "./UjuAccountIcons";

interface UjuAccountItemProps {
  provider: "twitter" | "google" | "metamask" | "wallet" | "nasun" | "telegram";
  identifier?: string;
  description?: string;
  statusBadge?: React.ReactNode;
  actions: React.ReactNode[];
  children?: React.ReactNode;
}

const UJU_LABELS: Record<string, string> = {
  twitter: "X (Twitter)",
  google: "Google",
  metamask: "MetaMask",
  wallet: "Wallet",
  nasun: "Nasun Wallet",
  telegram: "Telegram",
};

export const UjuAccountItem: FC<UjuAccountItemProps> = ({
  provider,
  identifier,
  description,
  statusBadge,
  actions,
  children,
}) => {
  return (
    <div className="flex flex-col p-5 bg-uju-bg/40 rounded-2xl border border-uju-border/20 hover:border-pado-2/30 transition-all duration-200">
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-uju-bg/60 rounded-xl border border-uju-border/20 shadow-inner">
          {UjuAccountIcons[provider]}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-base font-bold text-uju-primary">{UJU_LABELS[provider]}</span>
            {statusBadge}
          </div>
          <div className="text-sm font-medium text-uju-secondary truncate">{identifier || "Not linked"}</div>
          {description && (
            <div className="text-xs text-uju-secondary/60 font-medium mt-1">{description}</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {children && (
        <div className="mt-4 pt-4 pl-14 border-t border-uju-border/10">
          {children}
        </div>
      )}
    </div>
  );
};
