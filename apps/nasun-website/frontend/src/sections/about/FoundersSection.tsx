import React from "react";
import { useTranslation } from "react-i18next";
import TeamCard from "./TeamCard";
import { TEAM_MEMBERS } from "../../constants/pageContent/team";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionLayout } from "@/components/layout/SectionLayout";

function FoundersSection() {
  const { t } = useTranslation("team");

  return (
    <SectionLayout className="!max-w-6xl">
      <div className="flex flex-col">
        <PageTitle as="h2" align="center">
          {t("founders")}
        </PageTitle>

        {TEAM_MEMBERS.map((member) => (
          <TeamCard key={member.id} {...member} />
        ))}
      </div>
    </SectionLayout>
  );
}

export default React.memo(FoundersSection);
