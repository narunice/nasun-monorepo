import { FadeIn } from "@/components/common/FadeIn"
import { FadeInUp } from "@/components/common/FadeInUp"
import CaveCleanedUp from "@/assets/gensol/CaveCleanedUp.webp"

const MysteriesRevealed = () => {
  return (
    <>
      {/* 데스크탑 뷰 (xl 이상) - 고정 높이, cover */}
      <section className="hidden xl:block relative w-full h-[calc(100vh-64px)] overflow-hidden">
        <FadeIn>
          <div
            className="absolute inset-0 bg-center bg-no-repeat bg-cover"
            style={{
              backgroundImage: `url(${CaveCleanedUp})`,
            }}
          ></div>
        </FadeIn>

        {/* Main heading */}
        <div className="absolute z-10 text-white left-[20%] bottom-[15%] -translate-x-1/2 -translate-y-1/2 w-[80%] text-center">
          <FadeInUp>
            <h3 className="font-semibold !tracking-widest">LIVE-ACTION</h3>
          </FadeInUp>
        </div>
      </section>

      {/* 태블릿 뷰 (sm ~ xl) - 이미지 높이에 맞춤, contain */}
      <section className="hidden sm:block xl:hidden relative w-full overflow-hidden">
        <FadeIn>
          <img
            src={CaveCleanedUp}
            alt="Mysteries Revealed"
            className="w-full h-auto object-contain"
          />
        </FadeIn>

        {/* Main heading */}
        <div className="absolute z-10 text-white left-[20%] bottom-[15%] -translate-x-1/2 -translate-y-1/2 w-[80%] text-center">
          <FadeInUp>
            <h3 className="font-semibold !tracking-widest">LIVE-ACTION</h3>
          </FadeInUp>
        </div>
      </section>

      {/* 모바일 뷰 (sm 미만) - min-w 840px, 타이틀 하단 가운데 */}
      <section className="sm:hidden relative w-full overflow-hidden">
        <FadeIn className="flex justify-center">
          <img
            src={CaveCleanedUp}
            alt="Mysteries Revealed"
            className="h-auto object-contain"
            style={{ minWidth: "840px" }}
          />
        </FadeIn>

        {/* Main heading */}
        <div className="absolute z-10 text-white left-1/2 bottom-[10%] -translate-x-1/2 w-[90%] text-center">
          <FadeInUp>
            <h3
              className="font-semibold !tracking-widest"
              style={{ textShadow: "0 2px 8px rgba(0, 0, 0, 0.6)" }}
            >
              LIVE-ACTION
            </h3>
          </FadeInUp>
        </div>
      </section>
    </>
  )
}
export default MysteriesRevealed
