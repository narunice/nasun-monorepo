import { useState, useEffect } from "react";

export interface WordPressPost {
  id: number;
  date: string;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url: string; alt_text?: string }>;
    author?: Array<{ name: string }>;
  };
}

const usePostBySlug = (slug: string | undefined) => {
  const [post, setPost] = useState<WordPressPost | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    const fetchPost = async () => {
      setLoading(true);
      try {
        // 환경변수가 없으면 기본 URL 사용 (기존 usePosts.ts와 통일)
        const wpDomain = import.meta.env.VITE_WORDPRESS_DOMAIN || "https://cms.moonoak.io";
        const wpApiUrl = `${wpDomain}/wp-json/wp/v2`;
        
        console.log(`Fetching post from: ${wpApiUrl}/posts?slug=${slug}&_embed`);

        const response = await fetch(`${wpApiUrl}/posts?slug=${slug}&_embed`);
        
        if (!response.ok) throw new Error(`Failed to fetch post: ${response.status} ${response.statusText}`);
        
        const data = await response.json();
        console.log("Post data received:", data);
        
        if (data.length > 0) {
          setPost(data[0]);
        } else {
          console.warn("No post found for slug:", slug);
          setError("Post not found");
        }
      } catch (err: unknown) {
        console.error("Error fetching post:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch post");
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  return { post, loading, error };
};

export default usePostBySlug;