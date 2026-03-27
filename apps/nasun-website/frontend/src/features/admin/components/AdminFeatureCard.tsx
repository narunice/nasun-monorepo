import { Link } from "react-router-dom";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { ChevronRight } from "lucide-react";
import type { AdminFeature } from "../config/adminConfig";

type AdminFeatureCardProps = AdminFeature;

export function AdminFeatureCard({
  title,
  description,
  icon,
  link,
  linkText,
  disabled,
}: AdminFeatureCardProps) {
  return (
    <DashboardCard
      variant="default"
      className="flex flex-col h-full transition-all duration-300 group !bg-gray-800/50 !border-nasun-nw4/45 hover:!border-nasun-c5/65"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="text-3xl p-2 bg-nasun-c6/50 rounded-sm border border-nasun-c5/35 group-hover:border-nasun-c4/45 transition-colors">
          {icon}
        </div>
      </div>

      <h6 className="text-nasun-white font-medium mb-3 group-hover:text-nasun-c4 transition-colors">
        {title}
      </h6>

      <p className="text-nasun-white/80 text-base mb-6 flex-grow leading-relaxed">{description}</p>

      {disabled ? (
        <div className="mt-auto pt-4 border-t border-nasun-c5/35 flex items-center text-nasun-white/40 text-base font-medium cursor-not-allowed">
          {linkText}
        </div>
      ) : (
        <Link
          to={link}
          className="mt-auto pt-4 border-t border-nasun-c5/45 flex items-center text-nasun-c4 hover:text-nasun-c1 text-base font-medium transition-colors"
        >
          {linkText}
          <ChevronRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </DashboardCard>
  );
}
