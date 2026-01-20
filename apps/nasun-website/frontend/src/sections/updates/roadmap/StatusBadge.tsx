import { useTranslation } from "react-i18next";
import { CheckCircle, CircleDot, Circle } from "lucide-react";
import type { RoadmapStatus } from "../../../types/roadmap";

interface StatusBadgeProps {
  status: RoadmapStatus;
  showIcon?: boolean;
  showText?: boolean;
}

const statusStyles: Record<
  RoadmapStatus,
  { bg: string; text: string; border: string; iconColor: string }
> = {
  completed: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    border: "border-green-500/50",
    iconColor: "text-green-500",
  },
  "in-progress": {
    bg: "bg-nasun-c1/20",
    text: "text-nasun-c1",
    border: "border-nasun-c1/50",
    iconColor: "text-nasun-c1",
  },
  upcoming: {
    bg: "bg-nasun-white/10",
    text: "text-nasun-white/60",
    border: "border-nasun-white/30",
    iconColor: "text-nasun-white/40",
  },
};

export const StatusBadge = ({ status, showIcon = true, showText = true }: StatusBadgeProps) => {
  const { t } = useTranslation("roadmap");
  const styles = statusStyles[status];

  const Icon = () => {
    const iconClass = `w-3.5 h-3.5 ${styles.iconColor}`;
    switch (status) {
      case "completed":
        return <CheckCircle className={iconClass} />;
      case "in-progress":
        return <CircleDot className={iconClass} />;
      case "upcoming":
        return <Circle className={iconClass} />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${
        styles.bg
      } ${styles.text} ${styles.border} ${status === "in-progress" ? "animate-pulse" : ""}`}
    >
      {showIcon && <Icon />}
      {showText && t(`status.${status}`)}
    </span>
  );
};

export const StatusIcon = ({ status }: { status: RoadmapStatus }) => {
  const iconClass = "w-5 h-5";
  const styles = statusStyles[status];

  switch (status) {
    case "completed":
      return <CheckCircle className={`${iconClass} ${styles.iconColor}`} />;
    case "in-progress":
      return <CircleDot className={`${iconClass} ${styles.iconColor}`} />;
    case "upcoming":
      return <Circle className={`${iconClass} ${styles.iconColor}`} />;
  }
};
