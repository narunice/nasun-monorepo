// src/utils/categoryUtils.ts

import { CATEGORY_EMOJIS } from "../constants/pageContent/products";

export const normalizeCategoryName = (name: string) => {
  return name.replace(/\u2019/g, "’"); // Normalize curly quotes to straight quotes
};

export const getCategoryEmoji = (englishCategory: string) => {
  return CATEGORY_EMOJIS[englishCategory] || "✨";
};

export const MIN_VISIBLE_CATEGORIES = 16;
export const MAX_VISIBLE_CATEGORIES = 30;

export const updateActiveCategories = (
  currentActive: string[],
  allCategories: string[]
): string[] => {
  const toRemove = Math.floor(Math.random() * 4) + 3;
  let newActive = [...currentActive];

  // 기존 항목 제거
  for (let i = 0; i < toRemove && newActive.length > 0; i++) {
    const removeIndex = Math.floor(Math.random() * newActive.length);
    newActive.splice(removeIndex, 1);
  }

  // 새 항목 추가
  const availableCategories = allCategories.filter((cat) => !newActive.includes(cat));
  const toAdd = Math.min(Math.floor(Math.random() * 4) + 3, availableCategories.length);

  for (let i = 0; i < toAdd && availableCategories.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * availableCategories.length);
    newActive.push(availableCategories[randomIndex]);
    availableCategories.splice(randomIndex, 1);
  }

  // 항목 수 조정
  if (newActive.length < MIN_VISIBLE_CATEGORIES) {
    const needed = MIN_VISIBLE_CATEGORIES - newActive.length;
    const extra = availableCategories.slice(0, needed);
    newActive = [...newActive, ...extra];
  } else if (newActive.length > MAX_VISIBLE_CATEGORIES) {
    newActive = newActive.slice(0, MAX_VISIBLE_CATEGORIES);
  }

  return newActive;
};
