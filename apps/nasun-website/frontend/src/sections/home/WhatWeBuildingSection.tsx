import React from "react";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV2 } from "@/components/ui/button-v2";
import gensolVideo from "../../assets/videos/Trakker-Flying-26rf.mp4";

const CustomArrow = ({
  onClick,
  direction,
}: {
  onClick?: () => void;
  direction: "left" | "right";
}) => (
  <button
    onClick={onClick}
    className={`hidden lg:block absolute top-1/2 z-10 -translate-y-1/2 bg-nasun-black/80 p-3 rounded-full shadow-lg hover:bg-nasun-black/60 transition-all border border-nasun-white/30 hover:border-white/50 ${
      direction === "left" ? "-left-14 xl:-left-16" : "-right-14 xl:-right-16"
    }`}
    aria-label={direction === "left" ? "Previous slide" : "Next slide"}
  >
    {direction === "left" ? (
      <ChevronLeftIcon className="w-6 h-6 text-nasun-white/60 transition-all" />
    ) : (
      <ChevronRightIcon className="w-6 h-6 text-nasun-white/60 transition-all" />
    )}
  </button>
);

type SlideData = {
  id: string;
  bgColor: string;
  textColor: "white" | "black";
  category: string;
  description?: string;
  buttonText: string;
  buttonVariant: "red" | "blue" | "white" | "purple";
  link: string;
  video?: string;
};

const SLIDES: SlideData[] = [
  {
    id: "gensol",
    bgColor: "#2d1b3d",
    textColor: "white",
    category: "GAMES \u2022 SHOWS \u2022 FILMS",
    description: "Sci-fi universe powered by the Nasun Community",
    buttonText: "EXPLORE GEN SOL",
    buttonVariant: "red",
    link: "/ip/gensol",
    video: gensolVideo,
  },
  {
    id: "baram",
    bgColor: "#f0ebe3",
    textColor: "black",
    category: "AI",
    description: "The global settlement layer for AI",
    buttonText: "EXPLORE BARAM",
    buttonVariant: "blue",
    link: "/baram",
  },
  {
    id: "pado",
    bgColor: "#0f4f4f",
    textColor: "white",
    category: "UNIFIED ONCHAIN FINANCE",
    buttonText: "EXPLORE PADO",
    buttonVariant: "white",
    link: "/pado-new",
  },
  {
    id: "protocol",
    bgColor: "#1a2744",
    textColor: "white",
    category: "PROTOCOL",
    description: "The decentralized network powering it all",
    buttonText: "EXPLORE NASUN",
    buttonVariant: "purple",
    link: "/about/strategy",
  },
];

const sliderSettings = {
  dots: true,
  infinite: true,
  speed: 500,
  slidesToShow: 1,
  slidesToScroll: 1,
  autoplay: true,
  autoplaySpeed: 10000,
  arrows: true,
  prevArrow: <CustomArrow direction="left" />,
  nextArrow: <CustomArrow direction="right" />,
};

function WhatWeBuildingSection() {
  return (
    <SectionLayout className="relative min-h-screen bg-nasun-black overflow-hidden !justify-start">
      <div className="relative z-10 flex flex-col items-center pt-[max(6rem,10vh)] pb-16 md:pb-20 lg:pb-24 px-4 md:px-8">
        {/* Section Title */}
        <FadeInUp>
          <SectionTitle
            as="h2"
            color="white"
            className="!font-eurostile text-center !mb-10 md:!mb-14 lg:!mb-16 uppercase"
          >
            What We're Building
          </SectionTitle>
        </FadeInUp>

        {/* Carousel Card */}
        <FadeInUp delay="0.2s">
          <div
            className={[
              "relative w-full max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto px-0 lg:px-16 xl:px-20",
              "[&_.slick-dots]:!relative [&_.slick-dots]:!bottom-auto [&_.slick-dots]:!mt-6",
              "[&_.slick-dots_li_button:before]:!text-white/40",
              "[&_.slick-dots_li.slick-active_button:before]:!text-white",
            ].join(" ")}
          >
            <Slider {...sliderSettings}>
              {SLIDES.map((slide) => (
                <div key={slide.id} className="px-1">
                  <div
                    className="relative rounded-sm overflow-hidden aspect-[16/9]"
                    style={{ backgroundColor: slide.bgColor }}
                  >
                    {/* Background Video */}
                    {slide.video && (
                      <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className="absolute inset-0 w-full h-full object-cover"
                      >
                        <source src={slide.video} type="video/mp4" />
                      </video>
                    )}

                    {/* Dark overlay for readability */}
                    {slide.video && (
                      <div className="absolute inset-0 bg-black/30" />
                    )}

                    {/* Content - positioned at bottom */}
                    <div className="relative z-10 flex flex-col items-center justify-end h-full px-6 md:px-12 lg:px-16 pb-10 md:pb-14 lg:pb-16">
                      {/* Category */}
                      <h4
                        className={`font-medium tracking-wider text-center ${
                          slide.textColor === "white" ? "text-white/90" : "text-nasun-black/80"
                        }`}
                      >
                        {slide.category}
                      </h4>

                      {/* Description */}
                      {slide.description && (
                        <p
                          className={`text-base md:text-lg lg:text-xl font-medium text-center max-w-xl mt-3 ${
                            slide.textColor === "white" ? "text-white/60" : "text-nasun-black/50"
                          }`}
                        >
                          {slide.description}
                        </p>
                      )}

                      {/* CTA Button */}
                      <div className="mt-6 lg:mt-8">
                        <ButtonV2
                          variant={slide.buttonVariant}
                          size="lg"
                          asChild
                          className="w-[240px] md:w-[280px]"
                        >
                          <Link to={slide.link}>{slide.buttonText}</Link>
                        </ButtonV2>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </Slider>
          </div>
        </FadeInUp>
      </div>
    </SectionLayout>
  );
}

export default React.memo(WhatWeBuildingSection);
