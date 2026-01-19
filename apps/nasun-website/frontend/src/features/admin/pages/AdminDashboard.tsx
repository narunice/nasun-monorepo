import { Link } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { SectionLayout } from '@/components/layout/SectionLayout';
import { PageTitle } from '@/components/ui/PageTitle';
import { DashboardCard } from '@/components/ui/DashboardCard';
import { OuterBox } from '@/components/ui/OuterBox';

interface AdminFeatureCardProps {
  title: string;
  description: string;
  icon: string;
  link: string;
  linkText: string;
  disabled?: boolean;
}

function AdminFeatureCard({ title, description, icon, link, linkText, disabled }: AdminFeatureCardProps) {
  return (
    <DashboardCard className="flex flex-col h-full hover:border-nasun-c5/80 transition-all duration-300 group bg-gray-800/30">
      <div className="flex items-center justify-between mb-5">
        <div className="text-3xl p-2 bg-nasun-c6/50 rounded-lg border border-nasun-c5/20 group-hover:border-nasun-c4/30 transition-colors">
          {icon}
        </div>
      </div>
      
      <h3 className="text-lg font-medium text-nasun-white mb-3 group-hover:text-nasun-c4 transition-colors">
        {title}
      </h3>
      
      <p className="text-nasun-white/60 text-sm mb-6 flex-grow leading-relaxed">
        {description}
      </p>
      
      {disabled ? (
        <div className="mt-auto pt-4 border-t border-nasun-c5/20 flex items-center text-nasun-white/30 text-sm font-medium cursor-not-allowed">
          {linkText}
        </div>
      ) : (
        <Link
          to={link}
          className="mt-auto pt-4 border-t border-nasun-c5/30 flex items-center text-nasun-c3 hover:text-nasun-c4 text-sm font-medium transition-colors"
        >
          {linkText}
          <svg 
            className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Link>
      )}
    </DashboardCard>
  );
}

export function AdminDashboard() {
  return (
    <AdminLayout>
      <div className="bg-nasun-black min-h-screen">
        <SectionLayout className="!max-w-6xl !pt-12">
          
          <div className="w-full mb-10">
            <PageTitle as="h1" align="left" className="!mb-4">
              Admin Dashboard
            </PageTitle>
            <p className="text-nasun-white/60 text-lg font-light max-w-2xl leading-relaxed">
              Manage whitelist exports, governance proposals, and monitor platform health through the centralized admin console.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            <AdminFeatureCard
              title="Whitelist Export"
              description="Download Genesis NFT Whitelist and Battalion NFT Allowlist as CSV files with date filtering capabilities."
              icon="📋"
              link="/admin/whitelist"
              linkText="Manage Whitelist"
            />

            <AdminFeatureCard
              title="Governance"
              description="Create proposals, view voting results, monitor participation, and export vote data for analysis."
              icon="🗳️"
              link="/admin/governance"
              linkText="Manage Governance"
            />

            <AdminFeatureCard
              title="Blacklist Management"
              description="Manage user bans and restrictions. (Feature currently in planning phase)"
              icon="🚫"
              link="/admin/users"
              linkText="Manage Users"
              disabled={true}
            />

            <AdminFeatureCard
              title="Coming Soon"
              description="More admin features including X Health Monitor and Pipeline Status will be available in future updates."
              icon="🚀"
              link="/admin"
              linkText="Stay tuned"
              disabled={true}
            />
          </div>

          {/* Quick Stats / Info */}
          <div className="w-full mt-12">
            <OuterBox color="n3" padding="md" className="w-full">
              <h2 className="text-lg font-semibold text-nasun-white mb-3 flex items-center gap-2">
                <span className="w-1 h-5 bg-nasun-c4 rounded-full"></span>
                System Information
              </h2>
              <p className="text-nasun-white/60 text-sm leading-relaxed">
                This admin panel allows you to manage NFT whitelist exports and governance features securely. 
                All actions are logged. Please ensure you are connected with an authorized wallet address before proceeding with sensitive operations.
              </p>
            </OuterBox>
          </div>

        </SectionLayout>
      </div>
    </AdminLayout>
  );
}
