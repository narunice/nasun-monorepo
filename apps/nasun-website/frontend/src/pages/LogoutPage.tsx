import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SectionLayout } from "../components/layout/SectionLayout";
import { Button } from "../components/ui/button";

const LogoutPage = () => {
  const { t } = useTranslation("common");

  return (
    <SectionLayout title="">
      <div className="flex flex-col items-center gap-6 text-center py-20 max-w-2xl mx-auto">
        <h1 className="text-4xl md:text-5xl lg:text-6xl !font-medium mb-4 text-nasun-white">
          {t("logout.successMessage")}
        </h1>

        <p className="text-lg md:text-xl mb-8">
          {t("logout.description")}
        </p>

        <Button asChild variant="default" size="lg" className="px-8 py-3">
          <Link to="/">{t("logout.backToHome")}</Link>
        </Button>
      </div>
    </SectionLayout>
  );
};

export default LogoutPage;
