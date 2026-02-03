import { useState, useEffect } from "react"
import { Button, Flex } from "@radix-ui/themes"
import DesktopNav from "./DesktopNav"
import MobileMenu from "./MobileMenu"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import LoginButton from "./LoginButton"
import { faCircleUser } from "@fortawesome/free-solid-svg-icons"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/providers/auth"

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 992)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <nav className="fixed pt-3 top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/100 to-black/0">
      <Flex justify="between" align="center" gap="2" className="px-4 max-w-8xl mx-auto">
        {/* 로고 + 햄버거 메뉴 (모바일에서만 표시) */}
        <Flex className="items-center">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault()
              navigate("/")
            }}
            className="min-w-[46px]"
          >
            <img src="/gensol_symbol_red.svg" alt="GEN SOL Symbol" className="h-8 w-auto" />
          </a>
          {isMobileView && (
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
              className="ml-4 text-gray-300 hover:text-[#2eacd6] focus:outline-none bg-transparent hover:bg-transparent"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          )}
        </Flex>

        {/* 데스크탑 네비게이션 (모바일에서는 숨김) */}
        {!isMobileView && <DesktopNav />}

        {/* 모바일 메뉴 */}
        {isMobileView && (
          <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
        )}

        <Flex align="center" gap="3">
          {/* 프로필 버튼 (로그인 시에만 표시) */}
          {isAuthenticated && (
            <Button
              onClick={() => navigate("/my-page")}
              aria-label="My page"
              className="bg-transparent p-0 w-8 h-8 cursor-pointer"
            >
              <FontAwesomeIcon
                icon={faCircleUser}
                className="text-gray-700 dark:text-gray-200 text-3xl dark:hover:text-sf-blue ease-in-out transition-all"
              />
            </Button>
          )}
          <LoginButton />
        </Flex>
      </Flex>
    </nav>
  )
}
export default Navbar
