import { FadeInUp } from "@/components/common/FadeInUp"
import VorexBackground from "@assets/images/Vorex.webp"

const VGamesSection = () => {
  return (
    <>
      {/* 데스크톱 버전 */}
      <section className="relative hidden md:flex items-center justify-center w-full max-h-screen bg-black overflow-hidden">
        {/* 배경 이미지 - 데스크톱 (contain으로 전체 이미지 표시) */}
        <img
          src={VorexBackground}
          alt="V GAMES Background"
          className="w-full h-auto object-contain min-w-[1350px]"
        />

        {/* 내용 컨테이너 - 데스크톱 (좌측 하단) */}
        <div className="max-w-[1640px] mx-auto absolute inset-0 flex items-end justify-start z-10 px-14 py-20">
          <FadeInUp>
            <h2 className="font-pirulen text-4xl lg:text-5xl text-white tracking-wider ml-14">
              V GAMES
            </h2>
          </FadeInUp>
        </div>
      </section>

      {/* 모바일 버전 - 이미지와 타이틀 분리 */}
      <section className="md:hidden flex flex-col h-full bg-black">
        {/* 이미지 영역 */}
        <div className="relative aspect-video w-[130%] -translate-x-28">
          <div
            className="absolute inset-0 bg-cover"
            style={{
              backgroundImage: `url(${VorexBackground})`,
            }}
          />
          {/* 그래디언트 오버레이 - 하단 20% */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, transparent 80%, rgba(0,0,0,1) 100%)",
            }}
          />
        </div>

        {/* 타이틀 영역 - 이미지 아래 */}
        <div className="py-20 flex justify-center">
          <FadeInUp>
            <h1 className="font-pirulen !font-medium text-white tracking-wider">V GAMES</h1>
          </FadeInUp>
        </div>
      </section>
    </>
  )
}

export default VGamesSection
