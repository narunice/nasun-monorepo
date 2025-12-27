import { FadeIn } from "@/components/common/FadeIn"
import { FadeInUp } from "@/components/common/FadeInUp"
import { gamesContent } from "@/constants/pageContent/gamesContent"
import BlueBkgd from "@/assets/images/Blue-bkgd.webp"
import Contractor from "@/assets/images/contractor.webp"

const GamePlanSection = () => {
  return (
    <>
      {/* 데스크톱 버전 (lg 이상) */}
      <section className="hidden lg:flex relative w-full flex-row h-[calc(100vh-64px)]">
        {/* 배경 이미지 */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${BlueBkgd})` }}
        />

        {/* 왼쪽 이미지 */}
        <div className="w-1/2 h-full relative overflow-visible z-10">
          <FadeIn>
            <div
              className="absolute inset-0 bg-center bg-no-repeat bg-cover"
              style={{
                backgroundImage: "url(/gensol_symbol_black.svg)",
                backgroundSize: "cover",
                backgroundPosition: "right",
              }}
            ></div>
            <div
              className="absolute w-auto h-[95%] inset-x-0 bottom-0 flex bg-no-repeat -scale-x-100"
              style={{
                backgroundImage: `url(${Contractor})`,
                backgroundSize: "contain",
                backgroundPosition: "bottom",
              }}
            ></div>
          </FadeIn>
        </div>

        {/* 오른쪽 텍스트 */}
        <div className="w-1/2 flex flex-col justify-center px-10 py-16 pr-24 text-white z-10">
          <div>
            <FadeInUp>
              <div className="w-fit mb-6">
                <h6>{gamesContent.gamePlan.category}</h6>
                <h3 className="!font-light">
                  RAISING <span className="whitespace-nowrap font-pirulen font-light">THE STAKES</span>
                </h3>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="space-y-6 max-w-[554px]">
                {gamesContent.gamePlan.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </FadeInUp>
          </div>
        </div>
      </section>

      {/* 모바일 버전 (lg 미만) */}
      <section className="lg:hidden relative w-full">
        {/* 배경 이미지 */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${BlueBkgd})` }}
        />

        {/* 이미지 컨테이너 */}
        <div className="relative w-full z-10 flex justify-center">
          <FadeIn>
            <div
              className="relative w-full max-w-[640px]"
              style={{
                maskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
              }}
            >
              {/* 젠솔 심볼 (배경) - 상단 정렬 */}
              <img
                src="/gensol_symbol_black.svg"
                alt="GenSol Symbol"
                className="w-[640px] h-auto object-contain opacity-90"
              />

              {/* 캐릭터 이미지 (전경) - 하단 정렬 */}
              <div className="absolute inset-0 z-10 flex justify-center items-end">
                <img
                  src={Contractor}
                  alt="Contractor"
                  className="w-[65%] h-auto object-contain -scale-x-100"
                />
              </div>
            </div>
          </FadeIn>
        </div>

        {/* 텍스트 컨텐츠 영역 */}
        <div className="relative z-10 px-10 py-16 text-white">
          <div className="max-w-md md:max-w-xl mx-auto">
            <FadeInUp>
              <div className="w-fit mb-6">
                <h6>{gamesContent.gamePlan.category}</h6>
                <h3 className="!font-light">
                  RAISING <span className="whitespace-nowrap font-pirulen font-light">THE STAKES</span>
                </h3>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="space-y-6">
                {gamesContent.gamePlan.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </FadeInUp>
          </div>
        </div>
      </section>
    </>
  )
}

export default GamePlanSection
