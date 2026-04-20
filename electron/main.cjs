const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
} = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_APP_NAME = 'OrderTick'
const LEGACY_DEFAULT_APP_NAME = '陪玩接单计时器'
const LEGACY_DEFAULT_APP_NAME_V2 = '接单计时器'
const APP_ID = 'com.ordertick.desktop'
const APP_DATA_DIR_NAME = 'ordertick'
const BRANDING_FILE_NAME = 'branding.runtime.json'
const APP_SETTINGS_FILE_NAME = 'app.settings.json'
const ORDERS_DATA_FILE_NAME = 'orders.json'
const DEFAULT_CLOSE_ACTION = 'tray'
const CLOSE_DECISION_REQUEST_CHANNEL = 'app:request-close-decision'
const CLOSE_DECISION_RESPONSE_CHANNEL = 'app:close-decision'
const DEFAULT_BILLING_RULE = 'tiered15'
const DEFAULT_COMMISSION_MODE = 'percentage'
const DEFAULT_COMMISSION_VALUE = 10

const stableUserDataPath = path.join(app.getPath('appData'), APP_DATA_DIR_NAME)

function migrateLegacyUserData() {
  const legacyPaths = [
    path.join(app.getPath('appData'), 'electron-test'),
    path.join(app.getPath('appData'), DEFAULT_APP_NAME),
    path.join(app.getPath('appData'), LEGACY_DEFAULT_APP_NAME_V2),
    path.join(app.getPath('appData'), LEGACY_DEFAULT_APP_NAME),
  ]

  if (!fs.existsSync(stableUserDataPath)) {
    fs.mkdirSync(stableUserDataPath, { recursive: true })
  }

  for (const legacyPath of legacyPaths) {
    if (!fs.existsSync(legacyPath)) {
      continue
    }

    for (const fileName of [APP_SETTINGS_FILE_NAME, BRANDING_FILE_NAME]) {
      const sourcePath = path.join(legacyPath, fileName)
      const targetPath = path.join(stableUserDataPath, fileName)

      if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
        fs.copyFileSync(sourcePath, targetPath)
      }
    }

    const legacyDataDir = path.join(legacyPath, 'data')
    const stableDataDir = path.join(stableUserDataPath, 'data')
    if (fs.existsSync(legacyDataDir) && !fs.existsSync(stableDataDir)) {
      fs.cpSync(legacyDataDir, stableDataDir, { recursive: true })
    }

    break
  }
}

migrateLegacyUserData()
app.setPath('userData', stableUserDataPath)

function normalizeWindowTheme(input = {}) {
  const mode =
    input.mode === 'dark' || input.mode === 'girl' ? input.mode : 'light'
  const primaryColor =
    typeof input.primaryColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(input.primaryColor)
      ? input.primaryColor
      : '#1677ff'

  return {
    mode,
    primaryColor,
  }
}

function getWindowOverlayConfig(themeInput = {}) {
  const theme = normalizeWindowTheme(themeInput)

  if (theme.mode === 'dark') {
    return {
      color: '#111b2e',
      symbolColor: '#e2e8f0',
      height: 40,
    }
  }

  if (theme.mode === 'girl') {
    return {
      color: '#fff3f9',
      symbolColor: '#8f4168',
      height: 40,
    }
  }

  return {
    color: '#f8fafc',
    symbolColor: '#0f172a',
    height: 40,
  }
}

function applyWindowTheme(themeInput = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const theme = normalizeWindowTheme(themeInput)
  const overlay = getWindowOverlayConfig(theme)

  if (typeof mainWindow.setTitleBarOverlay === 'function') {
    mainWindow.setTitleBarOverlay(overlay)
  }

  if (typeof mainWindow.setBackgroundColor === 'function') {
    const backgroundColor =
      theme.mode === 'dark'
        ? '#0b1220'
        : theme.mode === 'girl'
          ? '#fff6fb'
          : '#f8fafc'
    mainWindow.setBackgroundColor(backgroundColor)
  }
}

let mainWindow = null
let appTray = null
let isQuitting = false
let closePromptInFlight = false

function getBrandingFilePath() {
  return path.join(app.getPath('userData'), BRANDING_FILE_NAME)
}

function getAppSettingsFilePath() {
  return path.join(app.getPath('userData'), APP_SETTINGS_FILE_NAME)
}

function getInstalledSeedSettingsFilePath() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'build', 'app.settings.seed.json')
  }

  return path.join(process.resourcesPath, 'app.settings.seed.json')
}

