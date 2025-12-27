/**
 * Early Contributors Page
 *
 * @description
 * Wave 1 Campaign - Early Contributors Coming Soon 페이지
 *
 * @author Claude Code
 * @date 2025-12-01
 */

import React from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { EarlyContributorsSection } from "../../components/app/wave1/early-contributors/EarlyContributorsSection";

const EarlyContributorsPage: React.FC = () => {
  return (
    <PageLayout>
      <EarlyContributorsSection />
    </PageLayout>
  );
};

export default EarlyContributorsPage;