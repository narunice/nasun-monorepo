import { FadeInUp } from "@/components/common/FadeInUp.tsx"
import { homeContent } from "../../constants/pageContent/homeContent.ts"
import { FadeIn } from "@/components/common/FadeIn.tsx"
import trakkerBloomBlink from "@/assets/videos/trakkerBloomBlink.webm"
import trakkerBloomBlinkVertical from "@/assets/videos/trakkerBloomBlinkVertical.webm"

const OurMissionSection = () => {
  return (
    <>
      <section className="flex relative w-full h-auto overflow-hidden">
        {/* 데스크탑 버전 (md 이상) */}
        <div className="hidden md:block relative w-full h-full">
          <FadeIn>
            <video autoPlay loop muted playsInline>
              <source src={trakkerBloomBlink} type="video/webm" />
            </video>
          </FadeIn>

          {/* 오버레이 배경 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0) 80%, rgba(0, 0, 0, 1) 100%)",
            }}
          ></div>

          {/* 텍스트 컨테이너 - 우측 정렬 */}
          <div className="absolute inset-0 flex items-center justify-end pr-20 lg:pr-32 z-10">
            <div className="max-w-[360px] lg:max-w-[405px] p-8 text-center">
              <FadeInUp>
                <h3 className="mb-8">{homeContent.mission.title}</h3>
              </FadeInUp>

              <FadeInUp delay="0.8s">
                <p className="mb-6">{homeContent.mission.paragraph1}</p>
              </FadeInUp>
              <FadeInUp delay="1.6s">
                <p className="mb-6">{homeContent.mission.paragraph2}</p>
              </FadeInUp>
              <FadeInUp delay="2.4s">
                <p className="mb-6">{homeContent.mission.paragraph3}</p>
              </FadeInUp>
            </div>
          </div>
        </div>

        {/* 모바일 버전 (md 미만) */}
        <div className="md:hidden relative w-full h-auto -mb-[30%]">
          <FadeIn>
            <video
              autoPlay
              loop
              muted
              playsInline
              className="inset-0 w-full h-full object-cover"
              style={{ transform: "translateY(-15%)" }}
            >
              <source src={trakkerBloomBlinkVertical} type="video/webm" />
            </video>
          </FadeIn>

          {/* 오버레이 배경 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 15%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 1) 81%)",
            }}
          ></div>

          {/* 텍스트 컨테이너 - 상단 정렬 */}
          <div className="absolute inset-0 flex justify-center pt-12 z-10">
            <div className="w-full max-w-sm px-6 py-20 text-center">
              <FadeInUp>
                <h3 className="mb-8">{homeContent.mission.title}</h3>
              </FadeInUp>
              <FadeInUp delay="0.8s">
                <p className="mb-6">{homeContent.mission.paragraph1}</p>
              </FadeInUp>
              <FadeInUp delay="1.6s">
                <p className="mb-6">{homeContent.mission.paragraph2}</p>
              </FadeInUp>
              <FadeInUp delay="2.4s">
                <p className="mb-6">{homeContent.mission.paragraph3}</p>
              </FadeInUp>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
export default OurMissionSection
