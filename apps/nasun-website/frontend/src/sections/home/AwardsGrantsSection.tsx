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
import { ButtonV3 } from "@/components/ui/button-v3";
import usePosts, { WP_CATEGORIES } from "../../hooks/wordpress/usePosts";
import { stripHtmlTags } from "../../utils/wordpressContent";
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

  const stripHtml = (html: string) => stripHtmlTags(html);

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 3,
    slidesToScroll: 1,
    arrows: true,
    prevArrow: <CustomArrow direction="left" />,
    nextArrow: <CustomArrow direction="right" />,
    customPaging: () => <div className="carousel-dot" />,
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
    <SectionLayout id="awards-grants" className="relative text-center min-h-screen bg-nasun-black">
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
              <Button variant="outlineC4" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : !Array.isArray(posts) || posts.length === 0 ? (
            <div className="w-full text-center py-12 text-nasun-gray mb-8">
              No awards posts available.
            </div>
          ) : (
            <div className="w-full px-0 md:px-10 lg:px-12 carousel-dots">
              <Slider {...sliderSettings}>
                {posts.map((post) => {
                  const imageUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";

                  return (
                    <Link
                      key={post.id}
                      to={`/awards-grants/${post.slug}`}
                      className="block py-4 px-4 md:px-6 lg:px-8 h-full mx-auto max-w-xl"
                    >
                      <div className="group h-[446px] flex flex-col bg-nasun-white rounded-sm shadow-lg transition-all duration-300 overflow-hidden">
                        {/* Image */}
                        {imageUrl && (
                          <div className="w-full aspect-[4/3] overflow-hidden">
                            <img
                              src={imageUrl}
                              alt="Featured"
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                            />
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-grow flex flex-col p-4 md:p-5 lg:p-6 pt-3 md:pt-3.5 lg:pt-4">
                          {/* Title */}
                          <h4 className="line-clamp-2 !text-lg md:!text-xl lg:!text-2xl text-nasun-black mb-2 text-left transition-colors">
                            {stripHtml(post.title.rendered)}
                          </h4>
                          {/* Divider */}
                          <hr className="border-nasun-black/10 mb-3" />
                          {/* Date */}{" "}
                          <div className="flex items-center justify-between">
                            <p className="!text-sm text-nasun-black/60">{formatDate(post.date)}</p>
                          </div>
                          {/* Excerpt */}
                          <p className="!text-base text-nasun-black/80 line-clamp-2 flex-grow my-1 text-left">
                            {stripHtml(post.excerpt.rendered)}
                          </p>
                          {/* Read More */}
                          <div className="flex justify-end pt-0 md:pt-2 mb-0 md:-mb-2">
                            <ButtonV3 variant="gradient" size="sm" className="capitalize">
                              {t("awardsGrants.readMore")}
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
