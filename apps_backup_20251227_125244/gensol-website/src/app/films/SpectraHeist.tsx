// /home/naru/my_apps/monorepo-root/apps/gensol-website/frontend/src/app/films/ConceptExecutionSection.tsx

import { FadeIn } from "@/components/common/FadeIn"
import { FadeInUp } from "@/components/common/FadeInUp"
import { filmsContent } from "@/constants/pageContent/filmsContent"
import Josen from "@/assets/gensol/Josen.webp"
import BlueBkgd from "@/assets/images/Blue-bkgd.webp"

const SpectraHeistSection = () => {
  return (
    <>
      {/* The Spectra Heist 섹션 데스크탑 */}
      <section className="hidden lg:flex relative w-full flex-row-reverse">
        {/* 검은색 배경 (기본) */}
        <div className="absolute inset-0 bg-black" />

        {/* Blue-bkgd 배경 이미지 (오른쪽 정렬) */}
        <div
          className="absolute inset-0 bg-cover"
          style={{
            backgroundImage: `url(${BlueBkgd})`,
            backgroundPosition: "75% center",
          }}
        />

        {/* 왼쪽에서 오른쪽으로 검은색 그라데이션 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 60%)",
          }}
        />

        {/* 오른쪽 이미지 - 하단 정렬, 최대 높이 1000px, 최소 너비 600px */}
        <div className="w-1/2 relative overflow-hidden z-10 flex items-end justify-start">
          <FadeIn className="min-w-[800px] max-w-[1000px] w-full">
            <div className="relative w-full">
              {/* 로고 이미지 - 크기 기준 */}
              <img
                src="/gensol_symbol_white.svg"
                alt="GenSol Symbol"
                className="w-full h-auto object-contain"
              />
              {/* 캐릭터 이미지 - 하단 정렬, xl 이하에서 살짝 왼쪽으로 */}
              <div className="absolute inset-0 z-10 flex justify-center items-end">
                <img
                  src={Josen}
                  alt="Josen"
                  className="w-[62%] h-auto object-contain -translate-x-[12%] xl:translate-x-0"
                />
              </div>
            </div>
          </FadeIn>
        </div>

        {/* 왼쪽 텍스트 */}
        <div className="w-1/2 flex flex-col justify-center py-20 pl-8 pr-0 2xl:px-8 text-white z-10">
          <div className="w-fit ml-auto  max-w-none xl:max-w-[610px] space-y-6">
            <FadeInUp>
              <div className="w-fit ">
                <h6>{filmsContent.spectraHeist.category}</h6>
                <h3 className="!font-light">{filmsContent.spectraHeist.title}</h3>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="space-y-6 ">
                {filmsContent.spectraHeist.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="">
                <span className="font-normal">{filmsContent.spectraHeist.status.label}</span>
                <p>{filmsContent.spectraHeist.status.description}</p>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="">
                {filmsContent.spectraHeist.achievements.map((achievement, index) => (
                  <p key={index} className="italic">
                    {achievement}
                  </p>
                ))}
              </div>
            </FadeInUp>
          </div>
        </div>
      </section>

      {/* The Spectra Heist 섹션 모바일 */}
      <section className="lg:hidden relative w-full bg-black">
        {/* 배경 이미지 - 로고/캐릭터 영역에 중심 맞춤 */}
        <div
          className="absolute inset-0 bg-cover"
          style={{
            backgroundImage: `url(${BlueBkgd})`,
            backgroundPosition: "center top",
          }}
        />

        {/* 위에서 아래로 검은색 그라데이션 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0.6) 78%, rgba(0,0,0,0.9) 88%, rgba(0,0,0,1) 95%)",
          }}
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
                src="/gensol_symbol_white.svg"
                alt="GenSol Symbol"
                className="w-[640px] h-auto object-contain opacity-90"
              />

              {/* Josen 이미지 (전경) - 하단 정렬 */}
              <div className="absolute inset-0 z-10 flex justify-center items-end">
                <img src={Josen} alt="Josen" className="w-[65%] h-auto object-contain" />
              </div>
            </div>
          </FadeIn>
        </div>

        {/* 텍스트 컨텐츠 영역 */}
        <div className="relative z-10 px-10 py-16 text-white">
          <div className="max-w-md md:max-w-xl mx-auto">
            <FadeInUp>
              <div className="w-fit mb-6">
                <h6>{filmsContent.spectraHeist.category}</h6>
                <h3 className="!font-light">{filmsContent.spectraHeist.title}</h3>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="space-y-6">
                {filmsContent.spectraHeist.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="mt-8">
                <span className="font-normal">{filmsContent.spectraHeist.status.label}</span>
                <p>{filmsContent.spectraHeist.status.description}</p>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="mt-8">
                {filmsContent.spectraHeist.achievements.map((achievement, index) => (
                  <p key={index} className="italic">
                    {achievement}
                  </p>
                ))}
              </div>
            </FadeInUp>
          </div>
        </div>
      </section>
    </>
  )
}

export default SpectraHeistSection
