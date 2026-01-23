import { useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import usePostBySlug from "../hooks/wordpress/usePostBySlug";
import usePosts from "../hooks/wordpress/usePosts";
import { SectionLoading } from "../components/ui/SectionLoading";
import { PageLayout } from "../components/layout/PageLayout";
import PostNavigation from "../sections/posts/PostNavigation";
import { usePostSectionNavigation } from "../hooks/usePostSectionNavigation";
import PostHero from "../sections/posts/detail/PostHero";
import PostContent from "../sections/posts/detail/PostContent";
import PostSidebar from "../sections/posts/detail/PostSidebar";
import type { Post } from "../types/post.d";

function PostDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { backButtonText, handleBackToSection, currentSection } = usePostSectionNavigation();

  const { post, loading: postLoading, error: postError } = usePostBySlug(slug);
  const { posts, loading: listLoading } = usePosts(currentSection.categoryIds, 100);

  // 이전/다음 포스트 계산
  const { previousPost, nextPost } = useMemo(() => {
    if (!post || posts.length === 0) {
      return { previousPost: null, nextPost: null };
    }
    const currentIndex = posts.findIndex((p) => p.id === post.id);
    if (currentIndex === -1) {
      return { previousPost: null, nextPost: null };
    }
    // WordPress API returns posts in descending order of date.
    const previousPost = posts[currentIndex - 1] || null;
    const nextPost = posts[currentIndex + 1] || null;
    return { previousPost, nextPost };
  }, [post, posts]);

  // 페이지 진입 시 최상단으로 이동
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const loading = postLoading || listLoading;
  const error = postError;

  if (loading)
    return (
      <PageLayout>
        <div className="min-h-screen flex items-center justify-center bg-nasun-black">
          <SectionLoading />
        </div>
      </PageLayout>
    );

  if (error || !post)
    return (
      <PageLayout>
        <div className="min-h-screen flex flex-col items-center justify-center bg-nasun-black text-nasun-white gap-4">
          <h2 className="text-2xl font-eurostile">Post not found</h2>
          {error && <p className="text-nasun-scarlet">{error}</p>}
          <Link to="/" className="text-blue-300 hover:underline">
            Return Home
          </Link>
        </div>
      </PageLayout>
    );

  // 데이터 가공
  const date = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <PageLayout className="!pt-0 max-w-9xl mx-auto">
      <article className="min-h-screen bg-nasun-black text-nasun-white relative">
        <PostHero
          title={post.title.rendered}
          date={date}
          onBack={handleBackToSection}
          backButtonText={backButtonText}
        />

        {/* Content Body */}
        <div className="relative z-20 max-w-4xl mx-auto px-4 md:px-6 ">
          {/* Main Text Content */}
          <div className="flex flex-col lg:flex-row gap-12">
            <PostSidebar />
            <PostContent content={post.content.rendered} />
          </div>

          {/* Post Navigation (Previous / Next) */}
          <PostNavigation
            previousPost={previousPost as Post | null}
            nextPost={nextPost as Post | null}
            basePath={currentSection.basePath}
          />
        </div>
      </article>
    </PageLayout>
  );
}

export default PostDetailPage;
