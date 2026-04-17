import { Suspense, useEffect, useMemo, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigProvider, Spin, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import './App.css'
import MainLayout from './layouts/MainLayout'
import {
  flattenRoutes,
  getDefaultRoutePath,
  menuRouteGroups,
} from './config/appRoutes'
import { applyThemeToDocument, loadTheme } from './config/theme'

function App() {
  const [appTheme, setAppTheme] = useState(() => loadTheme())
  const activeRouteGroups = menuRouteGroups

  const activeFlatRoutes = useMemo(() => {
    return flattenRoutes(activeRouteGroups)
  }, [activeRouteGroups])

  const defaultRoutePath = useMemo(() => {
    return getDefaultRoutePath(activeFlatRoutes)
  }, [activeFlatRoutes])

  useEffect(() => {
    applyThemeToDocument(appTheme)

    if (window.appControl?.applyWindowTheme) {
      window.appControl.applyWindowTheme(appTheme).catch(() => {
        // Ignore shell chrome sync failures; renderer theme is already applied.
      })
    }
  }, [appTheme])

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

  const providerTheme = useMemo(() => {
    const algorithm =
      appTheme.mode === 'dark'
        ? antdTheme.darkAlgorithm
        : antdTheme.defaultAlgorithm

    const borderRadius = appTheme.mode === 'girl' ? 18 : 12

    return {
      algorithm,
      token: {
        colorPrimary: appTheme.primaryColor,
        borderRadius,
      },
    }
  }, [appTheme])

  return (
    <ConfigProvider locale={zhCN} theme={providerTheme}>
      <HashRouter>
        <MainLayout menuRouteGroups={activeRouteGroups}>
          <Routes>
            <Route
              path="/"
              element={<Navigate to={defaultRoutePath} replace />}
            />
            {activeFlatRoutes.map((route) => {
              const LazyComponent = route.component
              return (
                <Route
                  key={route.path}
                  path={route.path}
                  element={
                    <Suspense
                      fallback={
                        <div className="page-loading">
                          <Spin />
                        </div>
                      }
                    >
                      <LazyComponent />
                    </Suspense>
                  }
                />
              )
            })}
            <Route
              path="*"
              element={<Navigate to={defaultRoutePath} replace />}
            />
          </Routes>
        </MainLayout>
      </HashRouter>
    </ConfigProvider>
  )
}

export default App
