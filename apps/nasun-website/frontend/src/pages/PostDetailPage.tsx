import { useEffect, useMemo, useCallback, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, CalendarIcon, Share1Icon, CheckIcon } from "@radix-ui/react-icons";
import { motion, AnimatePresence } from "framer-motion";
import DOMPurify from "dompurify";
import usePostBySlug from "../hooks/wordpress/usePostBySlug";
import usePosts, { WP_CATEGORIES } from "../hooks/wordpress/usePosts";
import { SectionLoading } from "../components/ui/SectionLoading";
import { PageLayout } from "../components/layout/PageLayout";
import { sanitizeWordPressContent } from "../utils/wordpressContent";
import PostNavigation from "../sections/posts/PostNavigation";
import type { Post } from "../types/post.d";

// Hero Background Image
import heroBg from "../assets/images/brigitte-elsner-aWkXoJCde4A-unsplash.webp";
const HERO_BG_IMAGE = heroBg;

// Section configuration for back button and navigation
const SECTION_CONFIG = {
  awardsGrants: {
    backButtonText: "Back to Awards & Grants",
    sectionId: "awards-grants",
    categoryIds: [WP_CATEGORIES.AWARDS, WP_CATEGORIES.GRANTS] as number[],
    basePath: "/awards-grants",
  },
  newsEvents: {
    backButtonText: "Back to News & Events",
    sectionId: "news-events",
    categoryIds: [WP_CATEGORIES.NEWS, WP_CATEGORIES.EVENTS] as number[],
    basePath: "/news-events",
  },
};

function PostDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  // Determine which section the post came from based on URL path
  const isNewsEvents = location.pathname.startsWith("/news-events/");
  const currentSection = isNewsEvents ? SECTION_CONFIG.newsEvents : SECTION_CONFIG.awardsGrants;

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

  const navigate = useNavigate();

  // 페이지 진입 시 최상단으로 이동
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  // Back to Section 클릭 시 context-aware 네비게이션
  // /news 페이지에서 왔으면 /news로, 그 외에는 홈페이지 섹션으로 이동
  const referrer = (location.state as { from?: string })?.from;

  const handleBackToSection = useCallback(() => {
    if (referrer === "/news") {
      // /news 페이지에서 왔으면 /news로 돌아가기
      navigate("/news");
    } else {
      // 기존 동작: 홈페이지 섹션으로 이동
      navigate("/");
      setTimeout(() => {
        const element = document.getElementById(currentSection.sectionId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 300);
    }
  }, [navigate, currentSection.sectionId, referrer]);

  // 동적 버튼 텍스트
  const backButtonText = referrer === "/news" ? "Back to News" : currentSection.backButtonText;

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

  // WordPress Content Sanitization
  // 유니코드 이스케이프, pre 태그 래핑, 이중 직렬화 등 다양한 문제 처리
  const rawContent = post.content?.rendered || "";
  const cleanContent = sanitizeWordPressContent(rawContent);
  const sanitizedContent = DOMPurify.sanitize(cleanContent);

  // 디버깅: 특정 포스트만 전체 HTML 출력
  if (
    slug ===
    "gen-sol-animation-series-the-heist-advances-to-the-finalist-round-of-the-2024-animation-project-development-competition"
  ) {
    console.log("🔍 [DEBUG] Full HTML content:", cleanContent);
    console.log("🔍 [DEBUG] Has <pre> tag:", cleanContent.includes("<pre"));
    console.log("🔍 [DEBUG] Has inline style with nowrap:", cleanContent.includes("nowrap"));
    console.log("🔍 [DEBUG] HTML length:", cleanContent.length);
  }

  return (
    <PageLayout className="!pt-0">
      <article className="min-h-screen bg-nasun-black text-nasun-white relative">
        {/* Hero Section (Static Background) */}
        <div className="relative w-full min-h-[50vh] md:min-h-[60vh] flex flex-col justify-end overflow-hidden">
          {/* Background Image */}
          <div
            className="absolute inset-0 bg-cover bg-center z-0 animate-slow-zoom"
            style={{ backgroundImage: `url(${HERO_BG_IMAGE})` }}
          />
          {/* Dark Overlay for Text Readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-nasun-black/20 via-nasun-black/60 to-nasun-black z-10" />

          {/* Hero Content */}
          <div className="relative z-20 pt-24 md:pt-28 pb-6 md:pb-10 px-4">
            <div className="max-w-4xl mx-auto text-center md:text-left">
              <button
                onClick={handleBackToSection}
                className="inline-flex items-center text-nasun-c1 hover:text-nasun-c2 transition-colors mb-6 text-xs md:text-sm uppercase tracking-[0.2em] font-medium"
              >
                <ArrowLeftIcon className="mr-2 w-4 h-4" /> {backButtonText}
              </button>

              <motion.h3
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="font-bold text-white leading-snug mb-6 font-eurostile"
                dangerouslySetInnerHTML={{ __html: post.title.rendered }}
              />

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="flex items-center gap-2 text-gray-400 text-sm"
              >
                <CalendarIcon /> {date}
              </motion.div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="relative z-20 max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
          {/* Main Text Content */}
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Side Menu (Sticky Share/Nav) - Desktop Only */}
            <aside className="hidden lg:block w-16 shrink-0">
              <div className="sticky top-32 flex flex-col gap-6">
                <div className="relative">
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(window.location.href);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                      copied
                        ? "bg-green-500 text-white border border-green-500"
                        : "bg-white/5 border border-white/10 text-gray-400 hover:bg-nasun-scarlet hover:text-white hover:border-nasun-scarlet"
                    }`}
                    title="Copy Link"
                  >
                    {copied ? (
                      <CheckIcon className="w-5 h-5" />
                    ) : (
                      <Share1Icon className="w-5 h-5" />
                    )}
                  </button>

                  {/* Copied 툴팁 */}
                  <AnimatePresence>
                    {copied && (
                      <motion.span
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        transition={{ duration: 0.2 }}
                        className="absolute left-12 top-1/2 -translate-y-1/2 text-sm text-green-400 font-medium whitespace-nowrap"
                      >
                        URL copied!
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <div className="w-px h-20 bg-gradient-to-b from-white/20 to-transparent mx-auto" />
              </div>
            </aside>

            {/* Typography Content */}
            <div
              className="flex-1 prose prose-lg prose-invert max-w-none
                /* Headings */
                prose-headings:font-eurostile prose-headings:tracking-wide prose-headings:text-white
                prose-h1:text-4xl prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:text-nasun-c1
                prose-h3:text-2xl prose-h3:mt-8 prose-h3:text-nasun-c1

                /* Text */
                prose-p:text-gray-300 prose-p:leading-relaxed prose-p:font-light
                prose-strong:text-white prose-strong:font-semibold

                /* Links */
                prose-a:text-blue-300 prose-a:no-underline prose-a:border-b prose-a:border-blue-300/50 prose-a:break-all
                hover:prose-a:text-blue-500 hover:prose-a:border-blue-500 hover:prose-a:transition-colors

                /* Blockquotes */
                prose-blockquote:border-l-4 prose-blockquote:border-nasun-c1
                prose-blockquote:bg-white/5 prose-blockquote:px-6 prose-blockquote:py-4 prose-blockquote:rounded-r-lg
                prose-blockquote:text-gray-200 prose-blockquote:not-italic

                /* Images inside content */
                prose-img:rounded-sm prose-img:shadow-xl prose-img:border prose-img:border-white/10 prose-img:my-4

                /* Lists */
                prose-li:text-gray-300 prose-li:marker:text-nasun-c1"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
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
