import { FadeInUp } from "@/components/common/FadeInUp"
import AerioBackground from "@assets/images/Aerio-Running-Homepage-Section-Blue-Sky-Saturated.webp"
import AerioBackgroundMobile from "@assets/images/Aerio-Running-Homepage-Section-Blue-Sky-Saturated-mobile.webp"

const AerioSection = () => {
  return (
    <section className="relative flex items-center justify-center w-full min-h-screen h-full overflow-hidden">
      {/* 배경 이미지 - 데스크톱 */}
      <div
        className="absolute inset-0 bg-cover bg-center hidden md:block"
        style={{
          backgroundImage: `url(${AerioBackground})`,
        }}
      />

      {/* 배경 이미지 - 모바일 (상단 고정) */}
      <div
        className="absolute inset-x-0 top-0 bg-cover bg-center bg-no-repeat md:hidden"
        style={{
          backgroundImage: `url(${AerioBackgroundMobile})`,
          height: "70%",
        }}
      />

      {/* 검은 배경 - 모바일 하단 */}
      <div className="absolute inset-0 bg-black md:hidden" style={{ zIndex: -1 }} />

      {/* 그래디언트 오버레이 - 모바일 (이미지에서 검은 배경으로 자연스럽게 연결) */}
      <div
        className="absolute inset-0 md:hidden"
        style={{
          background:
            "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,1) 70%)",
        }}
      />

      {/* 내용 컨테이너 - 데스크톱 (우측 하단) */}
      <div className="max-w-[1640px] mx-auto absolute inset-0 hidden md:flex items-end justify-end z-10 px-14 py-20">
        <FadeInUp>
          <div className="flex flex-col items-end -space-y-1">
            <h2 className="font-pirulen text-white tracking-wider">GAMES</h2>
            <h2 className="font-pirulen text-white tracking-wider">MOVIES</h2>
            <h2 className="font-pirulen text-white tracking-wider">STREAMING</h2>
            <h2 className="font-pirulen text-white tracking-wider">ANIMATION</h2>
          </div>
        </FadeInUp>
      </div>

      {/* 내용 컨테이너 - 모바일 (하단 가운데) */}
      <div className="absolute inset-0 flex md:hidden items-end justify-center z-10 px-6 pb-32">
        <FadeInUp>
          <div className="flex flex-col items-center -space-y-1">
            <h2 className="font-pirulen text-white tracking-wider">GAMES</h2>
            <h2 className="font-pirulen text-white tracking-wider">MOVIES</h2>
            <h2 className="font-pirulen text-white tracking-wider">STREAMING</h2>
            <h2 className="font-pirulen text-white tracking-wider">ANIMATION</h2>
          </div>
        </FadeInUp>
      </div>
    </section>
  )
}

export default AerioSection
