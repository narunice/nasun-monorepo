import { Flex } from "@radix-ui/themes"

// import { SOCIAL_LINKS } from "@/constants/socialLinks"
import NavItem from "./NavItem"
// import DropdownMenu from "./DropdownMenu"



const MobileMenu = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const menuItems = [
    { path: "/", label: "Home" },
    { path: "/films", label: "Films" },
    { path: "/games", label: "Games" },
    { path: "/news", label: "News" },

    // {
    //   type: "dropdown",
    //   label: "Socials",
    //   items: SOCIAL_LINKS.map((link) => ({
    //     name: link.name,
    //     url: link.url,
    //     isExternal: true,
    //   })),
    // },
  ]

  return (
    <>
      {/* Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />}

      {/* Menu Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-1/2 md:w-2/5 bg-gray-950 bg-opacity-90 z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Flex direction="column" className="h-full p-4 overflow-y-auto">
          {/* Close Button */}
          <Flex justify="between" align="center" className="mb-6">
            <a href="/" className="pl-3">
              <img src="./gensol_symbol_red.svg" alt="GEN SOL Symbol" className="h-8 w-auto" />
            </a>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-[#2eacd6] bg-transparent hover:bg-transparent"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </Flex>

          {/* Menu Items */}
          <ul className="flex flex-col space-y-5 font-pirulen tracking-wider">
            {menuItems.map((item) => (
              <NavItem
                key={item.path}
                path={item.path || ""}
                label={item.label}
                onClick={onClose}
                variant="mobile"
              />
            ))}
          </ul>
        </Flex>
      </div>
    </>
  )
}

export default MobileMenu
