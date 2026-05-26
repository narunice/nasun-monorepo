import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WP_CATEGORIES } from "./wordpress/usePosts";

// Section configuration for post category filtering and prev/next navigation
const SECTION_CONFIG = {
  awardsGrants: {
    categoryIds: [WP_CATEGORIES.AWARDS, WP_CATEGORIES.GRANTS] as number[],
    basePath: "/awards-grants",
  },
  newsEvents: {
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

  // The standalone /updates/news page has been retired; all post-article
  // back-links now land on the /about page's Awards & Grants section, which
  // is the canonical surface for both award and news/event posts.
  const handleBackToSection = useCallback(() => {
    navigate("/about#awards");
  }, [navigate]);

  return {
    currentSection,
    backButtonText: "Back to Awards & Grants",
    handleBackToSection,
  };
}
