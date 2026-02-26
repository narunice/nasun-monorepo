import React from "react";
import { Route, Navigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import type { EnhancedRouteConfig, SubMenuItem } from "../types/routes.d";
import { AdminRoute } from "../features/admin";

const BASE_URL = "https://nasun.io";
const DEFAULT_OG_IMAGE = `${BASE_URL}/Nasun-OG.png`;

interface RouteWithMetaProps {
  route: {
    component: React.ComponentType;
    meta?: {
      title?: string;
      description?: string;
      requiresAuth?: boolean;
      ogImage?: string;
      ogType?: string;
    };
  };
}

export const RouteWithMeta: React.FC<RouteWithMetaProps> = ({ route }) => {
  const Component = route.component;
  const location = useLocation();
  const meta = route.meta;

  const canonicalUrl = `${BASE_URL}${location.pathname.replace(/\/+$/, "") || "/"}`;
  const ogImage = meta?.ogImage || DEFAULT_OG_IMAGE;

  return (
    <>
      {meta && (
        <Helmet>
          {meta.title && <title>{meta.title}</title>}
          {meta.description && <meta name="description" content={meta.description} />}
          {meta.requiresAuth && <meta name="robots" content="noindex" />}
          <link rel="canonical" href={canonicalUrl} />
          {/* Open Graph */}
          {meta.title && <meta property="og:title" content={meta.title} />}
          {meta.description && <meta property="og:description" content={meta.description} />}
          <meta property="og:url" content={canonicalUrl} />
          <meta property="og:image" content={ogImage} />
          <meta property="og:type" content={meta.ogType || "website"} />
          {/* Twitter Card */}
          <meta name="twitter:card" content="summary_large_image" />
          {meta.title && <meta name="twitter:title" content={meta.title} />}
          {meta.description && <meta name="twitter:description" content={meta.description} />}
          <meta name="twitter:image" content={ogImage} />
        </Helmet>
      )}
      <Component />
    </>
  );
};

export type PageTitleMap = Record<string, string>;

/**
 * Renders a flat list of sub-routes from a routeConfig's navItem.subMenu.
 * Handles the common pattern of: index redirect + subMenu.map() with RouteWithMeta.
 */
export function renderNestedRoutes(
  sectionName: string,
  routeConfig: EnhancedRouteConfig,
  defaultSubPath: string | null,
  pageTitleMap: PageTitleMap
): React.ReactNode {
  const basePath = routeConfig.path;
  const subMenu = routeConfig.navItem?.subMenu || [];
  const Component = routeConfig.component;

  const indexElement = defaultSubPath
    ? <Navigate to={`${basePath}/${defaultSubPath}`} replace />
    : <RouteWithMeta route={{ component: Component, meta: routeConfig.meta }} />;

  return (
    <>
      <Route index element={indexElement} />
      {subMenu
        .filter((subItem) => !subItem.external)
        .map((subItem) => renderSubMenuItem(subItem, basePath, sectionName, routeConfig, pageTitleMap))}
    </>
  );
}

function renderSubMenuItem(
  subItem: SubMenuItem,
  basePath: string,
  sectionName: string,
  routeConfig: EnhancedRouteConfig,
  pageTitleMap: PageTitleMap
): React.ReactNode {
  const subPath = subItem.path.replace(`${basePath}/`, "");
  const SubComponent = subItem.element!;
  const pageTitle = pageTitleMap[subItem.name] || subItem.name;

  // Handle nested sub-menus (e.g., /ecosystem/gensol/shooter)
  if (subItem.subMenu && subItem.subMenu.length > 0) {
    const defaultNestedPath = subItem.subMenu[0].path;
    return (
      <Route key={subItem.path} path={subPath}>
        <Route
          index
          element={<Navigate to={defaultNestedPath} replace />}
        />
        {subItem.subMenu.map((nestedItem) => {
          if (nestedItem.path === subItem.path) return null;
          const nestedPath = nestedItem.path.replace(`${subItem.path}/`, "");
          const NestedComponent = nestedItem.element!;
          const nestedTitle = pageTitleMap[nestedItem.name] || nestedItem.name;

          return (
            <Route
              key={nestedItem.path}
              path={nestedPath}
              element={
                <RouteWithMeta
                  route={{
                    ...routeConfig,
                    component: NestedComponent,
                    meta: {
                      title: `NASUN - ${nestedTitle}`,
                      description: `${nestedTitle} page in ${sectionName} section`,
                    },
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
            ...routeConfig,
            component: SubComponent,
            meta: {
              title: `NASUN - ${pageTitle}`,
              description: `${pageTitle} page in ${sectionName} section`,
            },
          }}
        />
      }
    />
  );
}

// Admin route configuration
interface AdminRouteConfig {
  path: string;
  title: string;
  component: React.ComponentType;
}

/**
 * Renders admin routes with consistent AdminRoute wrapper and Helmet metadata.
 */
export function renderAdminRoutes(routes: AdminRouteConfig[]): React.ReactNode {
  return routes.map(({ path, title, component: Component }) => (
    <Route
      key={path}
      path={path}
      element={
        <AdminRoute>
          <Helmet>
            <title>NASUN - {title}</title>
            <meta name="robots" content="noindex, nofollow" />
          </Helmet>
          <Component />
        </AdminRoute>
      }
    />
  ));
}