function tryHydrateAppSettingsFromSeed() {
  try {
    const settingsPath = getAppSettingsFilePath()
    if (fs.existsSync(settingsPath)) {
      return
    }

    const seedPath = getInstalledSeedSettingsFilePath()
    if (!fs.existsSync(seedPath)) {
      return
    }

    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) || {}
    if (typeof seed.dataDir !== 'string' || !seed.dataDir.trim()) {
      return
    }

    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ dataDir: seed.dataDir.trim() }, null, 2),
      'utf-8',
    )
  } catch {
    // Ignore seed restore failures and keep default storage fallback.
  }
}

function readAppSettings() {
  try {
    const settingsPath = getAppSettingsFilePath()
    if (!fs.existsSync(settingsPath)) {
      return {}
    }

    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) || {}
  } catch {
    return {}
  }
}

function normalizeBillingRule(value, fallback = DEFAULT_BILLING_RULE) {
  return value === 'tiered15' || value === 'minute' ? value : fallback
}

function normalizeCommissionMode(value, fallback = DEFAULT_COMMISSION_MODE) {
  return value === 'fixed' || value === 'percentage' ? value : fallback
}

function normalizePricingConfig(input = {}, fallback = {}) {
  return {
    billingRule: normalizeBillingRule(
      input.billingRule,
      normalizeBillingRule(fallback.billingRule, DEFAULT_BILLING_RULE),
    ),
    commissionMode: normalizeCommissionMode(
      input.commissionMode,
      normalizeCommissionMode(fallback.commissionMode, DEFAULT_COMMISSION_MODE),
    ),
    commissionValue: Math.max(
      0,
      Number(
        input.commissionValue ??
          fallback.commissionValue ??
          DEFAULT_COMMISSION_VALUE,
      ) || 0,
    ),
  }
}

function getPricingConfig() {
  return normalizePricingConfig(readAppSettings())
}

function setPricingConfig(nextConfig = {}) {
  const settings = readAppSettings()
  const pricingConfig = normalizePricingConfig(nextConfig, settings)

  writeAppSettings({
    ...settings,
    ...pricingConfig,
  })

  return pricingConfig
}

function writeAppSettings(nextSettings = {}) {
  try {
    fs.writeFileSync(
      getAppSettingsFilePath(),
      JSON.stringify(nextSettings, null, 2),
      'utf-8',
    )
  } catch {
    // Ignore settings write failure and keep app usable.
  }
}

function getDefaultDataDir() {
  return path.join(app.getPath('userData'), 'data')
}

function getDataDir() {
  const settings = readAppSettings()
  if (typeof settings.dataDir === 'string' && settings.dataDir.trim()) {
    return settings.dataDir.trim()
  }
  return getDefaultDataDir()
}

function setDataDir(dirPath) {
  const settings = readAppSettings()
  settings.dataDir = dirPath
  writeAppSettings(settings)
}

function getOrdersDataFilePath() {
  return path.join(getDataDir(), ORDERS_DATA_FILE_NAME)
}

function readClosePreference() {
  const settings = readAppSettings()
  const closeAction =
    settings.closeAction === 'exit' || settings.closeAction === 'tray'
      ? settings.closeAction
      : DEFAULT_CLOSE_ACTION

  return {
    closeAction,
    promptOnClose: settings.promptOnClose !== false,
  }
}

function writeClosePreference(nextPreference = {}) {
  const settings = readAppSettings()
  const closeAction =
    nextPreference.closeAction === 'exit' ||
    nextPreference.closeAction === 'tray'
      ? nextPreference.closeAction
      : settings.closeAction || DEFAULT_CLOSE_ACTION

  const promptOnClose =
    typeof nextPreference.promptOnClose === 'boolean'
      ? nextPreference.promptOnClose
      : settings.promptOnClose !== false

  writeAppSettings({
    ...settings,
    closeAction,
    promptOnClose,
  })
}

function ensureDataDir() {
  tryHydrateAppSettingsFromSeed()
  const dirPath = getDataDir()
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}

function normalizeOrdersPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      orders: [],
      activeOrder: null,
    }
  }

  return {
    orders: Array.isArray(payload.orders) ? payload.orders : [],
    activeOrder:
      payload.activeOrder && typeof payload.activeOrder === 'object'
        ? payload.activeOrder
        : null,
  }
}

function readOrdersPayload() {
  try {
    ensureDataDir()
    const filePath = getOrdersDataFilePath()
    if (!fs.existsSync(filePath)) {
      return normalizeOrdersPayload()
    }

    const raw = fs.readFileSync(filePath, 'utf-8')
    return normalizeOrdersPayload(JSON.parse(raw))
  } catch {
    return normalizeOrdersPayload()
  }
}

function writeOrdersPayload(payload) {
  try {
    ensureDataDir()
    fs.writeFileSync(
      getOrdersDataFilePath(),
      JSON.stringify(normalizeOrdersPayload(payload), null, 2),
      'utf-8',
    )
  } catch {
    // Ignore data write failure and keep app usable.
  }
}

