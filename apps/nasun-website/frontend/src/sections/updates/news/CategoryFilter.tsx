// sections/news/CategoryFilter.tsx
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
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
          className="focus:outline-none rounded-full"
        >
          <Tag
            variant={activeCategory === cat.key ? "filledNw4" : "outlineNw4"}
            size="sm"
            className="cursor-pointer hover:opacity-80 transition-opacity uppercase"
          >
            {t(`categories.${cat.key}`)}
          </Tag>
        </button>
      ))}
    </div>
  );
}
