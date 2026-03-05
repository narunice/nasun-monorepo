import { useState, useEffect } from "react"
import { Flex } from "@radix-ui/themes"
import DesktopNav from "./DesktopNav"
import MobileMenu from "./MobileMenu"
import { useNavigate } from "react-router-dom"

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
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
        {/* Logo + hamburger menu (mobile only) */}
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

        {/* Desktop navigation (hidden on mobile) */}
        {!isMobileView && <DesktopNav />}

        {/* Mobile menu */}
        {isMobileView && (
          <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
        )}
      </Flex>
    </nav>
  )
}
export default Navbar
