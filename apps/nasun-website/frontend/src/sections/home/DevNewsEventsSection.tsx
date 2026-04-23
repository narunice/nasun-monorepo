import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import usePosts, { WP_CATEGORIES } from "../../hooks/wordpress/usePosts";
import { Post } from "../../types/post.d";
import {
  stripHtmlTags,
  decodeHtmlEntities,
} from "../../utils/wordpressContent";

const CONTENT_MAX_WIDTH = "max-w-[1440px]";

// Per-post mobile-only featured image overrides (keyed by post slug).
// Desktop still uses the post's original featured media.
const MOBILE_IMAGE_OVERRIDES: Record<string, string> = {
  "nasun-is-building-pado-prediction-markets-submit-your-ideas-now-and-earn-points":
    "/Predictions-Submit-Ideas-Taroka-Mobile.png",
};

function DevNewsEventsSection() {
  const sliderRef = useRef<Slider>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  const { posts, loading, error, refetch } = usePosts(
    [WP_CATEGORIES.NEWS, WP_CATEGORIES.EVENTS],
    3,
  );

  const postList: Post[] = Array.isArray(posts) ? posts : [];
  const postCount = postList.length;

  const plainTitle = (html: string) =>
    decodeHtmlEntities(stripHtmlTags(html.replace(/<br\s*\/?>/gi, " ")));

  const formatDate = (dateString: string): string =>
    new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const getImageUrl = (post: Post, idx: number): string =>
    !imgErrors[idx] && post._embedded?.["wp:featuredmedia"]?.[0]?.source_url
      ? post._embedded["wp:featuredmedia"][0].source_url
      : "";

  const sliderSettings = {
    dots: false,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: false,
    afterChange: (index: number) => setActiveIndex(index),
  };

  const activePost = postList[activeIndex];

  const navButtons = postCount > 1 && (
    <div className="flex items-center justify-center gap-3">
      <button
        onClick={() => sliderRef.current?.slickPrev()}
        className="flex items-center justify-center w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/80 border border-black/60 backdrop-blur-xl hover:bg-white/90 transition-colors drop-shadow-lg"
        aria-label="Previous news"
      >
        <ChevronLeftIcon className="w-5 h-5 md:w-6 md:h-6 text-black" />
      </button>

      {postList.map((p, i) => (
        <button
          key={p.id}
          onClick={() => sliderRef.current?.slickGoTo(i)}
          className={`rounded-full transition-all duration-300 drop-shadow-lg bg-white ring-1 ring-black/60 ${
            i === activeIndex ? "w-5 h-2" : "w-2 h-2 hover:opacity-90"
          }`}
          aria-label={`Go to news ${i + 1}`}
        />
      ))}

      <button
        onClick={() => sliderRef.current?.slickNext()}
        className="flex items-center justify-center w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/80 border border-black/60 backdrop-blur-xl hover:bg-white/90 transition-colors drop-shadow-lg"
        aria-label="Next news"
      >
        <ChevronRightIcon className="w-5 h-5 md:w-6 md:h-6 text-black" />
      </button>
    </div>
  );

  return (
    <section
      id="dev-news-events"
      className=" relative w-full min-h-screen bg-[#0b1628] flex flex-col items-center pt-10 pb-10 md:pt-14 md:pb-16"
    >
      {/* Section title */}
      <h2 className="!font-eurostile font-semibold uppercase tracking-wider drop-shadow-lg bg-gradient-to-r from-pado-3 to-[#DFF9BE] bg-clip-text text-transparent">
        NEWS
      </h2>

      {/* Featured image carousel */}
      {postCount > 0 && (
        <div className={`relative w-full ${CONTENT_MAX_WIDTH} mt-6`}>
          <Slider ref={sliderRef} {...sliderSettings} className="w-full">
            {postList.map((post, idx) => {
              const imageUrl = getImageUrl(post, idx);
              const mobileOverride = MOBILE_IMAGE_OVERRIDES[post.slug];
              return (
                <div key={post.id} className="outline-none">
                  <div className="w-full flex justify-center overflow-hidden">
                    <div className="relative w-full min-h-[50vh] md:min-h-[60vh] max-h-[65vh] aspect-[4/3] md:aspect-[2/1]">
                      {imageUrl ? (
                        <picture>
                          {mobileOverride && (
                            <source
                              media="(max-width: 767px)"
                              srcSet={mobileOverride}
                            />
                          )}
                          <img
                            src={imageUrl}
                            alt="Featured news"
                            loading={idx === 0 ? "eager" : "lazy"}
                            onError={() =>
                              setImgErrors((prev) => ({ ...prev, [idx]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        </picture>
                      ) : (
                        <div className="w-full h-full bg-pd1/40" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </Slider>

          {/* Landscape: nav overlay on image */}
          {navButtons && (
            <div className="landscape:block hidden absolute bottom-8 md:bottom-12 left-1/2 -translate-x-1/2 z-10">
              {navButtons}
            </div>
          )}
        </div>
      )}

      {/* Portrait: nav below image (no overlap) */}
      {navButtons && (
        <div
          className={`portrait:flex hidden w-full ${CONTENT_MAX_WIDTH} justify-center mt-4 md:mt-6`}
        >
          {navButtons}
        </div>
      )}

      {/* Body: title/date + buttons */}
      <div className={`w-full ${CONTENT_MAX_WIDTH} flex flex-col px-4 md:px-0`}>
        {loading ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="h-7 w-64 rounded bg-pd2/30 animate-pulse" />
            <div className="h-4 w-48 rounded bg-pd2/20 animate-pulse" />
          </div>
        ) : error ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <p
              className="text-pado-3 text-sm"
              style={{ fontFamily: "Rubik, sans-serif" }}
            >
              {error}
            </p>
            <button
              onClick={() => refetch()}
              className="text-xs text-pd4 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : activePost ? (
          <>
            {/* Title + date — stack on mobile, side-by-side on md+ */}
            <div className="mt-4 md:mt-2 flex flex-col md:flex-row items-center md:items-baseline justify-center gap-1 md:gap-3 w-full min-w-0 text-center">
              <Link
                to={`/news-events/${activePost.slug}`}
                className="group min-w-0 max-w-full"
              >
                <h6
                  className="font-light text-pado-4 group-hover:text-pd5 group-hover:underline transition-colors duration-200 drop-shadow-lg line-clamp-2 md:truncate text-base md:text-lg"
                  style={{ fontFamily: "Rubik, sans-serif" }}
                  title={plainTitle(activePost.title.rendered)}
                >
                  {plainTitle(activePost.title.rendered)}
                </h6>
              </Link>
              <time
                className="shrink-0 text-pd4 text-xs md:text-sm drop-shadow-lg"
                style={{ fontFamily: "Rubik, sans-serif" }}
                dateTime={activePost.date}
              >
                {formatDate(activePost.date)}
              </time>
            </div>

            {/* Read More + Go to News buttons */}
            <div className="mt-6 md:mt-10 flex items-center justify-center gap-3 flex-wrap">
              <Link
                to={`/news-events/${activePost.slug}`}
                className="group inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-pd4 text-black hover:bg-pd5 text-sm font-medium drop-shadow-lg transition-colors"
                style={{ fontFamily: "Rubik, sans-serif" }}
              >
                Read More
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </Link>
              <a
                href="https://nasun.io/about/news"
                className="group inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-pd4/60 text-pd4 hover:border-pd5 hover:text-pd5 text-sm font-medium drop-shadow-lg transition-colors"
                style={{ fontFamily: "Rubik, sans-serif" }}
              >
                Go to News
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </a>
            </div>
          </>
        ) : (
          <p
            className="mt-6 text-pd3 text-sm text-center"
            style={{ fontFamily: "Rubik, sans-serif" }}
          >
            No news available.
          </p>
        )}
      </div>
    </section>
  );
}

export default React.memo(DevNewsEventsSection);
