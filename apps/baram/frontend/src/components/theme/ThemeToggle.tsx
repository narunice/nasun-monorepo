/**
 * ThemeToggle - Sun/Moon toggle switch for dark/light theme switching
 */

import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`
        relative w-10 h-6 rounded-full transition-all duration-[400ms]
        ${isDark ? "bg-indigo-900" : "bg-sky-200"}
      `}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Animated knob - Sun/Moon */}
      <span
        className={`
          absolute top-0.5 w-5 h-5 rounded-full
          transition-all duration-[400ms] ease-out
          ${isDark ? "left-4 bg-gray-100" : "left-0.5 bg-amber-200 shadow-md shadow-amber-100/60"}
        `}
      />
    </button>
  );
}
