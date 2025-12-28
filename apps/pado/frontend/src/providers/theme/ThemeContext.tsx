import React, { createContext, useState, useEffect } from "react";
import type { Theme, ThemeContextType } from "./themeTypes";

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const getInitialTheme = (): Theme => {
    // 1. Check localStorage
    const savedTheme = localStorage.getItem("pado-theme") as Theme | null;
    if (savedTheme) return savedTheme;

    // 2. Check system preference
    if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }

    // 3. Default: dark
    return "dark";
  };

  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("pado-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
