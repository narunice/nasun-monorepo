import { Link } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';

interface DashboardCardProps {
  title: string;
  description: string;
  icon: string;
  link: string;
  linkText: string;
}

function DashboardCard({ title, description, icon, link, linkText }: DashboardCardProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-colors">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-white/60 text-sm mb-4">{description}</p>
      <Link
        to={link}
        className="inline-flex items-center text-nasun-c4 hover:text-nasun-c3 text-sm font-medium"
      >
        {linkText} →
      </Link>
    </div>
  );
}

export function AdminDashboard() {
  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-white/60 mb-8">Manage whitelist exports, governance, and more.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DashboardCard
            title="Whitelist Export"
            description="Download Genesis NFT Whitelist and Battalion NFT Allowlist as CSV files with date filtering."
            icon="📋"
            link="/admin/whitelist"
            linkText="Manage Whitelist"
          />

          <DashboardCard
            title="Governance"
            description="Create proposals, view voting results, and export vote data."
            icon="🗳️"
            link="/admin/governance"
            linkText="Manage Governance"
          />

          <DashboardCard
            title="Coming Soon"
            description="More admin features will be available in future updates."
            icon="🚀"
            link="/admin"
            linkText="Stay tuned"
          />
        </div>

        {/* Quick Stats */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold text-white mb-4">Quick Info</h2>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <p className="text-white/60 text-sm">
              This admin panel allows you to manage NFT whitelist exports and governance features.
              More functionality will be added in upcoming phases.
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
