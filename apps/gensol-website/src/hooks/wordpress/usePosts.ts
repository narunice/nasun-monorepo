import { useQuery } from "@tanstack/react-query"
import { Post } from "@/types/post.d"

// 개발환경: vite 프록시 사용, 프로덕션: 환경변수 사용
const getWordPressApiUrl = () => {
  if (import.meta.env.DEV) {
    return "/wp-api" // vite 프록시
  }
  const domain = import.meta.env.VITE_WORDPRESS_DOMAIN || "https://cms.moonoak.io"
  return `${domain}/wp-json`
}

export const WP_CATEGORIES = {
  NEWS: 3,
} as const

const fetchPosts = async (
  categoryIds: number | number[],
  limit: number
): Promise<Post[]> => {
  const categoriesParam = Array.isArray(categoryIds)
    ? categoryIds.join(",")
    : categoryIds.toString()

  const apiUrl = getWordPressApiUrl()
  const response = await fetch(
    `${apiUrl}/wp/v2/posts?categories=${categoriesParam}&per_page=${limit}&_embed`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch posts: ${response.status}`)
  }

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export const postKeys = {
  all: ["posts"] as const,
  lists: () => [...postKeys.all, "list"] as const,
  list: (categoryIds: number | number[], limit: number) =>
    [...postKeys.lists(), { categoryIds, limit }] as const,
}

export default function usePosts(
  categoryIds: number | number[] = WP_CATEGORIES.NEWS,
  limit: number = 1
) {
  const {
    data: posts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Post[], Error>({
    queryKey: postKeys.list(categoryIds, limit),
    queryFn: () => fetchPosts(categoryIds, limit),
    staleTime: 1000 * 60 * 5, // 5분
  })

  return {
    posts,
    loading: isLoading,
    error: isError ? error.message : null,
    refetch,
  }
}
