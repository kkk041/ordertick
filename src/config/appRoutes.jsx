import React, { lazy } from 'react'
import {
  AppstoreOutlined,
  BarChartOutlined,
  FileTextOutlined,
  HistoryOutlined,
  LineChartOutlined,
  NotificationOutlined,
  SlidersOutlined,
  SettingOutlined,
} from '@ant-design/icons'

const OverviewPage = lazy(() => import('../pages/dashboard/OverviewPage'))
const AnalyticsPage = lazy(() => import('../pages/dashboard/AnalyticsPage'))
const RevenueTrendsPage = lazy(
  () => import('../pages/dashboard/RevenueTrendsPage'),
)
const HistoryOrdersPage = lazy(
  () => import('../pages/dashboard/HistoryOrdersPage'),
)
const AppSettingsPage = lazy(() => import('../pages/system/AppSettingsPage'))
const ChangelogPage = lazy(() => import('../pages/system/ChangelogPage'))

export const menuRouteGroups = [
  {
    key: 'dashboard',
    label: '工作台',
    icon: <AppstoreOutlined />,
    children: [
      {
        key: '/dashboard/overview',
        path: '/dashboard/overview',
        label: '接单计时',
        icon: <FileTextOutlined />,
        component: OverviewPage,
      },
      {
        key: '/dashboard/analytics',
        path: '/dashboard/analytics',
        label: '今日数据',
        icon: <BarChartOutlined />,
        component: AnalyticsPage,
      },
      {
        key: '/dashboard/revenue-trends',
        path: '/dashboard/revenue-trends',
        label: '收入走势',
        icon: <LineChartOutlined />,
        component: RevenueTrendsPage,
      },
      {
        key: '/dashboard/history-orders',
        path: '/dashboard/history-orders',
        label: '历史账单',
        icon: <HistoryOutlined />,
        component: HistoryOrdersPage,
      },
    ],
  },
  {
    key: 'system',
    label: '设置',
    icon: <SettingOutlined />,
    children: [
      {
        key: '/system/app-settings',
        path: '/system/app-settings',
        label: '偏好设置',
        icon: <SlidersOutlined />,
        component: AppSettingsPage,
      },
      {
        key: '/system/changelog',
        path: '/system/changelog',
        label: '更新日志',
        icon: <NotificationOutlined />,
        component: ChangelogPage,
      },
    ],
  },
]

export function flattenRoutes(groups) {
  return groups.flatMap((group) =>
    group.children.map((route) => ({
      ...route,
      parentKey: group.key,
    })),
  )
}

export function filterRouteGroupsByPaths(groups, allowedPaths) {
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) {
    return groups
  }

  const allowedSet = new Set(allowedPaths)
  const filtered = groups
    .map((group) => ({
      ...group,
      children: group.children.filter((child) => allowedSet.has(child.path)),
    }))
    .filter((group) => group.children.length > 0)

  return filtered.length > 0 ? filtered : groups
}

export function getDefaultRoutePath(flatRoutes) {
  return flatRoutes[0]?.path || '/'
}

export const flatAppRoutes = flattenRoutes(menuRouteGroups)
