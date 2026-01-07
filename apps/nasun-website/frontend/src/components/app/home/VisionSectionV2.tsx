import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import visionVideoPcMP4 from "../../../assets/videos/home-vision-wave-light-desktop.mp4";
import visionVideoMobileMP4 from "../../../assets/videos/home-vision-wave-light-mobile.mp4";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

/**
 * VisionSectionV2 Component
 *
 * A redesigned vision section featuring:
 * - Full-screen background video (same as VisionSection)
 * - Centered vertical text: ENTERTAINMENT, TECHNOLOGY, FINANCE, UNIFIED
 * - CTA button: "JOIN THE BATTALION"
 * - Tagline: "Building the next generation of global IP..."
 */
function VisionSectionV2() {
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Detect mobile device (< 1024px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const videoSrc = isMobile ? visionVideoMobileMP4 : visionVideoPcMP4;

  // Video autoplay handling for iOS
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      video.play().catch(() => {});
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    if (video.readyState >= 1) {
      video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  // IntersectionObserver - play/pause based on visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = videoRef.current;
          if (entry.isIntersecting) {
            video?.play().catch(() => {});
          } else {
            video?.pause();
          }
        });
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const keywords = ["ENTERTAINMENT", "TECHNOLOGY", "FINANCE", "UNIFIED"];

  return (
    <SectionLayout className="relative min-h-screen">
      {/* Background video container - full browser width */}
      <div ref={containerRef} className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-full">
        <video
          key={videoSrc}
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          x-webkit-airplay="allow"
          className="absolute top-0 left-0 w-full h-full object-cover object-center"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      </div>

      {/* Content */}
      <div className="relative z-30 flex flex-col items-center justify-center min-h-screen px-4">
        {/* Keywords */}
        <div className="flex flex-col items-center gap-1 md:gap-2 mb-8 md:mb-12 mt-4 md:mt-6 lg:mt-8">
          {keywords.map((keyword) => (
            <h4
              key={keyword}
              className="!font-eurostile  text-nasun-black/80  uppercase leading-snug"
            >
              {keyword}
            </h4>
          ))}
        </div>

        {/* CTA Button */}
        <Button
          variant="default"
          size="xl"
          asChild
          className="rounded-full font-normal text-base lg:text-lg px-10 mb-12 md:mb-14 lg:mb-16"
        >
          <Link to="/wave1/battalion-nft">WAVE 1 BATTALION</Link>
        </Button>

        {/* Tagline */}
        <p className="font-medium text-base/snug md:text-lg/snug xl:text-xl/snug text-nasun-black/70 text-center max-w-3xl">
          Building the next generation of global IP through coordinated creation.
        </p>
      </div>
    </SectionLayout>
  );
}

export default React.memo(VisionSectionV2);
