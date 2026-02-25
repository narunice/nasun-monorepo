/**
 * DangerZoneCard Component
 *
 * Compact account deletion card for the Bento Grid layout.
 */

import { FC } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { OuterBox } from "@/components/ui";
import { Button } from "@/components/ui/button";

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
      if (!user?.identityId || !user?.provider) {
        throw new Error(t("error.notAuthenticated", { ns: "common" }));
      }

      const apiUrl = `${import.meta.env.VITE_DEACTIVATE_USER_API_URL}?identityId=${encodeURIComponent(
        user.identityId,
      )}&provider=${encodeURIComponent(user.provider)}`;

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

      toast.success(t("accountDeletion.success"));
      await logout();
    } catch (error) {
      console.error("Error deleting account:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(t("accountDeletion.error", { error: errorMessage }));
    }
  };

  return (
    <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h5 className="font-medium uppercase">{t("accountDeletion.title")}</h5>
          <p className="text-nasun-white/50 mt-1">{t("accountDeletion.description")}</p>
        </div>
        <Button
          onClick={handleDeleteAccount}
          variant="outlineScarlet"
          size="sm"
          className="text-red-600 whitespace-nowrap self-start sm:self-center sm:flex-shrink-0"
        >
          {t("accountDeletion.button")}
        </Button>
      </div>
    </OuterBox>
  );
};

export default DangerZoneCard;
