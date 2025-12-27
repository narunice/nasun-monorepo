// src/components/common/KeyPointsBox.tsx
import { SectionLayout } from "../layout/SectionLayout";

interface KeyPointsBoxProps {
  title: string;
  points: string[];
  className?: string;
  listStyle?: "disc" | "decimal" | "none";
  titleClassName?: string;
  listClassName?: string;
}

export function KeyPointsBox({
  title,
  points,
  className = "",
  listStyle = "disc",
  titleClassName = "",
  listClassName = "",
}: KeyPointsBoxProps) {
  // 리스트 스타일 클래스 매핑
  const listStyleClass = {
    disc: "list-disc",
    decimal: "list-decimal",
    none: "list-none",
  };

  return (
    <SectionLayout>
      <div className={`p-6 rounded-lg border  border-gray-600/20 ${className}`}>
        <h4 className={`mb-2 font-medium ${titleClassName}`}>{title}</h4>
        <ul className={`${listStyleClass[listStyle]} pl-5 space-y-2 ${listClassName}`}>
          {points.map((point, index) => (
            <li key={index} className="font-light">
              {point}
            </li>
          ))}
        </ul>
      </div>
    </SectionLayout>
  );
}
