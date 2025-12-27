import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { useNavigate } from "react-router-dom";
import CallToActionSection from "../../../ui/CallToAction";

function VisionForChangeSection() {
  const { t } = useTranslation("manifesto");
  const navigate = useNavigate();
  const handleNavigateToSale = () => {
    navigate("/founders-nft");
  };

  return (
    <SectionLayout title={t("change.title")}>
      <p className="">{t("change.description")}</p>

      <div className="grid md:grid-cols-2 gap-8 my-12">
        <div className="border rounded-lg border-gray-700 p-6">
          <h3 className="mb-3">{t("change.heading1")}</h3>
          <p className="text-gray-700">{t("change.problem")}</p>
        </div>
        <div className="border rounded-lg border-gray-700 p-6">
          <h3 className="mb-3">{t("change.heading2")}</h3>
          <p className="text-gray-700">{t("change.solution")}</p>
        </div>
      </div>

      <CallToActionSection
        title={t("call.title")}
        description={t("call.description")}
        buttonText={t("call.button")}
        onButtonClick={handleNavigateToSale}
      />
    </SectionLayout>
  );
}

export default React.memo(VisionForChangeSection);
