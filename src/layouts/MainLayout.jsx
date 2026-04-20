/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Layout, Menu, Modal, Space, Typography } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BgColorsOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { loadBranding } from '../config/branding'
import { loadTheme, saveTheme } from '../config/theme'
import './MainLayout.css'

const { Sider, Content } = Layout

function MainLayout({ children, menuRouteGroups }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [openKeys, setOpenKeys] = useState([])
  const [branding, setBranding] = useState(() => loadBranding())
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeDialogRemember, setCloseDialogRemember] = useState(false)
  const [closeDialogRequestId, setCloseDialogRequestId] = useState('')
  const [appTheme, setAppTheme] = useState(() => loadTheme())
  const [menuRippleKey, setMenuRippleKey] = useState('')
  const [appSettingsDirty, setAppSettingsDirty] = useState(false)
  const menuRippleTimerRef = useRef(null)

  const menuItems = useMemo(() => {
    return menuRouteGroups.map((group) => ({
      key: group.key,
      icon: group.icon,
      label: group.label,
      children: group.children.map((child) => ({
        key: child.path,
        icon: child.icon,
        label: child.label,
        className: menuRippleKey === child.path ? 'menu-ripple' : '',
      })),
    }))
  }, [menuRouteGroups, menuRippleKey])

  const selectedKey = useMemo(() => {
    const exact = menuRouteGroups
      .flatMap((group) => group.children)
      .find((item) => item.path === location.pathname)

    if (exact) {
      return exact.path
    }

    const prefixMatch = menuRouteGroups
      .flatMap((group) => group.children)
      .find((item) => location.pathname.startsWith(item.path))

    return prefixMatch?.path || ''
  }, [location.pathname, menuRouteGroups])

  const routeStageClassName = useMemo(() => {
    return `route-switch-stage ${location.state?.slideFromRight ? 'route-switch-stage--from-right' : ''}`
  }, [location.state])

  const activeParentKey = useMemo(() => {
    const route = menuRouteGroups
      .flatMap((group) =>
        group.children.map((child) => ({ ...child, parent: group.key })),
      )
      .find((item) => item.path === selectedKey)

    return route?.parent || menuRouteGroups[0]?.key
  }, [selectedKey, menuRouteGroups])

  useEffect(() => {
    if (collapsed || !activeParentKey) {
      return
    }

    setOpenKeys((prev) => {
      if (prev.includes(activeParentKey)) {
        return prev
      }

      return [...prev, activeParentKey]
    })
  }, [activeParentKey, collapsed])

  useEffect(() => {
    document.title = branding.appName
  }, [branding.appName])

  useEffect(() => {
    const favicon = document.querySelector('link[rel="icon"]')
    if (favicon && branding.appLogo) {
      favicon.setAttribute('href', branding.appLogo)
    }
  }, [branding.appLogo])

  useEffect(() => {
    const syncBranding = (event) => {
      if (event?.detail) {
        setBranding(event.detail)
        return
      }

      setBranding(loadBranding())
    }

    window.addEventListener('app-branding-updated', syncBranding)
    window.addEventListener('storage', syncBranding)

    return () => {
      window.removeEventListener('app-branding-updated', syncBranding)
      window.removeEventListener('storage', syncBranding)
    }
  }, [])

  useEffect(() => {
    if (!window.appControl?.onCloseDecisionRequest) {
      return
    }

    const unsubscribe = window.appControl.onCloseDecisionRequest((payload) => {
      if (!payload?.requestId) {
        return
      }

      setCloseDialogRequestId(payload.requestId)
      setCloseDialogRemember(false)
      setCloseDialogOpen(true)
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  useEffect(() => {
    const syncTheme = (event) => {
      if (event?.detail) {
        setAppTheme(event.detail)
        return
      }

      setAppTheme(loadTheme())
    }

    window.addEventListener('app-theme-updated', syncTheme)
    window.addEventListener('storage', syncTheme)

    return () => {
      window.removeEventListener('app-theme-updated', syncTheme)
      window.removeEventListener('storage', syncTheme)
    }
  }, [])

  const themeModeMeta = {
    light: {
      label: '亮色模式',
      icon: <SunOutlined />,
    },
    dark: {
      label: '暗色模式',
      icon: <MoonOutlined />,
    },
    girl: {
      label: '少女模式',
      icon: <BgColorsOutlined />,
    },
  }

  const modeSequence = ['light', 'dark', 'girl']

  const getNextThemeMode = (mode) => {
    const currentIndex = modeSequence.indexOf(mode)
    return modeSequence[(currentIndex + 1) % modeSequence.length]
  }

  const toggleThemeMode = () => {
    const nextMode = getNextThemeMode(appTheme.mode)
    const next = saveTheme({
      ...appTheme,
      mode: nextMode,
      primaryColor: appTheme.colors?.[nextMode] || appTheme.primaryColor,
    })
    setAppTheme(next)
  }

  const nextThemeMode = getNextThemeMode(appTheme.mode)
  const nextThemeMeta = themeModeMeta[nextThemeMode] || themeModeMeta.light

  const submitCloseDecision = (action) => {
    if (!closeDialogRequestId || !window.appControl?.submitCloseDecision) {
      setCloseDialogOpen(false)
      return
    }

    window.appControl.submitCloseDecision({
      requestId: closeDialogRequestId,
      action,
      remember: closeDialogRemember,
    })

    setCloseDialogOpen(false)
    setCloseDialogRequestId('')
  }

  useEffect(() => {
    const syncSettingsDirty = (event) => {
      if (typeof event?.detail?.dirty === 'boolean') {
        setAppSettingsDirty(event.detail.dirty)
        return
      }
      setAppSettingsDirty(Boolean(window.__appSettingsDirty))
    }

    syncSettingsDirty()
    window.addEventListener('app-settings-dirty-changed', syncSettingsDirty)

    return () => {
      window.removeEventListener(
        'app-settings-dirty-changed',
        syncSettingsDirty,
      )
    }
  }, [])

  useEffect(() => {
    return () => {
      if (menuRippleTimerRef.current) {
        window.clearTimeout(menuRippleTimerRef.current)
      }
    }
  }, [])

  const handleMenuClick = ({ key }) => {
    const jump = () => {
      navigate(key)
      setMenuRippleKey(key)

      if (menuRippleTimerRef.current) {
        window.clearTimeout(menuRippleTimerRef.current)
      }

      menuRippleTimerRef.current = window.setTimeout(() => {
        setMenuRippleKey('')
      }, 520)
    }

    const isLeavingDirtySettings =
      location.pathname === '/system/app-settings' &&
      key !== '/system/app-settings' &&
      appSettingsDirty

    if (isLeavingDirtySettings) {
      Modal.confirm({
        title: '偏好设置有未保存改动',
        content: '你有改动尚未保存，继续跳转会丢失本次修改。是否继续？',
        okText: '继续跳转',
        cancelText: '留在当前页',
        onOk: jump,
      })
      return
    }

    jump()
  }

  return (
    <Layout
      className={`app-layout ${collapsed ? 'is-sider-collapsed' : 'is-sider-expanded'}`}
    >
      <div className="window-drag-region" aria-hidden="true" />
      <Sider
        width={232}
        className="app-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={(next) => {
          setCollapsed(next)
          if (next) {
            setOpenKeys([])
          }
        }}
      >
        <div className="logo">
          <img
            src={branding.appLogo}
            alt={branding.appName}
            className="logo-image"
          />
          {!collapsed && <span className="logo-text">{branding.appName}</span>}
        </div>
        <div className="sider-toggle-wrap">
          <Button
            className="sider-toggle-btn"
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => {
              const next = !collapsed
              setCollapsed(next)
              if (next) {
                setOpenKeys([])
              }
            }}
          >
            {!collapsed ? '收起菜单' : null}
          </Button>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          items={menuItems}
          inlineCollapsed={collapsed}
          selectedKeys={selectedKey ? [selectedKey] : []}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys)}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <div className="theme-toggle-wrap">
          <Button
            className="theme-toggle-btn"
            icon={nextThemeMeta.icon}
            onClick={toggleThemeMode}
          >
            {`切换到${nextThemeMeta.label}`}
          </Button>
        </div>
        <Content className="app-content">
          <div key={location.pathname} className={routeStageClassName}>
            {children}
          </div>
        </Content>
      </Layout>

      <Modal
        title="关闭应用"
        open={closeDialogOpen}
        onCancel={() => submitCloseDecision('cancel')}
        footer={null}
        centered
        width={420}
        className="close-app-modal"
      >
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            你可以选择最小化到托盘，或直接退出应用。
          </Typography.Text>

          <div className="close-app-actions">
            <Button
              className="close-app-btn close-app-btn-tray"
              type="primary"
              onClick={() => submitCloseDecision('tray')}
            >
              保存到托盘
            </Button>
            <Button
              className="close-app-btn close-app-btn-exit"
              onClick={() => submitCloseDecision('exit')}
            >
              直接关闭
            </Button>
          </div>

          <Checkbox
            checked={closeDialogRemember}
            onChange={(e) => setCloseDialogRemember(e.target.checked)}
          >
            以后不再提示
          </Checkbox>
        </Space>
      </Modal>
    </Layout>
  )
}

export default MainLayout
