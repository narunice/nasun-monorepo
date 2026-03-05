// src/routes/AppRoutes.tsx
import { Routes, Route } from "react-router-dom"
import { Suspense } from "react"
import { Loading } from "@/components/common/Loading"
import { routes, Pages } from "@/config/routesConfig"
import useScrollToTop from "@/hooks/useScrollToTop"

const AppRoutes = () => {
  return (
    <Suspense fallback={<Loading />}>
      <ScrollHandler />
      <Routes>
        <Route path={routes.home.path} element={<Pages.Home />} />
        <Route path={routes.films.path} element={<Pages.Films />} />
        <Route path={routes.games.path} element={<Pages.Games />} />
        <Route path={routes.news.path} element={<Pages.News />} />
        <Route path={routes.newsDetail.path} element={<Pages.PostDetail />} />
        <Route path={routes.comingSoon.path} element={<Pages.ComingSoon />} />

        {/* 404 */}
        <Route path={routes.notFound.path} element={<Pages.NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default AppRoutes

const ScrollHandler = () => {
  useScrollToTop()
  return null
}
