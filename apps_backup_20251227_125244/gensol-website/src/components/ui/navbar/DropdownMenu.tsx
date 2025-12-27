import { useState } from "react"
import NavItem from "./NavItem"

const DropdownMenu = ({
  title,
  items,
  isOpen,
  onOpenChange,
  variant = "desktop",
  onItemClick,
}: {
  title: string
  items: Array<{ name: string; url: string; isExternal?: boolean }>
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: "desktop" | "mobile"
  onItemClick?: () => void
}) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const controlled = typeof isOpen !== "undefined"
  const open = controlled ? isOpen : internalOpen

  const toggleOpen = () => {
    const newState = !open
    if (!controlled) setInternalOpen(newState)
    if (onOpenChange) onOpenChange(newState)
  }

  const baseStyle =
    "px-4 py-1 rounded-md bg-transparent text-gray-300 hover:text-sky-500 hover:bg-transparent text-sm flex items-center h-full"
  const mobileStyle = "w-full h-min text-left"

  return (
    <div className="relative">
      <button
        className={`${baseStyle} ${variant === "mobile" ? mobileStyle : ""} ${
          open ? "text-red-700" : ""
        }`}
        onClick={toggleOpen}
      >
        <span className="font-pirulen font-medium pr-2">{title}</span>
        <svg
          width={variant === "mobile" ? "14" : "12"}
          height={variant === "mobile" ? "14" : "12"}
          viewBox="0 0 12 12"
          className={`transform transition-transform ${open ? "translate-x-1.5" : ""}`}
        >
          <path
            d="M1.50002 4L6.00002 8L10.5 4"
            strokeWidth="1.5"
            stroke="currentColor"
            fill="none"
          />
        </svg>
      </button>

      {open && (
        <div
          className={`
          ${variant === "desktop" ? "absolute left-0 top-full w-48" : "mt-1 w-full"} 
          bg-black py-1 bg-opacity-90 shadow-lg z-50 border-t-4 border-custom-red
        `}
        >
          {items.map((item) => (
            <NavItem
              key={item.name}
              path={item.url}
              label={item.name}
              isExternal={item.isExternal}
              onClick={onItemClick}
              variant={variant}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default DropdownMenu
