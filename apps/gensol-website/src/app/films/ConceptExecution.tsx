// /home/naru/my_apps/monorepo-root/apps/gensol-website/frontend/src/app/films/ConceptExecutionSection.tsx

import { FadeIn } from "@/components/common/FadeIn"
import { FadeInBackground } from "@/components/common/FadeInBackground"
import { FadeInUp } from "@/components/common/FadeInUp"
import { filmsContent } from "@/constants/pageContent/filmsContent"
import WitchDoctorDesktop from "@/assets/gensol/WitchDoctorDesktop.webp"
import WitchDoctorMobile from "@/assets/gensol/WitchDoctorMobile.webp"
import BlueBkgd from "@assets/images/Blue-bkgd.webp"

const ConceptExecutionSection = () => {
  return (
    <>
      {/* 데스크탑 뷰 Concept Execution 영역  */}
      <section className="hidden md:flex relative w-full h-[calc(100vh-64px)] overflow-hidden">
        {/* 배경 이미지 */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${BlueBkgd})` }}
        />

        {/* 이미지 컨테이너 - 그라데이션 오버레이 적용 */}
        <div className="w-1/2 h-full relative overflow-visible z-10">
          <FadeInBackground
            imageUrl={WitchDoctorDesktop}
            className="absolute inset-0"
            maskImage="linear-gradient(to right, black 70%, transparent 100%)"
            webkitMaskImage="linear-gradient(to right, black 70%, transparent 100%)"
            backgroundSize="cover"
            backgroundPosition="center"
            delay="0.3s"
          />
        </div>

        {/* 텍스트 컨텐츠 영역 */}
        <div className="w-1/2 flex flex-col justify-center py-16 pr-12 md:py-20 lg:pr-24 lg:pl-4 lg:py-28 text-white z-10">
          <div className="pl-[10%]">
            <FadeInUp>
              <div className="w-fit mb-6 ">
                <h6>{filmsContent.conceptExecution.category}</h6>
                <h3 className="!font-light">{filmsContent.conceptExecution.title}</h3>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="space-y-6 max-w-[554px]">
                <p>
                  Gen Sol is a striking Sci-Fi universe where every story is driven by the
                  relentless motive to get more spectra. This mysterious energy that can only be
                  sourced from one point in the galaxy not only fuels all the inter-galactic
                  civilizations, it also gives one mystical powers that cannot be controlled.
                </p>
                <p>
                  This sets the backdrop for the overarching narrative where powerful emperors and
                  masterless ronin are all driven by this insatiable desire that drives one to
                  madness and there is no escape.
                </p>
                <p>
                  Filled with exciting stories and compelling characters, come witness the alluring
                  beauty and horrifying terror of Gen Sol.
                </p>
              </div>
            </FadeInUp>
          </div>
        </div>
      </section>

      {/* 모바일 뷰 Concept Execution 영역 */}
      <section className="md:hidden relative w-full overflow-hidden">
        {/* 배경 이미지 */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${BlueBkgd})` }}
        />

        {/* 이미지 컨테이너 */}
        <div className="relative w-full h-auto z-10">
          {/* 이미지 - 하단 20%가 투명하게 페이드아웃 */}
          <FadeIn>
            <img
              src={WitchDoctorMobile}
              alt="Concept Execution"
              className="w-full h-auto object-contain"
              style={{
                maskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
              }}
            />
          </FadeIn>
        </div>

        {/* 텍스트 컨텐츠 영역 */}
        <div className="relative z-10 px-10 py-16 text-white">
          <div className="max-w-md mx-auto">
            <FadeInUp>
              <div className="w-fit mb-6">
                <h6>{filmsContent.conceptExecution.category}</h6>
                <h3 className="!font-light">{filmsContent.conceptExecution.title}</h3>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="space-y-6">
                <p>
                  Gen Sol is a striking Sci-Fi universe where every story is driven by the
                  relentless motive to get more spectra. This mysterious energy that can only be
                  sourced from one point in the galaxy not only fuels all the inter-galactic
                  civilizations, it also gives one mystical powers that cannot be controlled.
                </p>
                <p>
                  This sets the backdrop for the overarching narrative where powerful emperors and
                  masterless ronin are all driven by this insatiable desire that drives one to
                  madness and there is no escape.
                </p>
                <p>
                  Filled with exciting stories and compelling characters, come witness the alluring
                  beauty and horrifying terror of Gen Sol.
                </p>
              </div>
            </FadeInUp>
          </div>
        </div>
      </section>
    </>
  )
}

export default ConceptExecutionSection
