import React from "react";
import { type DistributionSubItem } from "../../../../constants/pageContent/vision";

// LabelBlock 컴포넌트 - 색상 인디케이터 + 제목 + 수량
interface LabelBlockProps {
  title: string;
  amount: number;
  percentage: number;
  color: string;
  className?: string;
}

export const LabelBlock: React.FC<LabelBlockProps> = ({
  title,
  amount,
  percentage,
  color,
  className,
}) => (
  <div className={`flex items-start gap-3 ${className}`}>
    {/* 색상 인디케이터 */}
    <div className="w-4 h-4 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: color }} />

    {/* 텍스트 정보 */}
    <div className="flex-1">
      <h4 className="font-bold text-nasun-white mb-1">{title}</h4>
      <p className="">
        {percentage}% · {amount.toLocaleString()} NSN
      </p>
    </div>
  </div>
);

// CommunityLabelBlock 컴포넌트 - 하위 항목 포함
interface CommunityLabelBlockProps {
  title: string;
  amount: number;
  percentage: number;
  color: string;
  subItems: DistributionSubItem[];
  className?: string;
}

export const CommunityLabelBlock: React.FC<CommunityLabelBlockProps> = ({
  title,
  amount,
  percentage,
  color,
  subItems,
  className,
}) => (
  <div className={`flex items-start gap-3 ${className}`}>
    {/* 색상 인디케이터 */}
    <div className="w-4 h-4 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: color }} />

    {/* 텍스트 정보 */}
    <div className="flex-1">
      <h5 className="font-bold text-nasun-white mb-1">{title}</h5>
      <p className="text-gray-300 mb-2">
        {percentage}% · {amount.toLocaleString()} NSN
      </p>

      {/* 하위 항목 리스트 */}
      <ul className="text-gray-400 space-y-0.5 pl-4">
        {subItems.map((item, idx) => (
          <li key={idx} className="list-disc">
            {item.name} ({item.percentage}%)
          </li>
        ))}
      </ul>
    </div>
  </div>
);
