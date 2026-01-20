import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import CategoryCard from "./CategoryCard";
import {
  INITIAL_VISIBLE_CATEGORIES,
  CHANGE_INTERVAL,
  FLIP_INTERVAL,
  CATEGORY_EMOJIS,
} from "../../../constants/pageContent/products";
import {
  getEnglishCategory,
  normalizeCategoryName,
  updateActiveCategories,
} from "../../../utils/categoryUtils";
import { SectionLayout } from "@/components/layout/SectionLayout";

function ProductsSection() {
  const { t } = useTranslation("products");
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const activeCategoriesRef = useRef<string[]>([]);
  const allCategories = useRef<string[]>([]);

  // 초기 설정
  useEffect(() => {
    const categories = t("products.categories", { returnObjects: true }) as string[];
    allCategories.current = categories;

    const initialFlipped = categories.reduce((acc, cat) => {
      acc[cat] = true; // 초기에 이모지 표시 (true)
      return acc;
    }, {} as Record<string, boolean>);

    setFlippedCards(initialFlipped);
    setActiveCategories(categories.slice(0, INITIAL_VISIBLE_CATEGORIES));
    activeCategoriesRef.current = categories.slice(0, INITIAL_VISIBLE_CATEGORIES);
  }, [t]);

  // 카테고리 변경 효과
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCategories((prev) => {
        const updated = updateActiveCategories(prev, allCategories.current);
        activeCategoriesRef.current = updated;
        return updated;
      });
    }, CHANGE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  // 플립 효과
  useEffect(() => {
    const interval = setInterval(() => {
      setFlippedCards((prev) => {
        const newFlipped = { ...prev };
        const currentActive = activeCategoriesRef.current;

        // *개의 랜덤 카드 선택
        const flipCount = Math.min(currentActive.length, Math.floor(Math.random() * 4) + 4);

        for (let i = 0; i < flipCount; i++) {
          const randomIndex = Math.floor(Math.random() * currentActive.length);
          const key = currentActive[randomIndex];
          newFlipped[key] = !newFlipped[key];
        }

        return newFlipped;
      });
    }, FLIP_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return (
    <SectionLayout title={t("products.tagline")}>
      <div className="flex flex-col gap-12">
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5 lg:gap-6 mt-12">
          {allCategories.current.map((category, index) => {
            const englishCategory = getEnglishCategory(
              normalizeCategoryName(category.trim()),
              i18n.language
            );
            const emoji = CATEGORY_EMOJIS[englishCategory] || "🧩";

            return (
              <CategoryCard
                key={category}
                category={category}
                emoji={emoji}
                isActive={activeCategories.includes(category)}
                isFlipped={flippedCards[category] ?? true}
                transitionDelay={`${(index % 10) * 0.1}s`}
              />
            );
          })}
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(ProductsSection);
