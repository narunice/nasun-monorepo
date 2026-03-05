import { useState } from "react"
import { Flex } from "@radix-ui/themes"
import NavItem from "./NavItem"
import DropdownMenu from "./DropdownMenu"
// import { SOCIAL_LINKS } from "@/constants/socialLinks"

const creativeLinks = [
  { name: "spotlight", url: "/coming-soon" },
  { name: "download", url: "/coming-soon" },
]

const menuItems = [
  { path: "/", label: "Home" },
  { path: "/films", label: "Films" },
  { path: "/games", label: "Games" },
  { path: "/news", label: "News" },
  {
    type: "dropdown",
    label: "Creative",
    items: creativeLinks,
  },
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

const DesktopNav = () => {
  const [hoveredDropdown, setHoveredDropdown] = useState<string | null>(null)

  return (
    <Flex align="center" justify="center" className="flex-1">
      <ul className="flex space-x-4 font-pirulen text-sm font-medium tracking-wider h-full items-center">
        {menuItems.map((item) => {
          if (item.type === "dropdown") {
            return (
              <DropdownMenu
                key={item.label}
                title={item.label}
                items={item.items}
                isOpen={hoveredDropdown === item.label}
                onOpenChange={(open) => setHoveredDropdown(open ? item.label : null)}
              />
            )
          }
          return <NavItem key={item.path} path={item.path ?? ""} label={item.label} />
        })}
      </ul>
    </Flex>
  )
}

export default DesktopNav
