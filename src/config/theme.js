const STORAGE_KEY = 'appTheme'

const DEFAULT_MODE_COLORS = {
  light: '#1677ff',
  dark: '#1677ff',
  girl: '#ff4fa3',
}

export const defaultTheme = {
  mode: 'light',
  primaryColor: DEFAULT_MODE_COLORS.light,
  colors: { ...DEFAULT_MODE_COLORS },
}

export function getDefaultPrimaryByMode(mode) {
  return DEFAULT_MODE_COLORS[mode] || DEFAULT_MODE_COLORS.light
}

function normalizeHexColor(input) {
  if (typeof input !== 'string') {
    return defaultTheme.primaryColor
  }

  const value = input.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase()
  }

  return defaultTheme.primaryColor
}

function normalizeTheme(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...defaultTheme }
  }

  const mode = raw.mode === 'dark' || raw.mode === 'girl' ? raw.mode : 'light'

  const hasLegacyPrimaryColor =
    typeof raw.primaryColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.primaryColor.trim())
  const legacyPrimaryColor = hasLegacyPrimaryColor
    ? normalizeHexColor(raw.primaryColor)
    : null

  const colors = {
    light: getDefaultPrimaryByMode('light'),
    dark: getDefaultPrimaryByMode('dark'),
    girl: getDefaultPrimaryByMode('girl'),
  }

  if (raw.colors && typeof raw.colors === 'object') {
    colors.light = normalizeHexColor(raw.colors.light)
    colors.dark = normalizeHexColor(raw.colors.dark)
    colors.girl = normalizeHexColor(raw.colors.girl)
  } else if (legacyPrimaryColor) {
    if (mode === 'girl') {
      colors.girl = legacyPrimaryColor
    } else if (legacyPrimaryColor !== getDefaultPrimaryByMode('girl')) {
      colors[mode] = legacyPrimaryColor
    }
  }

  return {
    mode,
    primaryColor: colors[mode],
    colors,
  }
}

function hexToRgb(hex) {
  const safe = normalizeHexColor(hex).replace('#', '')
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function tintColor(hex, mix = 0.2) {
  const rgb = hexToRgb(hex)
  return rgbToHex({
    r: Math.round(rgb.r + (255 - rgb.r) * mix),
    g: Math.round(rgb.g + (255 - rgb.g) * mix),
    b: Math.round(rgb.b + (255 - rgb.b) * mix),
  })
}

export function loadTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...defaultTheme }
    }
    return normalizeTheme(JSON.parse(raw))
  } catch {
    return { ...defaultTheme }
  }
}

export function saveTheme(nextTheme) {
  const normalized = normalizeTheme(nextTheme)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(
    new CustomEvent('app-theme-updated', {
      detail: normalized,
    }),
  )
  return normalized
}

export function applyThemeToDocument(theme) {
  const normalized = normalizeTheme(theme)
  const root = document.documentElement
  root.setAttribute('data-theme', normalized.mode)
  root.style.setProperty('--theme-primary', normalized.primaryColor)
  root.style.setProperty(
    '--theme-primary-soft',
    tintColor(normalized.primaryColor, 0.28),
  )
}
