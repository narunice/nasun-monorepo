import React, { createContext, useState, useEffect } from "react";
import type { Theme, ThemeContextType } from "./themeTypes";

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // 초기 테마를 즉시 계산하여 설정
  const getInitialTheme = (): Theme => {
    // 저장된 테마가 있으면 사용, 없으면 dark (기본값)
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    return savedTheme || "dark";
  };

  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // 초기 테마 설정 (DOM에 dark 클래스 적용)
  useEffect(() => {
    const initialTheme = getInitialTheme();
    setTheme(initialTheme);
    if (initialTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // 테마 토글 함수
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
