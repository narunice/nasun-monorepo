import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WP_CATEGORIES } from "./wordpress/usePosts";

// Section configuration for back button and navigation
const SECTION_CONFIG = {
  awardsGrants: {
    backButtonText: "Back to Awards & Grants",
    sectionId: "awards-grants",
    categoryIds: [WP_CATEGORIES.AWARDS, WP_CATEGORIES.GRANTS] as number[],
    basePath: "/awards-grants",
  },
  newsEvents: {
    backButtonText: "Back to News & Events",
    sectionId: "news-events",
    categoryIds: [WP_CATEGORIES.NEWS, WP_CATEGORIES.EVENTS] as number[],
    basePath: "/news-events",
  },
};

export function usePostSectionNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine which section the post came from based on URL path
  const isNewsEvents = location.pathname.startsWith("/news-events/");
  const currentSection = isNewsEvents ? SECTION_CONFIG.newsEvents : SECTION_CONFIG.awardsGrants;

  // Back to Section 클릭 시 context-aware 네비게이션
  const referrer = (location.state as { from?: string })?.from;

  const handleBackToSection = useCallback(() => {
    if (referrer === "/news") {
      navigate("/news");
    } else {
      navigate("/");
      setTimeout(() => {
        const element = document.getElementById(currentSection.sectionId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 300);
    }
  }, [navigate, currentSection.sectionId, referrer]);

  const backButtonText = referrer === "/news" ? "Back to News" : currentSection.backButtonText;

  return {
    currentSection,
    backButtonText,
    handleBackToSection,
  };
}
