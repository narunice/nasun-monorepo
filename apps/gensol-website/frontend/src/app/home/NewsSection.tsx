import { Link } from "react-router-dom"
import Slider from "react-slick"
import "slick-carousel/slick/slick.css"
import "slick-carousel/slick/slick-theme.css"
import { ArrowTopRightIcon, ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons"
import { FadeInUp } from "@/components/common/FadeInUp"
import usePosts, { WP_CATEGORIES } from "@/hooks/wordpress/usePosts"
import { Post } from "@/types/post.d"
import BluePlanetBg from "@assets/images/Blue-Planet.webp"

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

const CustomArrow = ({
  onClick,
  direction,
}: {
  onClick?: () => void
  direction: "left" | "right"
}) => (
  <button
    onClick={onClick}
    className={`hidden lg:block absolute top-1/2 z-10 -translate-y-1/2 bg-white/10 p-3 rounded-full shadow-lg hover:bg-white/20 transition-all border border-white/50 hover:border-white/60 ${
      direction === "left" ? "-left-16" : "-right-16"
    }`}
    aria-label={direction === "left" ? "Previous news" : "Next news"}
  >
    {direction === "left" ? (
      <ChevronLeftIcon className="w-6 h-6 text-white/60 transition-all" />
    ) : (
      <ChevronRightIcon className="w-6 h-6 text-white/60 transition-all" />
    )}
  </button>
)

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

const EmptyState = () => (
  <div className="text-center py-12">
    <p className="text-white/60">No news available at the moment.</p>
  </div>
)

const NewsCard = ({ post }: { post: Post }) => {
  const imageUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || ""

  return (
    <div className="px-2">
      <Link
        to={`/news/${post.slug}`}
        className="group flex flex-col md:flex-row bg-black/80 backdrop-blur-md rounded-2xl overflow-hidden border border-white/20 hover:border-sf-blue/60 transition-all duration-300"
      >
        {/* Left: Image */}
        <div className="md:w-1/2 md:self-stretch overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={stripHtml(post.title.rendered)}
              loading="lazy"
              className="w-full h-64 md:h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-64 md:h-full min-h-[300px] bg-gradient-to-br from-sf-blue/30 to-sf-purple/20 flex items-center justify-center">
              <span className="text-white/40 text-lg">No Image</span>
            </div>
          )}
        </div>

        {/* Right: Content */}
        <div className="md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center">
          <span className="self-center px-4 py-1 border border-sf-blue rounded-full text-sf-blue text-sm uppercase tracking-wider mb-4">
            {getCategory(post)}
          </span>

          <h3 className="text-xl md:text-2xl font-semibold text-white mb-4 line-clamp-3 text-center">
            {stripHtml(post.title.rendered)}
          </h3>

          <time className="text-white/70 text-center mb-4" dateTime={post.date}>
            {formatDate(post.date)}
          </time>

          <p className="text-white/80 mb-6 line-clamp-3 text-center">
            {stripHtml(post.excerpt.rendered)}
          </p>

          <span className="self-end inline-flex items-center px-6 py-2 rounded-md text-white hover:border-sf-blue hover:bg-sf-blue/10 transition-all">
            <span className="inline-flex items-center border-b border-white pb-0.5">
              Read More
              <ArrowTopRightIcon className="ml-2 w-4 h-4" />
            </span>
          </span>
        </div>
      </Link>
    </div>
  )
}

const sliderSettings = {
  dots: true,
  infinite: true,
  speed: 500,
  slidesToShow: 1,
  slidesToScroll: 1,
  arrows: true,
  prevArrow: <CustomArrow direction="left" />,
  nextArrow: <CustomArrow direction="right" />,
  customPaging: () => <div className="carousel-dot" />,
}

const NewsSection = () => {
  const { posts, loading, error, refetch } = usePosts(WP_CATEGORIES.NEWS, 6)

  return (
    <section className="relative w-full h-full overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${BluePlanetBg})` }}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.8) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-20 py-20 lg:py-32 flex flex-col justify-center h-full">
        <FadeInUp>
          <h2 className="font-pirulen text-4xl md:text-5xl lg:text-6xl text-white tracking-wider text-center mb-12 lg:mb-16">
            NEWS
          </h2>
        </FadeInUp>

        <FadeInUp delay="0.4s">
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <ErrorState onRetry={refetch} error={error} />
          ) : posts.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="carousel-dots">
              <Slider {...sliderSettings}>
                {posts.map((post) => (
                  <NewsCard key={post.id} post={post} />
                ))}
              </Slider>
            </div>
          )}
        </FadeInUp>
      </div>
    </section>
  )
}

export default NewsSection
