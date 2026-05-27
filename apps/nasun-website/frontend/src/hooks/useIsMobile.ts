import { useState, useEffect } from "react";

export const useIsMobile = (breakpoint: number = 768) => {
  // Initialize from window synchronously so the first paint matches the
  // device. Defaulting to `false` and flipping in useEffect causes a CLS
  // on mobile (desktop variant briefly renders, then swaps).
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [breakpoint]);

  return isMobile;
};
