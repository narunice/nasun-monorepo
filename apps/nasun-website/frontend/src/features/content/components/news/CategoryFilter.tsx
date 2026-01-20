// sections/news/CategoryFilter.tsx
import { useTranslation } from "react-i18next";
import { Tag } from "../../../ui/tag";
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
          className="focus:outline-none focus:ring-2 focus:ring-nasun-c3/50 rounded-full"
        >
          <Tag
            variant={activeCategory === cat.key ? "filledC3" : "outlineC3"}
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
