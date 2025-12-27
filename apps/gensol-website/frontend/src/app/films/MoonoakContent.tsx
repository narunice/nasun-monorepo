import { FadeInUp } from "@/components/common/FadeInUp"
import { filmsContent } from "@/constants/pageContent/filmsContent"
import BlackHoleBkgd from "@/assets/images/Firefly_A cinematic, ultra high-resolution depiction of a massive black hole in deep space, _ 519475.webp"

const MoonoakContentSection = () => {
  return (
    <>
      {/* 데스크탑 뷰 (lg 이상) */}
      <section className="hidden lg:flex relative w-full ">
        {/* 검은색 배경 (기본) */}
        <div className="absolute inset-0 bg-black" />

        {/* 배경 이미지 - 높이 100%, 오른쪽 정렬 */}
        <div
          className="absolute inset-0 bg-no-repeat"
          style={{
            backgroundImage: `url(${BlackHoleBkgd})`,
            backgroundPosition: "right center",
            backgroundSize: "auto 100%",
          }}
        />

        {/* 왼쪽에서 오른쪽으로 검은색 그라데이션 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 35%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0) 75%)",
          }}
        />

        {/* 왼쪽 텍스트 콘텐츠 */}
        <div className="w-2/3 flex flex-col justify-center min-h-[400px] xl:min-h-[800px] py-20 px-10 lg:px-16 text-white z-10">
          <div className="max-w-[600px] mx-auto space-y-6">
            <FadeInUp>
              <div className="w-fit">
                <h6>{filmsContent.moonoak.category}</h6>
                <h3 className="!font-light">{filmsContent.moonoak.title}</h3>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="space-y-6">
                {filmsContent.moonoak.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="">
                <span className="font-normal">{filmsContent.moonoak.status.label}</span>
              </div>
            </FadeInUp>
          </div>
        </div>

        {/* 오른쪽 공간 (이미지 영역) */}
        <div className="w-1/2" />
      </section>

      {/* 모바일/태블릿 뷰 (lg 미만) */}
      <section className="lg:hidden flex flex-col w-full">
        {/* 상단: 텍스트 콘텐츠 (검은 배경) */}
        <div className="bg-black px-10 py-16 text-white">
          <div className="max-w-md md:max-w-xl mx-auto space-y-6">
            <FadeInUp>
              <div className="w-fit">
                <h6>{filmsContent.moonoak.category}</h6>
                <h3 className="!font-light">{filmsContent.moonoak.title}</h3>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="space-y-6">
                {filmsContent.moonoak.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="">
                <span className="font-normal">{filmsContent.moonoak.status.label}</span>
              </div>
            </FadeInUp>
          </div>
        </div>

        {/* 하단: 블랙홀 배경 이미지 - 텍스트 영역과 겹치도록 위로 당김 */}
        <div className="relative w-full overflow-hidden -mt-16">
          {/* 배경 이미지 - 오른쪽 정렬하여 왼쪽이 잘리도록 */}
          <div className="flex justify-end">
            <img src={BlackHoleBkgd} alt="Black Hole" className="min-w-[1000px] h-auto" />
          </div>

          {/* 상단에서 아래로 검은색 그라데이션 (텍스트 영역과 자연스럽게 연결) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 15%, rgba(0,0,0,0) 35%)",
            }}
          />
        </div>
      </section>
    </>
  )
}

export default MoonoakContentSection
