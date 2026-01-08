import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../layout/SectionLayout";
import { Button } from "../../ui/button";
import { useAuth } from "@/features/auth";

export const AccountDeletion = () => {
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
    <SectionLayout className="mt-8">
      <div className="p-4 border border-red-600 rounded-lg bg-red-950/40">
        <h5 className="uppercase text-red-400">
          {t("accountDeletion.title")}
        </h5>
        <p className="mt-2">
          {t("accountDeletion.description")}
        </p>
        <Button onClick={handleDeleteAccount} variant="destructive" className="mt-4">
          {t("accountDeletion.button")}
        </Button>
      </div>
    </SectionLayout>
  );
};