function normalizeBranding(input = {}) {
  const rawAppName =
    typeof input.appName === 'string' && input.appName.trim()
      ? input.appName.trim()
      : DEFAULT_APP_NAME

  const appName =
    rawAppName === LEGACY_DEFAULT_APP_NAME ||
    rawAppName === LEGACY_DEFAULT_APP_NAME_V2
      ? DEFAULT_APP_NAME
      : rawAppName

  const appLogo =
    typeof input.appLogo === 'string' && input.appLogo.trim()
      ? input.appLogo.trim()
      : ''

  return {
    appName,
    appLogo,
  }
}

function readRuntimeBranding() {
  try {
    const filePath = getBrandingFilePath()
    if (!fs.existsSync(filePath)) {
      return normalizeBranding()
    }

    const raw = fs.readFileSync(filePath, 'utf-8')
    return normalizeBranding(JSON.parse(raw))
  } catch {
    return normalizeBranding()
  }
}

function writeRuntimeBranding(branding) {
  try {
    fs.writeFileSync(
      getBrandingFilePath(),
      JSON.stringify(normalizeBranding(branding), null, 2),
      'utf-8',
    )
  } catch {
    // Ignore write failures and keep app usable.
  }
}

function registerDevtoolsShortcuts(win) {
  win.webContents.on('before-input-event', (event, input) => {
    const openByF12 = input.key === 'F12'
    const openByCtrlShiftI =
      (input.control || input.meta) &&
      input.shift &&
      input.key.toLowerCase() === 'i'

    if (openByF12 || openByCtrlShiftI) {
      win.webContents.toggleDevTools()
      event.preventDefault()
    }
  })
}

function createIconFromDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
    return null
  }

  try {
    const image = nativeImage.createFromDataURL(dataUrl)
    return image.isEmpty() ? null : image
  } catch {
    return null
  }
}

function resolveBundledIconPath() {
  const candidatePaths = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'danta.ico'),
        path.join(process.resourcesPath, 'danta.png'),
      ]
    : [
        path.join(__dirname, '..', 'build', 'danta.ico'),
        path.join(__dirname, '..', 'build', 'danta.png'),
        path.join(__dirname, '..', 'build', 'danta.jpg'),
      ]

  return (
    candidatePaths.find((candidatePath) => fs.existsSync(candidatePath)) || ''
  )
}

function getDefaultIconPath() {
  return resolveBundledIconPath()
}

function getRuntimeWindowIcon(runtimeBranding) {
  return createIconFromDataUrl(runtimeBranding.appLogo) || getDefaultIconPath()
}

function getRuntimeTrayIcon(runtimeBranding) {
  const runtimeIcon = createIconFromDataUrl(runtimeBranding.appLogo)
  if (runtimeIcon) {
    return runtimeIcon
  }

  const iconPath = getDefaultIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  return icon.isEmpty() ? nativeImage.createEmpty() : icon
}

function showMainWindow() {
  if (!mainWindow) {
    return
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.focus()
}

function ensureTray(runtimeBranding = readRuntimeBranding()) {
  if (appTray) {
    return appTray
  }

  appTray = new Tray(getRuntimeTrayIcon(runtimeBranding))
  appTray.setToolTip(runtimeBranding.appName || DEFAULT_APP_NAME)

  const trayMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showMainWindow(),
    },
    {
      type: 'separator',
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  appTray.setContextMenu(trayMenu)
  appTray.on('double-click', () => showMainWindow())

  return appTray
}

function handleMainWindowClose(event) {
  if (isQuitting) {
    return
  }

  const pref = readClosePreference()
  if (pref.promptOnClose) {
    event.preventDefault()

    if (closePromptInFlight) {
      return
    }

    closePromptInFlight = true

    requestCloseDecisionFromRenderer()
      .then((result) => {
        closePromptInFlight = false

        if (!mainWindow || mainWindow.isDestroyed()) {
          return
        }

        if (result.action === 'cancel') {
          return
        }

        const closeAction = result.action === 'exit' ? 'exit' : 'tray'

        if (result.remember) {
          writeClosePreference({
            closeAction,
            promptOnClose: false,
          })
        }

        if (closeAction === 'tray') {
          ensureTray(readRuntimeBranding())
          mainWindow.hide()
          return
        }

        isQuitting = true
        mainWindow.close()
      })
      .catch(() => {
        closePromptInFlight = false
      })

    return
  }

  const closeAction = pref.closeAction

  if (closeAction === 'tray') {
    event.preventDefault()
    ensureTray(readRuntimeBranding())
    mainWindow.hide()
    return
  }

  isQuitting = true
}

function requestCloseDecisionFromRenderer() {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve({ action: 'cancel', remember: false })
      return
    }

    const requestId = `close-${Date.now()}-${Math.random()}`
    const timeout = setTimeout(() => {
      cleanup()
      resolve({ action: 'cancel', remember: false })
    }, 120000)

    const listener = (_event, payload = {}) => {
      if (payload.requestId !== requestId) {
        return
      }

      cleanup()
      resolve({
        action:
          payload.action === 'tray' || payload.action === 'exit'
            ? payload.action
            : 'cancel',
        remember: Boolean(payload.remember),
      })
    }

    const cleanup = () => {
      clearTimeout(timeout)
      ipcMain.removeListener(CLOSE_DECISION_RESPONSE_CHANNEL, listener)
    }

    ipcMain.on(CLOSE_DECISION_RESPONSE_CHANNEL, listener)
    mainWindow.webContents.send(CLOSE_DECISION_REQUEST_CHANNEL, {
      requestId,
    })
    showMainWindow()
  })
}

