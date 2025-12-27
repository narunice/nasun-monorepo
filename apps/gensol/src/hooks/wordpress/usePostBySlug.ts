import { useState, useEffect } from "react"
import { Post } from "@/types/post.d"

// 개발환경: vite 프록시 사용, 프로덕션: 환경변수 사용
const getWordPressApiUrl = () => {
  if (import.meta.env.DEV) {
    return "/wp-api" // vite 프록시
  }
  const domain = import.meta.env.VITE_WORDPRESS_DOMAIN || "https://cms.moonoak.io"
  return `${domain}/wp-json`
}

const usePostBySlug = (slug: string | undefined) => {
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return

    const fetchPost = async () => {
      setLoading(true)
      try {
        const apiUrl = getWordPressApiUrl()
        const response = await fetch(`${apiUrl}/wp/v2/posts?slug=${slug}&_embed`)

        if (!response.ok) {
          throw new Error(
            `Failed to fetch post: ${response.status} ${response.statusText}`
          )
        }

        const data = await response.json()

        if (data.length > 0) {
          setPost(data[0])
        } else {
          setError("Post not found")
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error"
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchPost()
  }, [slug])

  return { post, loading, error }
}

export default usePostBySlug
