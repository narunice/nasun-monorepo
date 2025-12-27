import React from "react";
import { useTranslation } from "react-i18next";
import TeamCard from "./TeamCard";
import { TEAM_MEMBERS } from "../../../constants/pageContent/team";
import { PageTitle } from "../../ui/PageTitle";
import { SectionLayout } from "../../layout/SectionLayout";

function FoundersSection() {
  const { t } = useTranslation("team");

  return (
    <SectionLayout className="!max-w-7xl ">
      <PageTitle>{t("founders")}</PageTitle>

      <div className="space-y-8 md:space-y-12">
        {TEAM_MEMBERS.map((member) => (
          <TeamCard key={member.id} {...member} className="custom-class-if-needed" />
        ))}
      </div>
    </SectionLayout>
  );
}

export default React.memo(FoundersSection);
