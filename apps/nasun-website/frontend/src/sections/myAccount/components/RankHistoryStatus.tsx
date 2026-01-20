import { FC } from "react";

interface RankHistoryStatusProps {
  type: "notConnected" | "notParticipating" | "error" | "empty";
  message?: string;
  description?: string;
  icon?: React.ReactNode;
}

export const RankHistoryStatus: FC<RankHistoryStatusProps> = ({
  type,
  message,
  description,
  icon,
}) => {
  const containerClasses = {
    notConnected: "bg-blue-900/20 border-blue-800 text-blue-300",
    notParticipating: "bg-yellow-900/20 border-yellow-800 text-yellow-300",
    error: "bg-red-900/20 border-red-800 text-red-300",
    empty: "bg-gray-900 border-gray-700 text-gray-400",
  };

  const defaultIcons = {
    notConnected: (
      <svg className="w-16 h-16 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    notParticipating: (
      <svg className="w-16 h-16 mx-auto mb-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    error: null,
    empty: null,
  };

  return (
    <div className={`flex items-center justify-center min-h-[200px] rounded-lg border ${containerClasses[type]}`}>
      <div className="text-center p-6">
        {icon || defaultIcons[type]}
        <p className="font-medium">{message}</p>
        {description && <p className="text-sm mt-2 opacity-80">{description}</p>}
      </div>
    </div>
  );
};