function applyBrandingRuntime(branding = {}, options = {}) {
  const normalized = normalizeBranding(branding)
  const iconImage = createIconFromDataUrl(normalized.appLogo)

  if (options.persist) {
    writeRuntimeBranding(normalized)
  }

  BrowserWindow.getAllWindows().forEach((win) => {
    win.setTitle(normalized.appName)

    if (iconImage && typeof win.setIcon === 'function') {
      win.setIcon(iconImage)
    }
  })

  if (appTray) {
    appTray.setToolTip(normalized.appName)
    appTray.setImage(getRuntimeTrayIcon(normalized))
  }

  app.setName(normalized.appName)
}

function createMainWindow() {
  const runtimeBranding = readRuntimeBranding()
  const appIcon = getRuntimeWindowIcon(runtimeBranding)

  const win = new BrowserWindow({
    width: 1460,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: getWindowOverlayConfig(),
    backgroundColor: '#f8fafc',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const rendererHtml = path.join(
    __dirname,
    '..',
    'dist',
    'renderer',
    'index.html',
  )
  const devServerUrl = process.env.DEV_SERVER_URL
  const isDev = Boolean(devServerUrl)
  const forceOpenDevtools = process.env.OPEN_DEVTOOLS === '1'

  registerDevtoolsShortcuts(win)

  if (isDev) {
    win.loadURL(devServerUrl)
  } else if (fs.existsSync(rendererHtml)) {
    win.loadFile(rendererHtml)
  } else {
    win.loadURL('http://localhost:5274')
  }

  if (isDev || forceOpenDevtools) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  win.on('close', handleMainWindowClose)

  win.setTitle(runtimeBranding.appName)
  app.setName(runtimeBranding.appName)
  mainWindow = win

  ensureTray(runtimeBranding)
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID)
  createMainWindow()

  ipcMain.handle('app:apply-branding', async (_event, branding) => {
    applyBrandingRuntime(branding, { persist: true })
    return { ok: true }
  })

  ipcMain.handle('app:apply-window-theme', async (_event, theme) => {
    applyWindowTheme(theme)
    return { ok: true }
  })

  ipcMain.handle('app:data:get-config', async () => {
    return {
      dataDir: getDataDir(),
      ...getPricingConfig(),
    }
  })

  ipcMain.handle('app:data:set-pricing-config', async (_event, payload) => {
    return setPricingConfig(payload)
  })

  ipcMain.handle('app:data:choose-dir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择数据保存目录',
      defaultPath: getDataDir(),
    })

    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true, dataDir: getDataDir() }
    }

    const dirPath = result.filePaths[0]
    setDataDir(dirPath)
    ensureDataDir()
    return { canceled: false, dataDir: getDataDir() }
  })

  ipcMain.handle('app:data:get', async () => {
    return readOrdersPayload()
  })

  ipcMain.handle('app:data:set', async (_event, payload) => {
    writeOrdersPayload(payload)
    return { ok: true }
  })

  ipcMain.handle('app:save-file', async (_event, { defaultName, buffer }) => {
    const result = await dialog.showSaveDialog({
      title: '保存文件',
      defaultPath: defaultName,
      filters: [
        { name: 'Excel 文件', extensions: ['xlsx', 'xls'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }
    fs.writeFileSync(result.filePath, Buffer.from(buffer))
    return { canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('app:open-file', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Excel 文件',
      filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true }
    }
    const filePath = result.filePaths[0]
    const data = fs.readFileSync(filePath)
    return {
      canceled: false,
      filePath,
      fileName: path.basename(filePath),
      buffer: Array.from(new Uint8Array(data)),
    }
  })

  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow()
      return
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
