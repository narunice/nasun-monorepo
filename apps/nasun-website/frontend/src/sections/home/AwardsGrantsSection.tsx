import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import usePosts, { WP_CATEGORIES } from "../../hooks/wordpress/usePosts";
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
    className={`hidden lg:block absolute top-1/2 z-10 -translate-y-1/2 bg-nasun-black p-3 rounded-full shadow-lg hover:bg-nasun-black/50 transition-all border border-nasun-white/50 hover:border-white ${
      direction === "left" ? "-left-14" : "-right-14"
    }`}
    aria-label={direction === "left" ? "Previous awards" : "Next awards"}
  >
    {direction === "left" ? (
      <ChevronLeftIcon className="w-6 h-6 text-nasun-white/60 transition-all" />
    ) : (
      <ChevronRightIcon className="w-6 h-6 text-nasun-white/60 transition-all" />
    )}
  </button>
);

function AwardsGrantsSection() {
  const { t } = useTranslation("home");
  const { posts, loading, error, refetch } = usePosts(
    [WP_CATEGORIES.AWARDS, WP_CATEGORIES.GRANTS],
    6,
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const stripHtml = (html: string) => {
    return html.replace(/<[^>]*>?/gm, "");
  };

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 3,
    slidesToScroll: 1,
    arrows: true,
    prevArrow: <CustomArrow direction="left" />,
    nextArrow: <CustomArrow direction="right" />,
    responsive: [
      {
        breakpoint: 1500,
        settings: {
          slidesToShow: 3,
          slidesToScroll: 1,
        },
      },
      {
        breakpoint: 1200,
        settings: {
          slidesToShow: 2,
          slidesToScroll: 1,
        },
      },
      {
        breakpoint: 800,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1,
        },
      },
    ],
  };

  return (
    <SectionLayout id="awards-grants" className="relative text-center min-h-screen bg-black">
      <FadeInUp>
        {/* 컨텐츠 */}
        <div className="relative max-w-8xl mx-auto z-10 h-full">
          {/* Title */}
          <SectionTitle
            as="h2"
            color="white"
            className="!font-eurostile text-center mb-2 sm:mb-4 md:mb-6 lg:mb-8 xl:mb-10 mt-6 sm:mt-18 xl:mt-20"
          >
            {t("awardsGrants.title")}
          </SectionTitle>

          {/* Subtitle */}
          <p className="!text-base md:!text-lg lg:!text-xl !font-medium text-nasun-white/80 uppercase tracking-wide mb-0 md:mb-1 lg:mb-2">
            {t("awardsGrants.subtitle")}
          </p>

          {/* Cards */}
          {loading ? (
            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 ">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-80 bg-black animate-pulse rounded-lg-none " />
              ))}
            </div>
          ) : error ? (
            <div className="w-full text-center py-12 space-y-4 mb-8">
              <p className="text-orange-400">{error}</p>
              <Button variant="default" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : !Array.isArray(posts) || posts.length === 0 ? (
            <div className="w-full text-center py-12 text-nasun-gray mb-8">
              No awards posts available.
            </div>
          ) : (
            <div className="w-full dark:[&_.slick-dots]:dots-dark px-0 md:px-10 lg:px-12 [&_.slick-dots_li.slick-active_button:before]:!text-nasun-c1">
              <Slider {...sliderSettings}>
                {posts.map((post) => {
                  const imageUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";

                  return (
                    <Link
                      key={post.id}
                      to={`/awards-grants/${post.slug}`}
                      className="block py-4 px-4 md:px-6 lg:px-8 h-full mx-auto max-w-xl"
                    >
                      <div className="group h-[446px] flex flex-col bg-nasun-black rounded-sm shadow-lg border border-nasun-white/50 hover:border-nasun-white/70 transition-all duration-300 pt-4 md:pt-5 lg:pt-6 overflow-hidden">
                        {/* Image */}
                        {imageUrl && (
                          <div className="w-full px-4 md:px-5 lg:px-6 pb-2">
                            <div className="w-full h-44 overflow-hidden rounded-sm">
                              <img
                                src={imageUrl}
                                alt="Featured"
                                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                              />
                            </div>
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-grow flex flex-col p-4 md:p-5 lg:p-6 !pt-0">
                          {/* Title */}
                          <h4 className="line-clamp-2 !text-lg md:!text-xl lg:!text-2xl text-nasun-white mb-2 text-left group-hover:text-white transition-colors ">
                            {stripHtml(post.title.rendered)}
                          </h4>
                          {/* Divider */}
                          <hr className="border-nasun-white/50 mb-3" />
                          {/* Date */}{" "}
                          <div className="flex items-center justify-between">
                            <p className=" !text-sm text-nasun-white/80">{formatDate(post.date)}</p>
                          </div>
                          {/* Excerpt */}
                          <p className=" !text-base text-nasun-white/80 line-clamp-2 flex-grow my-1 text-left">
                            {stripHtml(post.excerpt.rendered)}
                          </p>
                          {/* Read More */}
                          <div className="flex justify-end pt-0 md:pt-2 mb-0 md:-mb-2">
                            <Tag
                              variant="filledC1"
                              size="sm"
                              className="!border-none !bg-nasun-c1 text-nasun-black hover:!bg-nasun-c1/80 transition-all capitalize px-8"
                            >
                              {t("awardsGrants.readMore")}
                            </Tag>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </Slider>
            </div>
          )}

          {/* Bottom Description */}
          <p className="!text-sm lg:!text-base text-nasun-white max-w-2xl mx-auto mt-6 mb-6 md:mb-8 lg:mb-10 text-center">
            {t("awardsGrants.footer")}
          </p>
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default React.memo(AwardsGrantsSection);
