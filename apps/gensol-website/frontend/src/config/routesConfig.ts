// src/config/routesConfig.ts
import { lazy } from "react"
import { RouteConfigBuilder } from "../types/routes.d"

// 컴포넌트 직접 참조용 객체
export const Pages = {
  Home: lazy(() => import("@/pages/HomePage")),
  Films: lazy(() => import("@/pages/FilmsPage")),
  Games: lazy(() => import("@/pages/GamesPage")),
  News: lazy(() => import("@/pages/NewsPage")),
  PostDetail: lazy(() => import("@/pages/PostDetailPage")),
  MyPage: lazy(() => import("@/pages/MyPage")),
  Callback: lazy(() => import("@/features/auth/routes/Callback")),
  Logout: lazy(() => import("@/components/ui/LogoutPage")),
  ComingSoon: lazy(() => import("@/components/common/ComingSoon")),
  NotFound: lazy(() => import("@/components/common/NotFoundPage")),
}

// 라우트 구성 객체
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
      hidden: true, // 네비게이션에 표시하지 않음
    },
  },
  callback: {
    path: "/callback",
    element: Pages.Callback,
    navItem: {
      name: "Callback",
      path: "/callback",
      hidden: true, // 네비게이션에 표시하지 않음
    },
  },
  logout: {
    path: "/logout",
    element: Pages.Logout,
    navItem: {
      name: "Logout",
      path: "/logout",
      hidden: true, // 네비게이션에 표시하지 않음
    },
  },
  myPage: {
    path: "/my-page",
    element: Pages.MyPage,
    navItem: {
      name: "My Page",
      path: "/my-page",
    },
    isProtected: true, // 보호된 라우트
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

 

// 라우트 검증 함수
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

// 초기 검증 실행
validateRoutePaths()
