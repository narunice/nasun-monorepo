// sections/news/CategoryFilter.tsx
import { useTranslation } from "react-i18next";
import { Tag } from "@/components/ui/tag";
import { categories, CategoryType } from "./categoryUtils";

interface CategoryFilterProps {
  activeCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
}

export default function CategoryFilter({ activeCategory, onCategoryChange }: CategoryFilterProps) {
  const { t } = useTranslation("news");

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => (
        <button
          key={cat.key}
          onClick={() => onCategoryChange(cat.key)}
          className="focus:outline-none focus:ring-2 focus:ring-nasun-c7/50 rounded-full"
        >
          <Tag
            variant={activeCategory === cat.key ? "filledc7" : "outlinec7"}
            size="md"
            className="cursor-pointer hover:opacity-80 transition-opacity uppercase"
          >
            {t(`categories.${cat.key}`)}
          </Tag>
        </button>
      ))}
    </div>
  );
}
