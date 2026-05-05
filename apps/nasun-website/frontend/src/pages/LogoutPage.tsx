import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { Link } from "react-router-dom";
import { SectionLayout } from "../components/layout/SectionLayout";
import { Button } from "../components/ui/button";

const LogoutPage = () => {
  const { t } = useTranslation("common");

  return (
    <SectionLayout title="">
      <div className="flex flex-col items-center justify-center gap-6 text-center h-full max-w-2xl mx-auto min-h-[60vh]">
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
