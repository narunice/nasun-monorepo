import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-nasun-c4 focus:ring-offset-2 focus:ring-offset-background"
      style={{
        backgroundColor: isDark ? "rgb(75, 85, 99)" : "rgb(209, 213, 219)",
      }}
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
    >
      {/* Sliding knob with icon */}
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-200 ${
          isDark ? "translate-x-8" : "translate-x-1"
        }`}
      >
        {/* Sun Icon (shown when light mode) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgb(234, 179, 8)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${isDark ? "hidden" : "block"}`}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>

        {/* Moon Icon (shown when dark mode) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="rgb(99, 102, 241)"
          stroke="rgb(99, 102, 241)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${isDark ? "block" : "hidden"}`}
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </span>
    </button>
  );
}
