import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SectionLayout } from "../components/layout/SectionLayout";
import { Button } from "../components/ui/button";

const LogoutPage = () => {
  const { t } = useTranslation("common");

  return (
    <SectionLayout title="">
      <div className="flex flex-col items-center gap-6 text-center py-24 max-w-2xl mx-auto">
        <h3 className=" text-nasun-white">{t("logout.successMessage")}</h3>

        <p className="text-lg md:text-xl mb-8">{t("logout.description")}</p>

        <Button asChild variant="white" size="lg" className="px-8 py-3">
          <Link to="/">{t("logout.backToHome")}</Link>
        </Button>
      </div>
    </SectionLayout>
  );
};

export default LogoutPage;
