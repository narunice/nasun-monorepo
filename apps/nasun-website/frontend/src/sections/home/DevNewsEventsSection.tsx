import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { TagV2 } from "@/components/ui/tag-v2";
import { ButtonV3 } from "@/components/ui/button-v3";
import usePosts, { WP_CATEGORIES } from "../../hooks/wordpress/usePosts";
import { Post } from "../../types/post.d";

// Dev-only copy of NewsEventsSection for redesign experimentation.
// The original NewsEventsSection (used on the live home page) must not be modified here.
function DevNewsEventsSection() {
  const sliderRef = useRef<Slider>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.intersectionRatio >= 0.5),
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const { posts, loading, error, refetch } = usePosts(
    [WP_CATEGORIES.NEWS, WP_CATEGORIES.EVENTS],
    4,
  );

  const getCategory = (post: Post): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const terms = (post._embedded as any)?.["wp:term"];
    if (
      terms &&
      Array.isArray(terms) &&
      terms[0] &&
      Array.isArray(terms[0]) &&
      terms[0][0]?.name
    ) {
      return terms[0][0].name;
    }
    return "NEWS";
  };

  const stripHtml = (html: string) => html.replace(/<[^>]*>?/gm, "");

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const sliderSettings = {
    dots: false,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: false,
    afterChange: (index: number) => setActiveIndex(index),
  };

  const postCount = Array.isArray(posts) ? posts.length : 0;

  return (
    <section
      ref={sectionRef}
      id="dev-news-events"
      className="relative w-full h-full bg-nasun-black overflow-hidden"
    >
      {loading ? (
        <div className="w-full h-full bg-black/30 animate-pulse" />
      ) : error ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4">
          <p className="text-orange-400">{error}</p>
          <Button variant="black" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : postCount === 0 ? (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          No news posts available.
        </div>
      ) : (
        <div className="news-slider" style={{ height: "calc(100vh - 50px)" }}>
          <Slider ref={sliderRef} {...sliderSettings}>
            {(posts as Post[]).map((post) => {
              const imageUrl =
                post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";

              return (
                <div key={post.id} className="outline-none h-full">
                  <div className="flex flex-col lg:flex-row bg-nasun-white h-full">
                    {/* Left: Featured image */}
                    <div className="lg:w-1/2 h-64 lg:h-full overflow-hidden shrink-0">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt="Featured"
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-nasun-nw4/30 to-nasun-nw1/20 flex items-center justify-center">
                          <span className="text-nasun-black/30 text-lg">
                            No Image
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right: Post info */}
                    <div className="lg:w-1/2 flex flex-col px-10 py-10 lg:py-16 lg:px-16 gap-5 justify-center">
                      <p className="text-xs font-bold tracking-[0.25em] text-nasun-black/40 uppercase">
                        News &amp; Events
                      </p>

                      <TagV2
                        variant="outlineNw2"
                        size="md"
                        className="self-start font-medium uppercase tracking-wider"
                      >
                        {getCategory(post)}
                      </TagV2>

                      <h4 className="font-semibold text-xl lg:text-2xl text-nasun-black leading-snug line-clamp-3">
                        {stripHtml(post.title.rendered)}
                      </h4>

                      <time
                        className="text-nasun-black/50 text-sm"
                        dateTime={post.date}
                      >
                        {formatDate(post.date)}
                      </time>

                      <p className="line-clamp-4 text-nasun-black/70 text-sm leading-relaxed">
                        {stripHtml(post.excerpt.rendered)}
                      </p>

                      <div>
                        <Link to={`/news-events/${post.slug}`}>
                          <ButtonV3
                            variant="gradient"
                            size="sm"
                            className="capitalize"
                          >
                            Read more
                          </ButtonV3>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </Slider>
        </div>
      )}

      {/* Navigation: fixed floating pill at viewport bottom 10%.
          Opacity transition prevents flicker during scroll-snap section transitions. */}
      {Array.isArray(posts) && posts.length > 0 && (
        <div
          className={`absolute bottom-20 left-0 right-0 z-50 flex justify-center transition-opacity duration-300 ${
            isVisible
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="inline-flex items-center rounded-2xl bg-black/50 border border-white/15 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
            <button
              onClick={() => sliderRef.current?.slickPrev()}
              className="flex items-center justify-center w-10 h-10 shrink-0 hover:bg-white/10 transition-colors"
              aria-label="Previous news"
            >
              <ChevronLeftIcon className="w-4 h-4 text-white/70" />
            </button>

            <span className="w-px h-4 bg-white/15 shrink-0" />

            <div className="flex items-center gap-2 px-4">
              {Array.from({ length: postCount }).map((_, dotIndex) => (
                <button
                  key={dotIndex}
                  onClick={() => sliderRef.current?.slickGoTo(dotIndex)}
                  className={`rounded-full transition-all duration-300 ${
                    activeIndex === dotIndex
                      ? "w-5 h-2 bg-white"
                      : "w-2 h-2 bg-white/35 hover:bg-white/60"
                  }`}
                  aria-label={`Go to slide ${dotIndex + 1}`}
                />
              ))}
            </div>

            <span className="w-px h-4 bg-white/15 shrink-0" />

            <button
              onClick={() => sliderRef.current?.slickNext()}
              className="flex items-center justify-center w-10 h-10 shrink-0 hover:bg-white/10 transition-colors"
              aria-label="Next news"
            >
              <ChevronRightIcon className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default React.memo(DevNewsEventsSection);
