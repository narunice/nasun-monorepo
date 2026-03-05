// src/config/routesConfig.ts
import { lazy } from "react"
import { RouteConfigBuilder } from "../types/routes.d"

export const Pages = {
  Home: lazy(() => import("@/pages/HomePage")),
  Films: lazy(() => import("@/pages/FilmsPage")),
  Games: lazy(() => import("@/pages/GamesPage")),
  News: lazy(() => import("@/pages/NewsPage")),
  PostDetail: lazy(() => import("@/pages/PostDetailPage")),
  ComingSoon: lazy(() => import("@/components/common/ComingSoon")),
  NotFound: lazy(() => import("@/components/common/NotFoundPage")),
}

export const routes: RouteConfigBuilder = {
  home: {
    path: "/",
    element: Pages.Home,
    navItem: {
      name: "Home",
      path: "/",
    },
  },
  films: {
    path: "/films",
    element: Pages.Films,
    navItem: {
      name: "Films",
      path: "/films",
    },
  },
  games: {
    path: "/games",
    element: Pages.Games,
    navItem: {
      name: "Games",
      path: "/games",
    },
  },
  news: {
    path: "/news",
    element: Pages.News,
    navItem: {
      name: "News",
      path: "/news",
    },
  },
  newsDetail: {
    path: "/news/:slug",
    element: Pages.PostDetail,
    navItem: {
      name: "News Detail",
      path: "/news/:slug",
      hidden: true,
    },
  },
  comingSoon: {
    path: "/coming-soon",
    element: Pages.ComingSoon,
    navItem: {
      name: "Coming Soon",
      path: "/coming-soon",
    },
  },
  notFound: {
    path: "*",
    element: Pages.NotFound,
    navItem: {
      name: "Not Found",
      path: "*",
    },
  },
}

// Route validation
export const validateRoutePaths = () => {
  const pathMap = new Map<string, string>()

  Object.entries(routes).forEach(([key, config]) => {
    if (pathMap.has(config.path)) {
      console.error(
        `Duplicate path: ${key} and ${pathMap.get(config.path)} both use ${config.path}`
      )
    }
    pathMap.set(config.path, key)

    config.navItem?.subMenu?.forEach((subItem) => {
      const fullPath = subItem.path.startsWith("/")
        ? subItem.path
        : `${config.path}/${subItem.path}`

      if (pathMap.has(fullPath)) {
        console.error(`Duplicate submenu path: ${key}.${subItem.name} uses ${fullPath}`)
      }
      pathMap.set(fullPath, `${key}.${subItem.name}`)
    })
  })
}

validateRoutePaths()
