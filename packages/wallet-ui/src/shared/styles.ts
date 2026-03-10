/**
 * Shared design tokens and style constants for wallet-ui components.
 * Centralizes repeated Tailwind class patterns to ensure visual consistency.
 *
 * Responsive text scale (3-tier):
 *   mobile (<640px) / tablet (640-1279px) / desktop (>=1280px via xl:)
 */

export const WALLET_STYLES = {
  // === Text Scale Tokens ===
  // Each tier bumps text one step up at xl: breakpoint for desktop readability
  textCaption: "text-[10px] xl:text-xs",
  textLabel: "text-xs xl:text-sm",
  textBody: "text-sm xl:text-base",
  textHeading: "text-base md:text-lg xl:text-xl font-medium",
  textDisplay: "text-xl xl:text-2xl font-bold",

  // === Dropdown Container Tokens ===
  dropdownDesktop: "w-[380px] xl:w-[440px]",
  dropdownCompact: "w-[320px]",
  dropdownMobile: "w-[calc(100vw-32px)] max-w-[420px] max-h-[85vh]",

  // === Component Tokens ===

  // Menu items (Account tab, More menu, action lists)
  menuItem:
    "w-full px-3 py-2.5 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-50/80 dark:hover:bg-zinc-700/50 transition-all duration-150 flex items-center gap-3",

  // Section dividers
  divider: "border-t border-gray-100 dark:border-zinc-700/50 my-2",

  // Section headers / labels
  sectionHeader: "text-xs md:text-sm xl:text-base font-medium text-gray-500 dark:text-zinc-400 mb-2",

  // Primary action button
  primaryButton:
    "px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm xl:text-base transition-colors",

  // Danger / destructive action
  dangerButton:
    "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-300 dark:hover:border-red-500/50 rounded-lg transition-colors",

  // Cancel / secondary button
  secondaryButton:
    "px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors",

  // Text input fields
  input:
    "px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500",

  // Loading skeleton
  skeleton: "bg-gray-200 dark:bg-zinc-700 rounded animate-pulse",

  // Panel header background
  panelHeader: "bg-gray-100 dark:bg-zinc-700/50",

  // Tab content container
  tabContent: "py-1 mx-2 bg-white dark:bg-zinc-800 rounded-b-lg",

  // Icon style for menu items
  menuIcon: "w-4 h-4 text-gray-500 dark:text-zinc-400",

  // === Panel Layout Tokens ===

  // Standard panel container
  panelContainer: "p-4 w-full",

  // Panel title (3-tier responsive: 16px → 18px → 20px)
  panelTitle: "text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white",

  // Close X button (top-right)
  closeButton: "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white transition-colors",

  // Close X icon size
  closeIcon: "w-5 h-5",

  // Back button (inline chevron, left of title)
  backButton: "p-1 -ml-1 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors flex-shrink-0",

  // Back icon size
  backIcon: "w-5 h-5",
} as const;
