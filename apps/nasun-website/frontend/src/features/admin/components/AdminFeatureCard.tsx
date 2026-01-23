import { Link } from 'react-router-dom';
import { DashboardCard } from '@/components/ui/DashboardCard';
import { ChevronRight } from 'lucide-react';
import type { AdminFeature } from '../config/adminConfig';

interface AdminFeatureCardProps extends AdminFeature {}

export function AdminFeatureCard({
  title,
  description,
  icon,
  link,
  linkText,
  disabled,
}: AdminFeatureCardProps) {
  return (
    <DashboardCard className="flex flex-col h-full hover:border-nasun-c4/50 transition-all duration-300 group bg-gray-800/30">
      <div className="flex items-center justify-between mb-5">
        <div className="text-3xl p-2 bg-nasun-c6/50 rounded-sm border border-nasun-c5/20 group-hover:border-nasun-c4/30 transition-colors">
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
          className="mt-auto pt-4 border-t border-nasun-c5/30 flex items-center text-nasun-c4 hover:text-nasun-c1 text-sm font-medium transition-colors"
        >
          {linkText}
          <ChevronRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </DashboardCard>
  );
}
