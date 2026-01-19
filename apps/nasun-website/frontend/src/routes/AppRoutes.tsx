// src/routes/AppRoutes.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import React from "react";
import { Helmet } from "react-helmet-async";
import PrivateRoute from "./PrivateRoute";
import { Pages, routesV2 } from "../config/routesConfig";
import useScrollToTop from "../hooks/useScrollToTop";
import LogoutRouteGate from "./LogoutRouteGate";
import PageLoading from "../components/ui/PageLoading";
import { AdminRoute } from "../features/admin";

// Admin pages (lazy loaded)
const AdminDashboard = lazy(() => import("../features/admin/pages/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const WhitelistManagement = lazy(() => import("../features/admin/pages/WhitelistManagement").then(m => ({ default: m.WhitelistManagement })));
const GovernanceManagement = lazy(() => import("../features/admin/pages/GovernanceManagement").then(m => ({ default: m.GovernanceManagement })));
const CreateProposal = lazy(() => import("../features/admin/pages/CreateProposal").then(m => ({ default: m.CreateProposal })));

const AppRoutes = () => {
  return (
    <Suspense fallback={<PageLoading />}>
      <ScrollHandler />
      <Routes>
        {/* Auth Routes */}
        <Route path="/callback" element={<Pages.Callback />} />
        <Route
          path="/logout"
          element={
            <LogoutRouteGate>
              <Pages.Logout />
            </LogoutRouteGate>
          }
        />

        {/* Home Route */}
        <Route path="/" element={<RouteWithMeta route={routesV2.home} />} />
        <Route path="/home" element={<Navigate to="/" replace />} />

        {/* Dynamic Routes from routesV2 */}
        {Object.entries(routesV2)
          .filter(([key]) => !['home', 'ecosystem', 'ip', 'team', 'wave1Campaign', 'updates', 'network', 'about'].includes(key)) // 특별 처리되는 라우트 제외
          .map(([key, routeConfig]) => {
            const RouteElement = routeConfig.isProtected ? (
              <PrivateRoute>
                <RouteWithMeta route={routeConfig} />
              </PrivateRoute>
            ) : (
              <RouteWithMeta route={routeConfig} />
            );

            return (
              <Route
                key={key}
                path={routeConfig.path}
                element={RouteElement}
              />
            );
          })}

        {/* Nested Routes: Network */}
        <Route path="/network">
          <Route index element={<Navigate to="/network/nasun" replace />} />
          {routesV2.network.navItem?.subMenu
            ?.filter((subItem) => !subItem.external) // 외부 링크 제외
            .map((subItem) => {
              const subPath = subItem.path.replace('/network/', '');
              const SubComponent = subItem.element!;

              // 페이지 제목 매핑
              const pageTitleMap: Record<string, string> = {
                'navigation.nasunNetwork': 'Nasun Network',
                'navigation.protocolOverview': 'Protocol Overview',
                'navigation.governance': 'Governance',
              };
              const pageTitle = pageTitleMap[subItem.name] || subItem.name;

              return (
                <Route
                  key={subItem.path}
                  path={subPath}
                  element={
                    <RouteWithMeta
                      route={{
                        ...routesV2.network,
                        component: SubComponent,
                        meta: {
                          title: `NASUN - ${pageTitle}`,
                          description: `${pageTitle} page in Network section`
                        }
                      }}
                    />
                  }
                />
              );
            })}
        </Route>

        {/* Nested Routes: Ecosystem */}
        <Route path="/ecosystem">
          <Route index element={<Navigate to="/ecosystem/pado/main" replace />} />
          {routesV2.ecosystem.navItem?.subMenu?.map((subItem) => {
            const subPath = subItem.path.replace('/ecosystem/', '');
            const SubComponent = subItem.element!;

            // 페이지 제목 매핑 (i18n 키를 실제 표시명으로 변환)
            const pageTitleMap: Record<string, string> = {
              'navigation.pado': 'Pado',
              'navigation.padoMain': 'Pado',
              'navigation.padoSpotPerps': 'Spot & Perps',
              'navigation.padoPrediction': 'Prediction Markets',
              'navigation.padoLending': 'Lending',
              'navigation.padoTokenization': 'Tokenization',
              'navigation.padoStablecoins': 'Stablecoins',
            };
            const pageTitle = pageTitleMap[subItem.name] || subItem.name;

            // 중첩 서브메뉴가 있는 경우 (예: Pado)
            if (subItem.subMenu && subItem.subMenu.length > 0) {
              return (
                <Route key={subItem.path} path={subPath}>
                  <Route
                    index
                    element={<Navigate to={`${subItem.path}/main`} replace />}
                  />
                  {subItem.subMenu.map((nestedItem) => {
                    const nestedPath = nestedItem.path.replace(subItem.path + '/', '');
                    const NestedComponent = nestedItem.element!;
                    const nestedTitle = pageTitleMap[nestedItem.name] || nestedItem.name;

                    return (
                      <Route
                        key={nestedItem.path}
                        path={nestedPath}
                        element={
                          <RouteWithMeta
                            route={{
                              ...routesV2.ecosystem,
                              component: NestedComponent,
                              meta: {
                                title: `NASUN - ${nestedTitle}`,
                                description: `${nestedTitle} page in Ecosystem section`
                              }
                            }}
                          />
                        }
                      />
                    );
                  })}
                </Route>
              );
            }

            return (
              <Route
                key={subItem.path}
                path={subPath}
                element={
                  <RouteWithMeta
                    route={{
                      ...routesV2.ecosystem,
                      component: SubComponent,
                      meta: {
                        title: `NASUN - ${pageTitle}`,
                        description: `${pageTitle} page in Ecosystem section`
                      }
                    }}
                  />
                }
              />
            );
          })}
        </Route>

        {/* Nested Routes: IP */}
        <Route path="/ip">
          <Route index element={<RouteWithMeta route={routesV2.ip} />} />
          {routesV2.ip.navItem?.subMenu?.map((subItem) => {
            const subPath = subItem.path.replace('/ip/', '');
            const SubComponent = subItem.element!;

            // 페이지 제목 매핑
            const pageTitleMap: Record<string, string> = {
              'navigation.genSol': 'GenSol',
              'navigation.genSolMain': 'GenSol',
              'navigation.genSolOverview': 'GenSol Overview',
              'navigation.genSolShooter': 'Multiplayer Shooter',
              'navigation.genSolAnimation': 'Animation Series',
              'navigation.riderStudio': 'Rider Studio',
              'navigation.riderStudioMain': 'Rider Studio',
              'navigation.riderStudioOverview': 'Rider Studio Overview',
              'navigation.wePop': 'WePop',
            };
            const pageTitle = pageTitleMap[subItem.name] || subItem.name;

            // 중첩 서브메뉴가 있는 경우 (예: GenSol)
            if (subItem.subMenu && subItem.subMenu.length > 0) {
              return (
                <Route key={subItem.path} path={subPath}>
                  <Route
                    index
                    element={
                      <RouteWithMeta
                        route={{
                          ...routesV2.ip,
                          component: SubComponent,
                          meta: {
                            title: `NASUN - ${pageTitle}`,
                            description: `${pageTitle} page in IP section`
                          }
                        }}
                      />
                    }
                  />
                  {subItem.subMenu.map((nestedItem) => {
                    // /ip/gensol/overview -> overview
                    const nestedPath = nestedItem.path.replace(subItem.path + '/', '');
                    const NestedComponent = nestedItem.element!;
                    const nestedTitle = pageTitleMap[nestedItem.name] || nestedItem.name;

                    // 메인 항목은 index로 처리되므로 건너뜀
                    if (nestedItem.path === subItem.path) return null;

                    return (
                      <Route
                        key={nestedItem.path}
                        path={nestedPath}
                        element={
                          <RouteWithMeta
                            route={{
                              ...routesV2.ip,
                              component: NestedComponent,
                              meta: {
                                title: `NASUN - ${nestedTitle}`,
                                description: `${nestedTitle} page in IP section`
                              }
                            }}
                          />
                        }
                      />
                    );
                  })}
                </Route>
              );
            }

            return (
              <Route
                key={subItem.path}
                path={subPath}
                element={
                  <RouteWithMeta
                    route={{
                      ...routesV2.ip,
                      component: SubComponent,
                      meta: {
                        title: `NASUN - ${pageTitle}`,
                        description: `${pageTitle} page in IP section`
                      }
                    }}
                  />
                }
              />
            );
          })}
        </Route>

        {/* Nested Routes: Team */}
        <Route path="/team">
          <Route index element={<Navigate to="/team/founders" replace />} />
          {routesV2.team.navItem?.subMenu?.map((subItem) => {
            const subPath = subItem.path.replace('/team/', '');
            const SubComponent = subItem.element!;

            // 페이지 제목 매핑
            const pageTitleMap: Record<string, string> = {
              'navigation.founders': 'Founders',
              'navigation.opportunities': 'Opportunities',
            };
            const pageTitle = pageTitleMap[subItem.name] || subItem.name;

            return (
              <Route
                key={subItem.path}
                path={subPath}
                element={
                  <RouteWithMeta
                    route={{
                      ...routesV2.team,
                      component: SubComponent,
                      meta: {
                        title: `NASUN - ${pageTitle}`,
                        description: `${pageTitle} page in Team section`
                      }
                    }}
                  />
                }
              />
            );
          })}
        </Route>

        {/* Nested Routes: Wave 1 Campaign */}
        <Route path="/wave1">
          <Route index element={<Navigate to="/wave1/battalion-nft" replace />} />
          {routesV2.wave1Campaign.navItem?.subMenu?.map((subItem) => {
            const subPath = subItem.path.replace('/wave1/', '');
            const SubComponent = subItem.element!;

            // 페이지 제목 매핑
            const pageTitleMap: Record<string, string> = {
              'navigation.battalionNft': 'Battalion NFT',
              'navigation.earlyContributors': 'Early Contributors',
              'navigation.giveaways': 'Giveaways',
              'navigation.contests': 'Contests',
            };
            const pageTitle = pageTitleMap[subItem.name] || subItem.name;

            return (
              <Route
                key={subItem.path}
                path={subPath}
                element={
                  <RouteWithMeta
                    route={{
                      ...routesV2.wave1Campaign,
                      component: SubComponent,
                      meta: {
                        title: `NASUN - ${pageTitle}`,
                        description: `${pageTitle} page in Wave 1 Campaign section`
                      }
                    }}
                  />
                }
              />
            );
          })}
        </Route>

        {/* Nested Routes: Updates */}
        <Route path="/updates">
          <Route index element={<Navigate to="/updates/news" replace />} />
          {routesV2.updates.navItem?.subMenu?.map((subItem) => {
            const subPath = subItem.path.replace('/updates/', '');
            const SubComponent = subItem.element!;

            // 페이지 제목 매핑
            const pageTitleMap: Record<string, string> = {
              'navigation.news': 'News',
              'navigation.awards': 'Awards',
              'navigation.roadmap': 'Roadmap',
            };
            const pageTitle = pageTitleMap[subItem.name] || subItem.name;

            return (
              <Route
                key={subItem.path}
                path={subPath}
                element={
                  <RouteWithMeta
                    route={{
                      ...routesV2.updates,
                      component: SubComponent,
                      meta: {
                        title: `NASUN - ${pageTitle}`,
                        description: `${pageTitle} page in Updates section`
                      }
                    }}
                  />
                }
              />
            );
          })}
        </Route>

        {/* Nested Routes: About */}
        <Route path="/about">
          <Route index element={<Navigate to="/about/founders" replace />} />
          {routesV2.about.navItem?.subMenu?.map((subItem) => {
            const subPath = subItem.path.replace('/about/', '');
            const SubComponent = subItem.element!;

            // 페이지 제목 매핑
            const pageTitleMap: Record<string, string> = {
              'navigation.founders': 'Founders',
              'navigation.aboutTeam': 'Team',
              'navigation.opportunities': 'Opportunities',
              'navigation.strategy': 'Strategy',
            };
            const pageTitle = pageTitleMap[subItem.name] || subItem.name;

            return (
              <Route
                key={subItem.path}
                path={subPath}
                element={
                  <RouteWithMeta
                    route={{
                      ...routesV2.about,
                      component: SubComponent,
                      meta: {
                        title: `NASUN - ${pageTitle}`,
                        description: `${pageTitle} page in About section`
                      }
                    }}
                  />
                }
              />
            );
          })}
        </Route>

        {/* Redirect old routes */}
        <Route path="/protocol" element={<Navigate to="/network" replace />} />
        <Route path="/finance" element={<Navigate to="/ecosystem" replace />} />
        <Route path="/ips" element={<Navigate to="/ip" replace />} />

        <Route path="/nft-event" element={<Navigate to="/wave1/battalion-nft" replace />} />
        <Route path="/roadmap" element={<Navigate to="/updates/roadmap" replace />} />
        {/* Vision → Ecosystem 리디렉트 */}
        <Route path="/vision" element={<Navigate to="/ecosystem" replace />} />
        <Route path="/vision/reliance" element={<Navigate to="/ecosystem/pado/main" replace />} />
        <Route path="/vision/roadmap" element={<Navigate to="/updates/roadmap" replace />} />
        <Route path="/vision/network" element={<Navigate to="/network/nasun" replace />} />
        <Route path="/vision/ips" element={<Navigate to="/ip" replace />} />
        <Route path="/vision/ips/gensol" element={<Navigate to="/ip/gensol" replace />} />
        <Route path="/vision/ips/wepop" element={<Navigate to="/ip/wepop" replace />} />
        <Route path="/vision/ips/riderstudio" element={<Navigate to="/ip/riderstudio" replace />} />
        <Route path="/opportunities" element={<Navigate to="/about/opportunities" replace />} />
        <Route path="/team/founders" element={<Navigate to="/about/founders" replace />} />
        <Route path="/team/opportunities" element={<Navigate to="/about/opportunities" replace />} />
        <Route path="/vision/strategy" element={<Navigate to="/about/strategy" replace />} />
        {/* Grants → Awards 리디렉트 */}
        <Route path="/grants" element={<Navigate to="/updates/awards" replace />} />
        <Route path="/updates/grants" element={<Navigate to="/updates/awards" replace />} />

        {/* Headless WordPress Post Detail Page */}
        <Route path="/awards-grants/:slug" element={<Pages.PostDetailPage />} />

        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Helmet>
                <title>NASUN - Admin Dashboard</title>
                <meta name="robots" content="noindex, nofollow" />
              </Helmet>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/whitelist"
          element={
            <AdminRoute>
              <Helmet>
                <title>NASUN - Whitelist Export</title>
                <meta name="robots" content="noindex, nofollow" />
              </Helmet>
              <WhitelistManagement />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/governance"
          element={
            <AdminRoute>
              <Helmet>
                <title>NASUN - Governance Management</title>
                <meta name="robots" content="noindex, nofollow" />
              </Helmet>
              <GovernanceManagement />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/governance/create"
          element={
            <AdminRoute>
              <Helmet>
                <title>NASUN - Create Proposal</title>
                <meta name="robots" content="noindex, nofollow" />
              </Helmet>
              <CreateProposal />
            </AdminRoute>
          }
        />

        {/* Fallback Route */}
        <Route path="*" element={<Pages.NotFound />} />
      </Routes>
    </Suspense>
  );
};

// 메타데이터와 함께 라우트를 렌더링하는 컴포넌트
interface RouteConfig {
  component: React.ComponentType;
  meta?: {
    title?: string;
    description?: string;
    requiresAuth?: boolean;
  };
}

const RouteWithMeta = ({ route }: { route: RouteConfig }) => {
  const Component = route.component;

  return (
    <>
      {route.meta && (
        <Helmet>
          {route.meta.title && <title>{route.meta.title}</title>}
          {route.meta.description && <meta name="description" content={route.meta.description} />}
          {route.meta.requiresAuth && <meta name="robots" content="noindex" />}
        </Helmet>
      )}
      <Component />
    </>
  );
};

export default AppRoutes;

// Scroll handler component
const ScrollHandler = () => {
  useScrollToTop();
  return null;
};
