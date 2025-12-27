import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Post } from '../../types/post.d'; // Reintroduce Post type
import logger from '../../lib/logger';

// WordPress REST API 직접 호출
const WORDPRESS_API_URL = import.meta.env.VITE_WORDPRESS_DOMAIN || 'https://cms.moonoak.io';

// WordPress Category IDs
// awards: 4, news: 3, events: 5
export const WP_CATEGORIES = {
  AWARDS: 4,
  NEWS: 3,
  EVENTS: 5,
} as const;

// 1. Define a fetcher function (supports single or multiple category IDs)
const fetchPosts = async (categoryIds: number | number[], limit: number): Promise<Post[]> => {
  try {
    // Convert single ID to array, then join with comma for API
    const categoriesParam = Array.isArray(categoryIds)
      ? categoryIds.join(',')
      : categoryIds.toString();

    const response = await axios.get(
      `${WORDPRESS_API_URL}/wp-json/wp/v2/posts?categories=${categoriesParam}&per_page=${limit}&_embed`
    );
    const responseData = response.data;

    if (Array.isArray(responseData)) {
      return responseData;
    }
    if (responseData && typeof responseData === 'object' && Array.isArray(responseData.data)) {
      return responseData.data;
    }
    logger.warn("Unexpected API response structure for posts:", responseData);
    return [];
  } catch (err) {
    logger.error("Failed to fetch posts:", err);
    throw err;
  }
};

// Define a query key factory for better organization
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (categoryIds: number | number[], limit: number) => [...postKeys.lists(), { categoryIds, limit }] as const,
};

// 2. Refactor the hook to use useQuery (supports single or multiple category IDs)
export default function usePosts(categoryIds: number | number[] = 3, limit: number = 3) {
  const {
    data: posts = [],
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<Post[], Error>({
    queryKey: postKeys.list(categoryIds, limit),
    queryFn: () => fetchPosts(categoryIds, limit),
    staleTime: 1000 * 60 * 5,
  });

  return {
    posts,
    loading: isLoading,
    error: isError ? error.message : null,
    refetch
  };
}

