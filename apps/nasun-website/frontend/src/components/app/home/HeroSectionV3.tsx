import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import fullTrailerVideoMP4 from "../../../assets/videos/Full-Trailer184s-rf29.mp4";
import { InlineLoading } from "../../ui";

interface HeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

// 타입 정의
type ItemType = "text" | "image";

interface TimelineItem {
  id: string;
  type: ItemType;
  content: string;
  enterDur: number;
  exitDur: number;
}

interface TimelineRange {
  id: string;
  start: number; // 시작 시간 (초)
  end: number; // 종료 시간 (초)
  item: TimelineItem;
}

// 타임라인 구간 정의 (초 단위)
// 각 구간은 [show time, hide time] 기준
const TIMELINE_RANGES: TimelineRange[] = [
  {
    id: "GAMES",
    start: 1.33,
    end: 3.03,
    item: { id: "GAMES", type: "text", content: "GAMES", enterDur: 0.3, exitDur: 0.3 },
  },
  {
    id: "FILMS",
    start: 4.16,
    end: 7.05,
    item: { id: "FILMS", type: "text", content: "FILMS", enterDur: 0.26, exitDur: 0.3 },
  },
  {
    id: "FINANCE",
    start: 8.78,
    end: 11.08,
    item: { id: "FINANCE", type: "text", content: "FINANCE", enterDur: 0.3, exitDur: 0.36 },
  },
  {
    id: "EXECUTION",
    start: 12.1,
    end: 14.26,
    item: { id: "EXECUTION", type: "text", content: "EXECUTION", enterDur: 0.3, exitDur: 0.3 },
  },
  {
    id: "LOGO",
    start: 16.09,
    end: 18.1,
    item: {
      id: "LOGO",
      type: "image",
      content: "/NASUN_wordmark-white.png",
      enterDur: 0.26,
      exitDur: 0.3,
    },
  },
];

const animVariants = {
  initial: { scale: 15, opacity: 0, filter: "blur(15px)" },
  enter: (item: TimelineItem | null) => ({
    scale: 1,
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: item?.enterDur || 0.5, ease: "circOut" },
  }),
  exit: (item: TimelineItem | null) => ({
    scale: 0,
    opacity: 0,
    filter: "blur(15px)",
    transition: { duration: item?.exitDur || 0.5, ease: "circIn" },
  }),
};

function HeroSectionV3({ onVideoReady }: HeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [activeItem, setActiveItem] = useState<TimelineItem | null>(null);
  const [areImagesReady, setAreImagesReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);

  // 로고 이미지 프리로드 (동시 로딩 보장)
  useEffect(() => {
    const symbolImg = new Image();
    const wordmarkImg = new Image();
    let symbolLoaded = false;
    let wordmarkLoaded = false;

    const checkBothLoaded = () => {
      if (symbolLoaded && wordmarkLoaded) {
        setAreImagesReady(true);
      }
    };

    symbolImg.onload = () => {
      symbolLoaded = true;
      checkBothLoaded();
    };

    wordmarkImg.onload = () => {
      wordmarkLoaded = true;
      checkBothLoaded();
    };

    symbolImg.src = "/nasun_symbol_white.svg";
    wordmarkImg.src = "/NASUN_wordmark-white.png";
  }, []);

  // 비디오가 재생 가능할 때
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  // 비디오가 실제로 재생 시작될 때
  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

  // 동기화 루프 (Reaction-based Sync)
  useEffect(() => {
    if (!isVideoPlaying) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const syncLoop = () => {
      if (videoRef.current) {
        const currentTime = videoRef.current.currentTime;

        // 현재 시간에 해당하는 아이템 찾기
        const currentRange = TIMELINE_RANGES.find(
          (range) => currentTime >= range.start && currentTime < range.end
        );

        // 상태 업데이트 (불필요한 렌더링 방지)
        setActiveItem((prev) => {
          if (currentRange) {
            // 새 아이템이 있거나, 기존 아이템과 다를 경우 업데이트
            return prev?.id === currentRange.item.id ? prev : currentRange.item;
          } else {
            // 구간에 해당하지 않으면 null (exit 애니메이션 트리거)
            return prev === null ? null : null;
          }
        });
      }
      rafRef.current = requestAnimationFrame(syncLoop);
    };

    rafRef.current = requestAnimationFrame(syncLoop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isVideoPlaying]);

  useEffect(() => {
    // 타임아웃으로 최대 대기 시간 설정 (5초)
    const timeout = setTimeout(() => {
      if (!isVideoLoaded) {
        setIsVideoLoaded(true);
        setIsVideoPlaying(true);
        onVideoReady?.();
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [isVideoLoaded, onVideoReady]);

  const videoSrc = fullTrailerVideoMP4;

  return (
    <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] h-screen overflow-hidden flex items-center justify-center bg-nasun-black">
      {/* 배경 비디오 */}
      <video
        ref={videoRef}
        key={videoSrc}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className={`w-full max-w-none h-full object-cover transition-opacity duration-500 ${
          isVideoPlaying ? "opacity-100" : "opacity-0"
        }`}
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
      >
        <source src={videoSrc} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* 텍스트/이미지 애니메이션 오버레이 */}
      {isVideoPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-[23vh] z-30 pointer-events-none">
          <AnimatePresence mode="wait" custom={activeItem}>
            {activeItem && (
              <motion.div
                key={activeItem.id}
                custom={activeItem}
                variants={animVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                className="flex items-center justify-center"
              >
                {activeItem.type === "text" ? (
                  <h1 className="text-nasun-white !font-changeling text-4xl md:text-6xl lg:text-8xl tracking-widest text-center uppercase drop-shadow-lg">
                    {activeItem.content}
                  </h1>
                ) : (
                  <img
                    src={activeItem.content}
                    alt="NASUN"
                    className="w-48 md:w-64 lg:w-80 object-contain drop-shadow-lg"
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* NASUN 로고 오버레이 (심볼) - V2와 동일한 위치 */}
      {isVideoPlaying && areImagesReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 md:gap-10 z-10 pt-14 -translate-y-[5vh] pointer-events-none">
          <img
            src="/nasun_symbol_white.svg"
            alt="NASUN Symbol"
            className="w-32 md:w-36 lg:w-44 xl:w-48"
          />
        </div>
      )}

      {/* 로딩 오버레이 */}
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}
    </div>
  );
}

export default React.memo(HeroSectionV3);
