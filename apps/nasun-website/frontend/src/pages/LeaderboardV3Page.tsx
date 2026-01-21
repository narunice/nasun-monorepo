/**
 * Leaderboard V3 Page
 *
 * Public page displaying the community engagement leaderboard.
 */

import { Suspense } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import ErrorBoundary from '../components/layout/ErrorBoundary';
import { SectionLayout } from '../components/layout/SectionLayout';
import { SectionLoading } from '../components/ui/SectionLoading';
import { LeaderboardV3 } from '@/features/leaderboard-v3';

const LeaderboardV3Page = () => {
  return (
    <PageLayout>
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-latte">Failed to load leaderboard. Please try again later.</p>
          </SectionLayout>
        }
      >
        <Suspense fallback={<SectionLoading fullScreen />}>
          <LeaderboardV3 showBreakdown={true} />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
};

export default LeaderboardV3Page;
