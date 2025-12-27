import { useContext } from "react";
import { ThemeContext } from "./ThemeContext";
import type { ThemeContextType } from "./themeTypes";

// 명시적 export 확인!
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

// default export가 아닌 named export인지 확인
