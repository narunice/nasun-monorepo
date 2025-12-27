// src/types/routes.d.ts
// src/types/routes.d.ts
import { LazyExoticComponent, ComponentType } from "react"

export interface RouteConfig {
  path: string
  element?: LazyExoticComponent<ComponentType<unknown>>
  navItem?: NavItem
  isProtected?: boolean
  hidden?: boolean
}

export interface NavItem {
  name: string
  path: string
  icon?: string | React.ReactNode
  subMenu?: SubMenuItem[]
  hidden?: boolean
  external?: boolean
}

export interface SubMenuItem {
  name: string
  path: string
  element?: LazyExoticComponent<ComponentType<unknown>>
  parentPath?: string
  hidden?: boolean
}

// 라우트 구성 객체 타입
export type RouteConfigBuilder = Record<string, RouteConfig>
