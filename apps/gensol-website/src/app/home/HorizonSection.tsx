import { useEffect, useState } from "react"
import DesktopHorizonSection from "./HorizonDesktop"
import MobileHorizonSection from "./HorizonMobile"

const HorizonSection = () => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // 모바일 여부 체크 함수
    const checkIsMobile = () => {
      const mobileBreakpoint = 768
      setIsMobile(window.innerWidth < mobileBreakpoint)
    }

    // 초기 체크
    checkIsMobile()

    // 리사이즈 이벤트 리스너 추가
    window.addEventListener("resize", checkIsMobile)

    // 클린업
    return () => window.removeEventListener("resize", checkIsMobile)
  }, [])

  return isMobile ? <MobileHorizonSection /> : <DesktopHorizonSection />
}

export default HorizonSection
