// src/routes/AppRoutes.tsx
import { Routes, Route } from "react-router-dom"
import { Suspense, lazy } from "react"
import PrivateRoute from "./PrivateRoute"
import { Loading } from "@/components/common/Loading"
import { routes, Pages } from "@/config/routesConfig"
import LogoutRouteGate from "./LogoutRouteGate"
import useScrollToTop from "@/hooks/useScrollToTop"

// zkLogin callback page (Nasun Wallet)
const ZkLoginCallback = lazy(() => import("@/pages/ZkLoginCallback"))

const AppRoutes = () => {
  return (
    <Suspense fallback={<Loading />}>
      <ScrollHandler />
      <Routes>
        {/* 인증 관련 라우트 */}
        <Route path={routes.callback.path} element={<Pages.Callback />} />
        <Route path="/auth/callback" element={<ZkLoginCallback />} />
        <Route
          path={routes.logout.path}
          element={
            <LogoutRouteGate>
              <Pages.Logout />
            </LogoutRouteGate>
          }
        />

        {/* 공개 라우트 */}
        <Route path={routes.home.path} element={<Pages.Home />} />
        <Route path={routes.films.path} element={<Pages.Films />} />
        <Route path={routes.games.path} element={<Pages.Games />} />
        <Route path={routes.news.path} element={<Pages.News />} />
        <Route path={routes.newsDetail.path} element={<Pages.PostDetail />} />
        <Route path={routes.comingSoon.path} element={<Pages.ComingSoon />} />

        {/* 보호된 라우트 */}
        <Route
          path={routes.myPage.path}
          element={
            <PrivateRoute>
              <Pages.MyPage />
            </PrivateRoute>
          }
        />

        {/* 404 처리 */}
        <Route path={routes.notFound.path} element={<Pages.NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default AppRoutes

// 스크롤 핸들러 컴포넌트
const ScrollHandler = () => {
  useScrollToTop()
  return null
}
