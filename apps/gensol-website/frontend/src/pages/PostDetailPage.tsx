import { useEffect, useMemo, useCallback } from "react"
import { useParams, Link, useNavigate, useLocation } from "react-router-dom"
import { ArrowLeftIcon, CalendarIcon, Share1Icon } from "@radix-ui/react-icons"
import DOMPurify from "dompurify"
import usePostBySlug from "@/hooks/wordpress/usePostBySlug"
import usePosts, { WP_CATEGORIES } from "@/hooks/wordpress/usePosts"
import { Post } from "@/types/post.d"

// Hero Background Image - Blue Planet 사용
import BluePlanetBg from "@assets/images/Blue-Planet.webp"

// 로딩 컴포넌트
const LoadingState = () => (
  <div className="min-h-screen flex items-center justify-center bg-black">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sf-blue"></div>
  </div>
)

// 에러 컴포넌트
const ErrorState = ({ error }: { error?: string }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-4">
    <h2 className="text-2xl font-pirulen">Post not found</h2>
    {error && <p className="text-orange-400">{error}</p>}
    <Link to="/" className="text-sf-blue hover:underline">
      Return Home
    </Link>
  </div>
)

// 포스트 네비게이션 컴포넌트
const PostNavigation = ({
  previousPost,
  nextPost,
}: {
  previousPost: Post | null
  nextPost: Post | null
}) => {
  const stripHtml = (html: string) => html.replace(/<[^>]*>?/gm, "")

  if (!previousPost && !nextPost) return null

  return (
    <nav className="mt-16 pt-8 border-t border-white/10">
      <div className="flex flex-col md:flex-row justify-between gap-6">
        {previousPost ? (
          <Link
            to={`/news/${previousPost.slug}`}
            className="group flex-1 p-6 rounded-xl bg-white/5 border border-white/10 hover:border-sf-blue/50 transition-all"
          >
            <span className="text-sm text-white/50 uppercase tracking-wider">
              Previous
            </span>
            <h4 className="mt-2 text-lg text-white group-hover:text-sf-blue transition-colors line-clamp-2">
              {stripHtml(previousPost.title.rendered)}
            </h4>
          </Link>
        ) : (
          <div className="flex-1" />
        )}

        {nextPost ? (
          <Link
            to={`/news/${nextPost.slug}`}
            className="group flex-1 p-6 rounded-xl bg-white/5 border border-white/10 hover:border-sf-blue/50 transition-all text-right"
          >
            <span className="text-sm text-white/50 uppercase tracking-wider">
              Next
            </span>
            <h4 className="mt-2 text-lg text-white group-hover:text-sf-blue transition-colors line-clamp-2">
              {stripHtml(nextPost.title.rendered)}
            </h4>
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </nav>
  )
}

const PostDetailPage = () => {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const navigate = useNavigate()

  const { post, loading: postLoading, error: postError } = usePostBySlug(slug)
  const { posts, loading: listLoading } = usePosts(WP_CATEGORIES.NEWS, 100)

  // 이전/다음 포스트 계산
  const { previousPost, nextPost } = useMemo(() => {
    if (!post || posts.length === 0) {
      return { previousPost: null, nextPost: null }
    }
    const currentIndex = posts.findIndex((p) => p.id === post.id)
    if (currentIndex === -1) {
      return { previousPost: null, nextPost: null }
    }
    const previousPost = posts[currentIndex - 1] || null
    const nextPost = posts[currentIndex + 1] || null
    return { previousPost, nextPost }
  }, [post, posts])

  // 페이지 진입 시 최상단으로 이동
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])

  // Back 버튼 핸들러
  const referrer = (location.state as { from?: string })?.from

  const handleBack = useCallback(() => {
    if (referrer === "/news") {
      navigate("/news")
    } else {
      navigate("/")
    }
  }, [navigate, referrer])

  const backButtonText = referrer === "/news" ? "Back to News" : "Back to Home"

  const loading = postLoading || listLoading

  if (loading) return <LoadingState />
  if (postError || !post) return <ErrorState error={postError || undefined} />

  // 데이터 가공
  const date = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const rawContent = post.content?.rendered || ""
  const sanitizedContent = DOMPurify.sanitize(rawContent)

  return (
    <main className="min-h-screen bg-black text-white relative">
      {/* Hero Section */}
      <div className="relative w-full min-h-[50vh] md:min-h-[60vh] flex flex-col justify-end overflow-hidden">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center z-0"
          style={{ backgroundImage: `url(${BluePlanetBg})` }}
        />
        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black z-10" />

        {/* Hero Content */}
        <div className="relative z-20 pt-24 md:pt-28 pb-12 md:pb-20 px-4">
          <div className="max-w-4xl mx-auto text-center md:text-left">
            <button
              onClick={handleBack}
              className="inline-flex items-center text-sf-blue hover:text-white transition-colors mb-6 text-xs md:text-sm uppercase tracking-[0.2em] font-medium"
            >
              <ArrowLeftIcon className="mr-2 w-4 h-4" /> {backButtonText}
            </button>

            <h1
              className="text-3xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6 font-pirulen"
              dangerouslySetInnerHTML={{ __html: post.title.rendered }}
            />

            <div className="flex items-center gap-2 text-gray-400 text-sm justify-center md:justify-start">
              <CalendarIcon /> {date}
            </div>
          </div>
        </div>
      </div>

      {/* Content Body */}
      <div className="relative z-20 max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-20">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Side Menu (Desktop Only) */}
          <aside className="hidden lg:block w-16 shrink-0">
            <div className="sticky top-32 flex flex-col gap-6">
              <button
                onClick={() => navigator.clipboard.writeText(window.location.href)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-sf-blue hover:text-white hover:border-sf-blue transition-all duration-300"
                title="Copy Link"
              >
                <Share1Icon className="w-5 h-5" />
              </button>
              <div className="w-px h-20 bg-gradient-to-b from-white/20 to-transparent mx-auto" />
            </div>
          </aside>

          {/* Typography Content */}
          <div
            className="flex-1 prose prose-lg prose-invert max-w-none
              prose-headings:font-pirulen prose-headings:tracking-wide prose-headings:text-white
              prose-h1:text-4xl prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:text-sf-blue
              prose-h3:text-2xl prose-h3:mt-8 prose-h3:text-sf-blue
              prose-p:text-gray-300 prose-p:leading-8 prose-p:font-light
              prose-strong:text-white prose-strong:font-semibold
              prose-a:text-sf-blue prose-a:no-underline prose-a:border-b prose-a:border-sf-blue/50
              hover:prose-a:text-white hover:prose-a:border-white hover:prose-a:transition-colors
              prose-blockquote:border-l-4 prose-blockquote:border-sf-blue
              prose-blockquote:bg-white/5 prose-blockquote:px-6 prose-blockquote:py-4 prose-blockquote:rounded-r-lg
              prose-blockquote:text-gray-200 prose-blockquote:not-italic
              prose-img:rounded-xl prose-img:shadow-xl prose-img:border prose-img:border-white/10 prose-img:my-8
              prose-li:text-gray-300 prose-li:marker:text-sf-blue"
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        </div>

        {/* Post Navigation */}
        <PostNavigation previousPost={previousPost} nextPost={nextPost} />
      </div>
    </main>
  )
}

export default PostDetailPage
