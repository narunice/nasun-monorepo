import { FadeIn } from "@/components/common/FadeIn"
import { homeContent } from "../../constants/pageContent/homeContent"
import "../../style/homePage.css"
import { FadeInUp } from "@/components/common/FadeInUp"
import AerioHeadTurning from "@/assets/videos/AerioHeadTurning.webm"

const ProjectStrengthsSection = () => {
  // 태그 데이터
  const { tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8 } = homeContent.projectStrengths

  // 태그 위치 정보 배열
  const tags = [
    { data: tag1, position: { x: "35%", y: "15%" }, index: 0, delay: 0, duration: 5, size: 3.5 },
    { data: tag2, position: { x: "65%", y: "15%" }, index: 1, delay: 0.8, duration: 6, size: 4.5 },
    { data: tag3, position: { x: "20%", y: "35%" }, index: 2, delay: 1.6, duration: 4, size: 3 },
    {
      data: tag4,
      position: { x: "80%", y: "35%" },
      index: 3,
      delay: 1,
      duration: 6,
      size: 3.5,
    },
    {
      data: tag5,
      position: { x: "20%", y: "65%" },
      index: 4,
      delay: 0.5,
      duration: 7,
      size: 4,
    },
    { data: tag6, position: { x: "80%", y: "65%" }, index: 5, delay: 1.2, duration: 4, size: 5 },
    { data: tag7, position: { x: "35%", y: "85%" }, index: 6, delay: 2.8, duration: 10, size: 5.5 },
    {
      data: tag8,
      position: { x: "65%", y: "85%" },
      index: 7,
      delay: 3.4,
      duration: 5,
      size: 4,
    },
  ]

  // 빨간 원 SVG 컴포넌트
  const RedCircle = ({ delay }: { delay: number }) => (
    <div
      className={`absolute inset-0 m-auto rounded-full border-[1px] border-sf-red animate-pulse-circle opacity-0`}
      style={{
        animationDelay: `${delay}s`,
        width: "60vw",
        height: "60vw",
      }}
    />
  )

  // 펄스 점 컴포넌트
  const PulsePoint = ({
    isLeft,
    delay,
    duration,
    size,
  }: {
    isLeft: boolean
    delay: number
    duration: number
    size: number
  }) => (
    <div
      className={`absolute ${
        isLeft ? "left-0" : "right-0"
      } h-full flex items-center justify-center`}
    >
      <div className="relative w-3 h-3 flex items-center justify-center">
        {/* 중심 점 */}
        <svg
          className="absolute z-10 w-3 h-3"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 2.83 2.83"
        >
          <circle className="fill-[#2eacd6]" cx="1.42" cy="1.42" r="0.92" />
        </svg>

        {/* 퍼지는 원 */}
        <div
          className={`absolute rounded-full border-1 border-gray-400`}
          style={{
            animation: `pulse-scale ${duration}s infinite ease-out ${delay}s`,
            width: `${size}rem`,
            height: `${size}rem`,
            backgroundColor: "rgba(46, 172, 230, 0.2)",
          }}
        ></div>
      </div>
    </div>
  )

  // 태그 아이템 컴포넌트
  const TagItem = ({
    data,
    position,
    index,
    delay,
    duration,
    size,
  }: {
    data: string | string[]
    position: { x: string; y: string }
    index: number
    delay: number
    duration: number
    size: number
  }) => {
    const isEven = index % 2 === 1 // 짝수 인덱스 태그는 우측에 위치

    return (
      <div
        className="absolute text-center transform -translate-x-1/2 -translate-y-1/2 flex items-center"
        style={{
          left: position.x,
          top: position.y,
          width: "auto",
          maxWidth: "300px",
          flexDirection: isEven ? "row-reverse" : "row",
        }}
      >
        <FadeInUp delay="0.6s">
          {/* 펄스 점 - 좌측 태그는 오른쪽에, 우측 태그는 왼쪽에 배치 */}
          <PulsePoint isLeft={isEven} delay={delay} duration={duration} size={size} />

          <div className={`${isEven ? "ml-6" : "mr-6"}`}>
            {Array.isArray(data) ? (
              <div className="space-y-1 p-3 rounded-lg">
                <p className="text-left">{data[0]}</p>
                {data.slice(1).map((item, i) => (
                  <p key={i} className="text-left">
                    {item}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-left p-3 rounded-lg">{data}</p>
            )}
          </div>
        </FadeInUp>
      </div>
    )
  }

  return (
    <section className="flex relative w-full lg:min-h-screen overflow-hidden items-center justify-center">
      {/* 데스크탑 뷰*/}
      <div className="hidden lg:flex w-full h-full">
        {/* 비디오 배경 */}
        <FadeIn delay="0s">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src={AerioHeadTurning} type="video/webm" />
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

        {/* 애니메이션 원들 */}
        <RedCircle delay={0} />
        <RedCircle delay={12} />

        {/* 태그들 주변 배치 */}
        {tags.map((tag, index) => (
          <TagItem
            key={index}
            data={tag.data}
            position={tag.position}
            index={index}
            delay={tag.delay}
            duration={tag.duration}
            size={tag.size}
          />
        ))}

        {/* 타이틀 - 섹션 양쪽 끝에 배치 */}
        <div className="absolute flex flex-row w-full px-[5%] justify-between top-1/2 transform -translate-y-1/2">
          <FadeInUp>
            <h3 className="!text-sf-blue">{homeContent.projectStrengths.title1}</h3>
          </FadeInUp>
          <FadeInUp>
            <h3 className="!text-sf-blue">{homeContent.projectStrengths.title2}</h3>
          </FadeInUp>
        </div>
      </div>

      {/* 모바일 뷰*/}
      <div className="flex flex-col lg:hidden w-full h-full">
        <div className="relative w-auto h-[85svh] overflow-hidden">
          <FadeIn>
            {/* 비디오 배경 */}
            <video autoPlay loop muted playsInline className="absolute w-full h-full object-cover">
              <source src={AerioHeadTurning} type="video/webm" />
            </video>
          </FadeIn>
          <div className="absolute top-2/3 bottom-0 left-0 right-0 pointer-events-none bg-gradient-to-b from-transparent via-black/50 to-black" />

          {/* 오버레이 배경 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0) 80%, rgba(0, 0, 0, 1) 100%)",
            }}
          ></div>

          {/* 애니메이션 원들 */}
          <RedCircle delay={0} />
          <RedCircle delay={12} />
        </div>

        {/* 콘텐츠 영역 */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 pt-8 pb-20 space-y-9">
          {/* 타이틀 - 가운데 정렬 */}
          <FadeInUp>
            <div className="flex flex-col items-center">
              <h3 className="!text-sf-blue text-center">{homeContent.projectStrengths.title1}</h3>
              <h3 className="!text-sf-blue text-center">{homeContent.projectStrengths.title2}</h3>
            </div>
          </FadeInUp>

          <div className="relative w-full h-auto flex items-center justify-center">
            {/* 전체 컨테이너 - flex로 가운데 정렬 */}
            <FadeInUp delay="0.4s">
              <div className="flex items-center justify-center gap-4 max-w-full px-1">
                {/* 왼쪽 텍스트 */}
                <div className="text-right max-w-[290px] flex-1">
                  {homeContent.projectStrengths.tag1.map((tag, index) => (
                    <p key={index}>{tag}</p>
                  ))}
                </div>

                {/* 펄스 포인트 - 고정 크기로 가운데 유지 */}
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                  <svg
                    className="absolute z-10 w-3 h-3"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 2.83 2.83"
                  >
                    <circle className="fill-[#2eacd6]" cx="1.42" cy="1.42" r="0.92" />
                  </svg>
                  <div
                    className="absolute rounded-full border border-gray-400"
                    style={{
                      animation: `pulse-scale 3s infinite ease-out 0s`,
                      width: `2.5rem`,
                      height: `2.5rem`,
                      backgroundColor: "rgba(46, 172, 230, 0.2)",
                    }}
                  ></div>
                </div>

                {/* 오른쪽 텍스트 */}
                <div className="text-left max-w-[290px] flex-1">
                  {Array.isArray(homeContent.projectStrengths.tag2) ? (
                    homeContent.projectStrengths.tag2.map((tag, index) => <p key={index}>{tag}</p>)
                  ) : (
                    <p>{homeContent.projectStrengths.tag2}</p>
                  )}
                </div>
              </div>
            </FadeInUp>
          </div>
          <div className="relative w-full h-auto flex items-center justify-center">
            {/* 전체 컨테이너 - flex로 가운데 정렬 */}
            <FadeInUp delay="0.4s">
              <div className="flex items-center justify-center gap-4 max-w-full px-1">
                {/* 왼쪽 텍스트 */}
                <div className="text-right max-w-[290px] flex-1">
                  {homeContent.projectStrengths.tag3.map((tag, index) => (
                    <p key={index}>{tag}</p>
                  ))}
                </div>

                {/* 펄스 포인트 - 고정 크기로 가운데 유지 */}
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                  <svg
                    className="absolute z-10 w-3 h-3"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 2.83 2.83"
                  >
                    <circle className="fill-[#2eacd6]" cx="1.42" cy="1.42" r="0.92" />
                  </svg>
                  <div
                    className="absolute rounded-full border border-gray-400"
                    style={{
                      animation: `pulse-scale 3s infinite ease-out 0.4s`,
                      width: `2.5rem`,
                      height: `2.5rem`,
                      backgroundColor: "rgba(46, 172, 230, 0.2)",
                    }}
                  ></div>
                </div>

                {/* 오른쪽 텍스트 */}
                <div className="text-left max-w-[290px] flex-1">
                  {Array.isArray(homeContent.projectStrengths.tag4) ? (
                    homeContent.projectStrengths.tag4.map((tag, index) => <p key={index}>{tag}</p>)
                  ) : (
                    <p>{homeContent.projectStrengths.tag4}</p>
                  )}
                </div>
              </div>
            </FadeInUp>
          </div>

          <div className="relative w-full h-auto flex items-center justify-center">
            {/* 전체 컨테이너 - flex로 가운데 정렬 */}
            <FadeInUp delay="0.5s">
              <div className="flex items-center justify-center gap-4 max-w-full px-1">
                {/* 왼쪽 텍스트 */}
                <div className="text-right max-w-[290px] flex-1">
                  {homeContent.projectStrengths.tag5.map((tag, index) => (
                    <p key={index}>{tag}</p>
                  ))}
                </div>

                {/* 펄스 포인트 - 고정 크기로 가운데 유지 */}
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                  <svg
                    className="absolute z-10 w-3 h-3"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 2.83 2.83"
                  >
                    <circle className="fill-[#2eacd6]" cx="1.42" cy="1.42" r="0.92" />
                  </svg>
                  <div
                    className="absolute rounded-full border border-gray-400"
                    style={{
                      animation: `pulse-scale 3s infinite ease-out 0.8s`,
                      width: `2.5rem`,
                      height: `2.5rem`,
                      backgroundColor: "rgba(46, 172, 230, 0.2)",
                    }}
                  ></div>
                </div>

                {/* 오른쪽 텍스트 */}
                <div className="text-left max-w-[290px] flex-1">
                  {Array.isArray(homeContent.projectStrengths.tag6) ? (
                    homeContent.projectStrengths.tag6.map((tag, index) => <p key={index}>{tag}</p>)
                  ) : (
                    <p>{homeContent.projectStrengths.tag6}</p>
                  )}
                </div>
              </div>
            </FadeInUp>
          </div>

          <div className="relative w-full h-auto flex items-center justify-center">
            {/* 전체 컨테이너 - flex로 가운데 정렬 */}
            <FadeInUp delay="0.5s">
              <div className="flex items-center justify-center gap-4 max-w-full px-1">
                {/* 왼쪽 텍스트 */}
                <div className="text-right max-w-[290px] flex-1">
                  {homeContent.projectStrengths.tag7.map((tag, index) => (
                    <p key={index}>{tag}</p>
                  ))}
                </div>

                {/* 펄스 포인트 - 고정 크기로 가운데 유지 */}
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                  <svg
                    className="absolute z-10 w-3 h-3"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 2.83 2.83"
                  >
                    <circle className="fill-[#2eacd6]" cx="1.42" cy="1.42" r="0.92" />
                  </svg>
                  <div
                    className="absolute rounded-full border border-gray-400"
                    style={{
                      animation: `pulse-scale 3s infinite ease-out 0.2s`,
                      width: `2.5rem`,
                      height: `2.5rem`,
                      backgroundColor: "rgba(46, 172, 230, 0.2)",
                    }}
                  ></div>
                </div>

                {/* 오른쪽 텍스트 */}
                <div className="text-left max-w-[290px] flex-1">
                  {Array.isArray(homeContent.projectStrengths.tag8) ? (
                    homeContent.projectStrengths.tag8.map((tag, index) => <p key={index}>{tag}</p>)
                  ) : (
                    <p>{homeContent.projectStrengths.tag8}</p>
                  )}
                </div>
              </div>
            </FadeInUp>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ProjectStrengthsSection
