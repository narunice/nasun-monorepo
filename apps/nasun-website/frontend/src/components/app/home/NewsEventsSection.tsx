import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { SectionLayout } from "../../layout/SectionLayout";
import { SectionTitle } from "../../ui/SectionTitle";
import { Button } from "../../ui/button";
import { Tag } from "../../ui/tag";
import usePosts, { WP_CATEGORIES } from "../../../hooks/wordpress/usePosts";
import { Post } from "../../../types/post.d";
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
    className={`hidden lg:block absolute top-1/2 z-10 -translate-y-1/2 bg-black/60 p-3 rounded-full shadow-lg hover:bg-black transition-all border border-nasun-white/50 hover:border-white ${
      direction === "left" ? "-left-14" : "-right-14"
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
    6
  );

  // WordPress 카테고리 추출 헬퍼 함수
  const getCategory = (post: Post): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const terms = (post._embedded as any)?.["wp:term"];
    if (terms && Array.isArray(terms) && terms[0] && Array.isArray(terms[0]) && terms[0][0]?.name) {
      return terms[0][0].name;
    }
    return "NEWS";
  };

  const stripHtml = (html: string) => {
    return html.replace(/<[^>]*>?/gm, "");
  };

  // 날짜 포맷 헬퍼 함수
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: true,
    prevArrow: <CustomArrow direction="left" />,
    nextArrow: <CustomArrow direction="right" />,
  };

  return (
    <SectionLayout id="news-events" className="relative min-h-screen">
      {/* 배경 Gradient - 상단은 #2F2D2C, 하단은 nasun-black */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-full z-0"
        style={{
          background: "linear-gradient(to bottom, #2F2D2C 40%, rgb(25, 22, 21) 100%)",
        }}
      />

      {/* 컨텐츠 */}
      <FadeInUp>
        <div className="relative max-w-6xl mx-auto z-10  w-full h-full px-4 md:px-8 mt-6 md:mt-8 lg:mt-10">
          {/* 섹션 타이틀 - Awards & Grants 스타일 */}
          <SectionTitle
            as="h2"
            color="white"
            className="!font-eurostile text-center mt-6 mb-2 sm:my-4 md:my-6 lg:mt-8 xl:mt-10"
          >
            {t("newsEvents.title")}
          </SectionTitle>

          {/* Cards */}
          {loading ? (
            <div className="w-full h-[400px] bg-black/30 animate-pulse rounded-2xl" />
          ) : error ? (
            <div className="w-full text-center py-12 space-y-4">
              <p className="text-orange-400">{error}</p>
              <Button variant="default" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : !Array.isArray(posts) || posts.length === 0 ? (
            <div className="w-full text-center py-12 text-gray-400">No news posts available.</div>
          ) : (
            <div className="w-full dark:[&_.slick-dots]:dots-dark [&_.slick-dots]:!relative [&_.slick-dots]:!bottom-auto [&_.slick-dots]:!mt-0">
              <Slider {...sliderSettings}>
                {posts.map((post) => {
                  const imageUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";

                  return (
                    <Link key={post.id} to={`/news-events/${post.slug}`} className="block px-2">
                      {/* 수평 카드 레이아웃 */}
                      <div className="group flex flex-col md:flex-row bg-black/50 backdrop-blur-md rounded-2xl overflow-hidden border border-nasun-white/50 hover:border-nasun-white/70 transition-all duration-300">
                        {/* 좌측: 이미지 */}
                        <div className="md:w-1/2 md:self-stretch overflow-hidden">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt="Featured"
                              className="block w-full h-64 md:h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-64 md:h-full bg-gradient-to-br from-nasun-c4/30 to-nasun-c3/20 flex items-center justify-center">
                              <span className="text-white/40 text-lg">No Image</span>
                            </div>
                          )}
                        </div>

                        {/* 우측: 콘텐츠 */}
                        <div className="md:w-1/2 p-4 md:p-6 lg:p-10 flex flex-col justify-center">
                          {/* WordPress 카테고리 뱃지 - 왼쪽 정렬 */}
                          <Tag
                            variant="outlineC3"
                            size="md"
                            className="self-center font-medium uppercase tracking-wider"
                          >
                            {getCategory(post)}
                          </Tag>

                          {/* 제목 - 가운데 정렬 */}
                          <h3 className="font-semibold my-4 line-clamp-3 text-center">
                            {stripHtml(post.title.rendered)}
                          </h3>

                          {/* 날짜 */}
                          <time className="text-nasun-white/80 text-center" dateTime={post.date}>
                            {formatDate(post.date)}
                          </time>

                          {/* 설명 - 가운데 정렬 */}
                          <p className="my-4 line-clamp-3 text-center">
                            {stripHtml(post.excerpt.rendered)}
                          </p>

                          {/* Read More 버튼 - 오른쪽 정렬 */}
                          <div className="flex justify-end">
                            <span className="text-nasun-white/80 bg-gray-800 px-4 py-1 rounded-full group-hover:text-nasun-c3 group-hover:bg-gray-900 transition-colors">
                              {t("newsEvents.readMore")}
                            </span>
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
