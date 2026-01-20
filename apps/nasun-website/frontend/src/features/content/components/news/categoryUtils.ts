// sections/news/categoryUtils.ts
import { WP_CATEGORIES } from "../../../../hooks/wordpress/usePosts";

export type CategoryType = "all" | "news" | "events";

export interface CategoryOption {
  key: CategoryType;
  label: string;
  categoryId: number | number[];
}

export const categories: CategoryOption[] = [
  { key: "all", label: "All", categoryId: [WP_CATEGORIES.NEWS, WP_CATEGORIES.EVENTS] },
  { key: "news", label: "News", categoryId: WP_CATEGORIES.NEWS },
  { key: "events", label: "Events", categoryId: WP_CATEGORIES.EVENTS },
];

export const getCategoryIds = (category: CategoryType): number | number[] => {
  const found = categories.find((c) => c.key === category);
  return found?.categoryId ?? [WP_CATEGORIES.NEWS, WP_CATEGORIES.EVENTS];
};
