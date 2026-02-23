import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
const battalionNftVideo = "/videos/Battalion-Nft-Letterbox-01-rf22.mp4";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";

interface NftSaleSectionProps {
  shouldLoadVideo?: boolean;
}

// Title animation timing constants (synced with video)
const TITLE_START_TIME = 1.1;
const WORD_FADE_DURATION = 0.45;
const TITLE_END_TIME = 4.33;

/**
 * NftSaleSection - Battalion NFT video with synchronized title animation
 *
 * Video plays when section enters viewport (50% visible) and resets on re-entry.
 * "POWER YOUR DESTINY" title animates in sync with the video timeline via requestAnimationFrame.
 */
function NftSaleSection({ shouldLoadVideo = false }: NftSaleSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const [wordOpacities, setWordOpacities] = useState([0, 0, 0]);

  // Mobile detection (< 1024px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // IntersectionObserver on sectionRef (normal-flow wrapper)
  // threshold: 0.5 ensures video only plays when section is meaningfully visible
  useEffect(() => {
    if (!shouldLoadVideo) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = videoRef.current;
          if (!video) return;

          if (entry.isIntersecting) {
            video.currentTime = 0;
            video.play().catch(() => {});
          } else {
            video.pause();
            setIsVideoPlaying(false);
            setTitleVisible(false);
            setWordOpacities([0, 0, 0]);
          }
        });
      },
      { threshold: 0.5 },
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, [shouldLoadVideo]);

  // Title animation based on video currentTime
  const updateTitleAnimation = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const currentTime = video.currentTime;

    // "POWER YOUR DESTINY" - per-word fade-in
    if (currentTime >= TITLE_START_TIME && currentTime < TITLE_END_TIME) {
      setTitleVisible(true);
      const newOpacities = [0, 1, 2].map((index) => {
        const wordStartTime = TITLE_START_TIME + index * WORD_FADE_DURATION;
        const wordEndTime = wordStartTime + WORD_FADE_DURATION;
        if (currentTime < wordStartTime) return 0;
        if (currentTime >= wordEndTime) return 1;
        return (currentTime - wordStartTime) / WORD_FADE_DURATION;
      });
      setWordOpacities(newOpacities);
    } else {
      setTitleVisible(false);
      setWordOpacities([0, 0, 0]);
    }
  }, []);

  // Animation loop
  useEffect(() => {
    if (!isVideoPlaying) return;

    const animate = () => {
      updateTitleAnimation();
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isVideoPlaying, updateTitleAnimation]);

  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

  return (
    <div ref={sectionRef}>
      <SectionLayout className="relative h-screen overflow-hidden">
        {/* Background Video */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-full bg-nasun-black">
          {shouldLoadVideo && (
            <video
              ref={videoRef}
              loop
              muted
              playsInline
              webkit-playsinline="true"
              preload="metadata"
              onPlaying={handleVideoPlaying}
              className="absolute left-1/2 -translate-x-1/2 -mt-[10%] max-w-9xl w-full min-h-[120%] object-cover object-center"
            >
              <source src={battalionNftVideo} type="video/mp4" />
            </video>
          )}
        </div>

        {/* Bottom Gradient Overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background: "linear-gradient(to bottom, transparent 66%, rgb(25, 22, 21) 100%)",
          }}
        />

        {/* Title Overlay */}
        <div
          className={`absolute ${isMobile ? "bottom-[15%]" : "bottom-[23%]"} left-0 right-0 z-30`}
        >
          {/* POWER YOUR DESTINY */}
          <div
            className={`flex ${isMobile ? "flex-col items-center" : "justify-center items-baseline gap-4"}`}
          >
            <h2
              className={`!font-changeling ${isMobile ? "text-3xl" : ""}`}
              style={{ opacity: titleVisible ? wordOpacities[0] : 0 }}
            >
              POWER
            </h2>
            <h2
              className={`!font-changeling ${isMobile ? "text-3xl" : ""}`}
              style={{ opacity: titleVisible ? wordOpacities[1] : 0 }}
            >
              YOUR
            </h2>
            <h2
              className={`!font-changeling ${isMobile ? "text-3xl" : ""}`}
              style={{ opacity: titleVisible ? wordOpacities[2] : 0 }}
            >
              DESTINY
            </h2>
          </div>
        </div>

        {/* CTA Button */}
        <div className="absolute bottom-[12%] left-0 right-0 z-30 flex justify-center">
          <ButtonV3 asChild variant="gradient" size="md">
            <Link to="/wave1/battalion-nft">Join the Battalion</Link>
          </ButtonV3>
        </div>
      </SectionLayout>
    </div>
  );
}

export default React.memo(NftSaleSection, (prev, next) => {
  return prev.shouldLoadVideo === next.shouldLoadVideo;
});
