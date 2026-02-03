/**
 * ThemeToggle - Sun/Moon toggle switch for dark/light theme switching
 */

import { useTheme } from "./ThemeProvider";
import { FaSun, FaMoon } from "react-icons/fa6";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // Resolve "system" to actual theme
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`
        relative w-11 h-6 rounded-full transition-colors duration-300
        ${isDark ? "bg-ne1" : "bg-ne4 ring-1 ring-inset ring-ne2"}
      `}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Sun icon - left */}
      <FaSun
        size={12}
        className={`absolute left-1.5 top-1/2 -translate-y-1/2 text-yellow-500 ${isDark ? "opacity-50" : ""}`}
      />

      {/* Moon icon - right */}
      <FaMoon
        size={11}
        className={`absolute right-1 top-1/2 -translate-y-1/2 text-yellow-400 ${isDark ? "" : "opacity-50"}`}
      />

      {/* Sliding knob */}
      <span
        className={`
          absolute top-1 w-4 h-4 rounded-full shadow-sm
          transition-all duration-300 ease-out z-10
          ${isDark ? "left-1 bg-white" : "right-[5px] bg-ne1"}
        `}
      />
    </button>
  );
}
