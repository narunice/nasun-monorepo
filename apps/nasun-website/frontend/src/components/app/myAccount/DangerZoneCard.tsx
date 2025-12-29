/**
 * DangerZoneCard Component
 *
 * Compact account deletion card for the Bento Grid layout.
 */

import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../providers/auth/AuthContext";
import { DashboardCard } from "../../ui/DashboardCard";
import { Button } from "../../ui/button";

interface DangerZoneCardProps {
  className?: string;
}

export const DangerZoneCard: FC<DangerZoneCardProps> = ({ className = "" }) => {
  const { t } = useTranslation("myAccount");
  const { user, logout } = useAuth();

  const handleDeleteAccount = async () => {
    const confirmation = window.confirm(t("accountDeletion.confirm"));

    if (!confirmation) return;

    try {
      if (!user?.identityId) {
        throw new Error(t("error.notAuthenticated", { ns: "common" }));
      }

      const apiUrl = `${import.meta.env.VITE_DEACTIVATE_USER_API_URL}?identityId=${
        user.identityId
      }`;

      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: t("accountDeletion.error", { error: "Unknown error" }) }));
        throw new Error(errorData.message);
      }

      alert(t("accountDeletion.success"));
      await logout();
    } catch (error) {
      console.error("Error deleting account:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(t("accountDeletion.error", { error: errorMessage }));
    }
  };

  return (
    <DashboardCard variant="danger" className={className}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-red-400">
            {t("accountDeletion.title")}
          </h3>
          <p className="text-xs text-nasun-white/50 mt-1">
            {t("accountDeletion.description")}
          </p>
        </div>
        <Button onClick={handleDeleteAccount} variant="destructive" size="sm">
          {t("accountDeletion.button")}
        </Button>
      </div>
    </DashboardCard>
  );
};

export default DangerZoneCard;
