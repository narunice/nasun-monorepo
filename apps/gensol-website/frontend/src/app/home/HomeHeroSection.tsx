import { FadeIn } from "@/components/common/FadeIn"
import TrailerNoAudio from "@/assets/videos/TrailerNoAudio.webm"
import GensolWordmarkWhite from "@/assets/logo_images/GensolWordmarkWhite.svg"

const NASUN_URL = import.meta.env.VITE_NASUN_URL || "https://nasun.io"

const HomeHeroSection = () => {
  const genesisNftUrl = `${NASUN_URL}/genesis-nft`

  return (
    <FadeIn className="h-screen">
      <section className="relative w-full h-full overflow-hidden">
        {/* 풀스크린 비디오 배경 */}
        <div className="absolute inset-0 w-full h-full">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
            // 중요: 자동 재생을 보장하기 위한 속성 추가
            onCanPlayThrough={(e) =>
              e.currentTarget.play().catch((e) => console.log("Play Failed:", e))
            }
            preload="auto"
          >
            <source src={TrailerNoAudio} type="video/webm" />
            Your browser does not support the video tag.
          </video>
        </div>

        {/* 중앙 컨텐츠 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          {/* 로고 이미지 */}
          <img
            src={GensolWordmarkWhite}
            alt="Gensol Logo"
            className="w-[350px] md:w-[480px] lg:w-[560px] xl:w-[640px] opacity-50"
          />

          {/* 자막 텍스트 */}
          <h5 className="tracking-wider pt-5 pb-2">OWN THE FUTURE</h5>

          {/* 버튼 */}
          <a
            href={genesisNftUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-80 px-5 py-2 bg-sf-red hover:bg-sf-darkred rounded-md font-medium tracking-widest transition-all text-sf-yellow hover:text-sf-blue font-pirulen"
          >
            GENESIS NFT
          </a>
        </div>
      </section>
    </FadeIn>
  )
}
export default HomeHeroSection
