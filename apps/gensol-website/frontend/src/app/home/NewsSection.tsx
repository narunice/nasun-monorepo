import { Link } from "react-router-dom"
import { ArrowTopRightIcon } from "@radix-ui/react-icons"
import { FadeInUp } from "@/components/common/FadeInUp"
import usePosts, { WP_CATEGORIES } from "@/hooks/wordpress/usePosts"
import { Post } from "@/types/post.d"
import BluePlanetBg from "@assets/images/Blue-Planet.webp"

// 유틸리티 함수들
const stripHtml = (html: string) => html.replace(/<[^>]*>?/gm, "")

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const getCategory = (post: Post): string => {
  return post._embedded?.["wp:term"]?.[0]?.[0]?.name || "NEWS"
}

// 로딩 스켈레톤
const LoadingSkeleton = () => (
  <div className="flex flex-col md:flex-row bg-black/80 backdrop-blur-md rounded-2xl overflow-hidden border border-white/20">
    <div className="md:w-1/2 h-64 md:h-[400px] bg-white/10 animate-pulse" />
    <div className="md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center space-y-4">
      <div className="self-center w-20 h-6 bg-white/10 rounded-full animate-pulse" />
      <div className="w-full h-8 bg-white/10 rounded animate-pulse" />
      <div className="self-center w-32 h-4 bg-white/10 rounded animate-pulse" />
      <div className="w-full h-20 bg-white/10 rounded animate-pulse" />
      <div className="self-end w-32 h-10 bg-white/10 rounded animate-pulse" />
    </div>
  </div>
)

// 에러 상태
const ErrorState = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <div className="text-center py-12 space-y-4">
    <p className="text-orange-400">{error}</p>
    <button
      onClick={onRetry}
      className="px-6 py-2 border border-white/30 rounded-md text-white hover:bg-white/10 transition-all"
    >
      Retry
    </button>
  </div>
)

// 빈 상태
const EmptyState = () => (
  <div className="text-center py-12">
    <p className="text-white/60">No news available at the moment.</p>
  </div>
)

// 뉴스 카드 컴포넌트
const NewsCard = ({ post }: { post: Post }) => {
  const imageUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || ""

  return (
    <div className="group flex flex-col md:flex-row bg-black/80 backdrop-blur-md rounded-2xl overflow-hidden border border-white/20 hover:border-sf-blue/60 transition-all duration-300">
      {/* 좌측: 이미지 */}
      <div className="md:w-1/2 md:self-stretch overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={stripHtml(post.title.rendered)}
            className="w-full h-64 md:h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-64 md:h-full min-h-[300px] bg-gradient-to-br from-sf-blue/30 to-sf-purple/20 flex items-center justify-center">
            <span className="text-white/40 text-lg">No Image</span>
          </div>
        )}
      </div>

      {/* 우측: 콘텐츠 */}
      <div className="md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center">
        {/* 카테고리 태그 */}
        <span className="self-center px-4 py-1 border border-sf-blue rounded-full text-sf-blue text-sm uppercase tracking-wider mb-4">
          {getCategory(post)}
        </span>

        {/* 제목 */}
        <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 line-clamp-3 text-center">
          {stripHtml(post.title.rendered)}
        </h3>

        {/* 날짜 */}
        <time className="text-white/70 text-center mb-4" dateTime={post.date}>
          {formatDate(post.date)}
        </time>

        {/* 설명 */}
        <p className="text-white/80 mb-6 line-clamp-3 text-center">
          {stripHtml(post.excerpt.rendered)}
        </p>

        {/* Read More 버튼 */}
        <Link
          to={`/news/${post.slug}`}
          className="self-end inline-flex items-center px-6 py-2 rounded-md text-white hover:border-sf-blue hover:bg-sf-blue/10 transition-all"
        >
          <span className="inline-flex items-center border-b border-white pb-0.5">
            Read More
            <ArrowTopRightIcon className="ml-2 w-4 h-4" />
          </span>
        </Link>
      </div>
    </div>
  )
}

// 메인 NewsSection 컴포넌트
const NewsSection = () => {
  const { posts, loading, error, refetch } = usePosts(WP_CATEGORIES.NEWS, 1)

  return (
    <section className="relative w-full h-full overflow-hidden">
      {/* 배경 이미지 */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${BluePlanetBg})` }}
      />

      {/* 그래디언트 오버레이 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.8) 100%)",
        }}
      />

      {/* 콘텐츠 */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 lg:py-32 flex flex-col justify-center h-full">
        {/* NEWS 헤딩 */}
        <FadeInUp>
          <h2 className="font-pirulen text-4xl md:text-5xl lg:text-6xl text-white tracking-wider text-center mb-12 lg:mb-16">
            NEWS
          </h2>
        </FadeInUp>

        {/* 뉴스 카드 (한 장) */}
        <FadeInUp delay="0.4s">
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <ErrorState onRetry={refetch} error={error} />
          ) : posts.length === 0 ? (
            <EmptyState />
          ) : (
            <NewsCard post={posts[0]} />
          )}
        </FadeInUp>
      </div>
    </section>
  )
}

export default NewsSection
