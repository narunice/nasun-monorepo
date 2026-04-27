import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { TagV2 } from "@/components/ui/tag-v2";
import { ButtonV3 } from "@/components/ui/button-v3";
import usePosts, { WP_CATEGORIES } from "../../../hooks/wordpress/usePosts";
import { Post } from "../../../types/post.d";
import { stripHtmlTags } from "../../../utils/wordpressContent";
import { FadeInUp } from "@/components/ui/FadeInUp";

const CustomArrow = ({
  onClick,
  direction,
}: {
  onClick?: () => void;
  direction: "left" | "right";
}) => (
  <button
    onClick={onClick}
    className={`hidden lg:block absolute top-1/2 z-10 -translate-y-1/2 bg-nasun-white/10 p-3 rounded-full shadow-lg hover:bg-black/50 transition-all border border-nasun-white/50 hover:border-white/60 ${
      direction === "left" ? "-left-24" : "-right-24"
    }`}
    aria-label={direction === "left" ? "Previous news" : "Next news"}
  >
    {direction === "left" ? (
      <ChevronLeftIcon className="w-6 h-6 text-nasun-white/60 transition-all" />
    ) : (
      <ChevronRightIcon className="w-6 h-6 text-nasun-white/60 transition-all" />
    )}
  </button>
);

function NewsEventsSection() {
  const { t } = useTranslation("home");
  const { posts, loading, error, refetch } = usePosts(
    [WP_CATEGORIES.NEWS, WP_CATEGORIES.EVENTS],
    6,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sliderRef = useRef<any>(null);

  useEffect(() => {
    if (posts && posts.length > 0 && sliderRef.current) {
      sliderRef.current.slickPlay();
    }
  }, [posts]);

  // WordPress 카테고리 추출 헬퍼 함수
  const getCategory = (post: Post): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const terms = (post._embedded as any)?.["wp:term"];
    if (terms && Array.isArray(terms) && terms[0] && Array.isArray(terms[0]) && terms[0][0]?.name) {
      return terms[0][0].name;
    }
    return "NEWS";
  };

  const stripHtml = (html: string) => stripHtmlTags(html);

  // 날짜 포맷 헬퍼 함수
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 4000,
    pauseOnHover: false,
    pauseOnFocus: false,
    arrows: true,
    prevArrow: <CustomArrow direction="left" />,
    nextArrow: <CustomArrow direction="right" />,
    customPaging: () => <div className="carousel-dot" />,
  };

  return (
    <SectionLayout id="news-events" className="relative min-h-screen bg-nasun-black">
      {/* 컨텐츠 */}
      <FadeInUp>
        <div className="relative max-w-6xl mx-auto z-10 w-full px-4 md:px-8 lg:px-32 flex flex-col gap-6 md:gap-9 lg:gap-12 mt-8 sm:mt-12 md:mt-16 lg:mt-20 mb-6 md:mb-12 lg:mb-14">
          {/* 섹션 타이틀 - Awards & Grants 스타일 */}
          <SectionTitle as="h2" color="white" className="!font-eurostile text-center">
            {t("newsEvents.title")}
          </SectionTitle>

          {/* Cards */}
          {loading ? (
            <div className="w-full h-[400px] bg-black/30 animate-pulse rounded-2xl" />
          ) : error ? (
            <div className="w-full text-center py-12 space-y-4">
              <p className="text-orange-400">{error}</p>
              <Button variant="black" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : !Array.isArray(posts) || posts.length === 0 ? (
            <div className="w-full text-center py-12 text-gray-400">No news posts available.</div>
          ) : (
            <div className="w-full carousel-dots">
              <Slider ref={sliderRef} {...sliderSettings}>
                {posts.map((post) => {
                  const imageUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";

                  return (
                    <Link key={post.id} to={`/news-events/${post.slug}`} className="block px-2">
                      {/* 수평 카드 레이아웃 */}
                      <div className="group flex flex-col md:flex-row bg-nasun-white overflow-hiddentransition-all duration-300 rounded-sm">
                        {/* 좌측: 이미지 */}
                        <div className="md:w-1/2 md:self-stretch overflow-hidden">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt="Featured"
                              loading="lazy"
                              className="block w-full h-64 md:h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-64 md:h-full bg-gradient-to-br from-nasun-nw4/30 to-nasun-nw1/20 flex items-center justify-center">
                              <span className="text-nasun-black/30 text-lg">No Image</span>
                            </div>
                          )}
                        </div>

                        {/* 우측: 콘텐츠 */}
                        <div className="md:w-1/2 py-3 md:py-5 lg:py-8 px-4 md:px-6 lg:px-10 flex flex-col justify-center gap-3 md:gap-4 lg:gap-4 ">
                          {/* WordPress 카테고리 뱃지 - 왼쪽 정렬 */}
                          <TagV2
                            variant="outlineNw2"
                            size="md"
                            className="self-center font-medium uppercase tracking-wider"
                          >
                            {getCategory(post)}
                          </TagV2>

                          {/* 제목 - 가운데 정렬 */}
                          <h4 className="font-semibold line-clamp-3 text-center pt-1 text-nasun-black">
                            {stripHtml(post.title.rendered)}
                          </h4>

                          {/* 날짜 */}
                          <time className="text-nasun-black/60 text-center" dateTime={post.date}>
                            {formatDate(post.date)}
                          </time>

                          {/* 설명 - 가운데 정렬 */}
                          <p className="line-clamp-3 text-center text-nasun-black/80">
                            {stripHtml(post.excerpt.rendered)}
                          </p>

                          {/* Read More 버튼 - 오른쪽 정렬 */}
                          <div className="flex justify-end">
                            <ButtonV3 variant="gradient" size="sm" className="capitalize mt-1">
                              {t("newsEvents.readMore")}
                            </ButtonV3>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </Slider>
            </div>
          )}
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default React.memo(NewsEventsSection);
