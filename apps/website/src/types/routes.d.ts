// src/types/routes.d.ts
import { LazyExoticComponent, ComponentType } from "react";

// 기존 인터페이스 (하위 호환성 유지)
export interface RouteConfig {
  path: string;
  element?: LazyExoticComponent<ComponentType<object>>;
  navItem: NavItem;
  isProtected?: boolean;
  hidden?: boolean;
}

export interface NavItem {
  name: string;
  path: string;
  icon?: string | React.ReactNode;
  subMenu?: SubMenuItem[];
  hidden?: boolean;
  external?: boolean;
}

export interface SubMenuItem {
  name: string;
  path: string;
  element?: LazyExoticComponent<ComponentType<object>>;
  parentPath?: string;
  hidden?: boolean;
  disabled?: boolean; // 메뉴 항목 비활성화 (Coming Soon 등)
  subMenu?: SubMenuItem[]; // 재귀적 서브메뉴 지원 (3단계 중첩)
  external?: boolean; // 외부 링크 여부
}

// 개선된 라우트 인터페이스 (Phase 2)
export interface EnhancedRouteConfig {
  path: string;
  component: LazyExoticComponent<ComponentType<object>>;
  navItem?: NavItem;
  isProtected?: boolean;
  layout?: 'default' | 'auth' | 'minimal';
  meta?: {
    title?: string;
    description?: string;
    requiresAuth?: boolean;
    preload?: boolean;
  };
}

// 확장된 네비게이션 아이템
export interface EnhancedNavItem extends NavItem {
  weight?: number; // 정렬 순서
  category?: string; // 카테고리 그룹핑
  roles?: string[]; // 접근 권한 역할
}

// 확장된 서브 메뉴 아이템
export interface EnhancedSubMenuItem extends SubMenuItem {
  weight?: number;
  icon?: string | React.ReactNode;
  description?: string;
}

// 라우트 구성 객체 타입
export type RouteConfigBuilder = Record<string, RouteConfig>;
export type EnhancedRouteConfigBuilder = Record<string, EnhancedRouteConfig>;
