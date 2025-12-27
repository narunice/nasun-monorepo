import { Link } from "react-router-dom"

const NavItem = ({
  path,
  label,
  isExternal = false,
  onClick,
  variant = "desktop",
}: {
  path: string
  label: string
  isExternal?: boolean
  onClick?: () => void
  variant?: "desktop" | "mobile"
}) => {
  const baseStyle =
    "px-4 py-2 rounded-md bg-transparent text-gray-300 hover:text-sky-500 hover:bg-transparent text-sm flex items-center h-full"
  const mobileStyle = "w-full text-left"

  return isExternal ? (
    <a
      href={path}
      className={`${baseStyle} ${variant === "mobile" ? mobileStyle : ""}`}
      rel="noopener noreferrer"
      onClick={onClick}
    >
      {label}
    </a>
  ) : (
    <Link
      to={path}
      className={`${baseStyle} ${variant === "mobile" ? mobileStyle : ""}`}
      onClick={onClick}
    >
      {label}
    </Link>
  )
}

export default NavItem
