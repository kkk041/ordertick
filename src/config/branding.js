import defaultLogo from '../../build/danta.jpg'

const STORAGE_KEY = 'appBranding'
const LEGACY_DEFAULT_APP_NAME = '陪玩接单计时器'
const LEGACY_DEFAULT_APP_NAME_V2 = '接单计时器'

export const defaultBranding = {
  appName: 'OrderTick',
  appLogo: defaultLogo,
  feedbackQr: '',
}

function normalizeBranding(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...defaultBranding }
  }

  const rawAppName =
    typeof raw.appName === 'string' && raw.appName.trim()
      ? raw.appName.trim()
      : defaultBranding.appName

  const appName =
    rawAppName === LEGACY_DEFAULT_APP_NAME ||
    rawAppName === LEGACY_DEFAULT_APP_NAME_V2
      ? defaultBranding.appName
      : rawAppName

  const appLogo =
    typeof raw.appLogo === 'string' && raw.appLogo.trim()
      ? raw.appLogo.trim()
      : defaultBranding.appLogo

  const feedbackQr =
    typeof raw.feedbackQr === 'string' && raw.feedbackQr.trim()
      ? raw.feedbackQr.trim()
      : defaultBranding.feedbackQr

  return {
    appName,
    appLogo,
    feedbackQr,
  }
}

export function loadBranding() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (!cached) {
      return { ...defaultBranding }
    }

    return normalizeBranding(JSON.parse(cached))
  } catch {
    return { ...defaultBranding }
  }
}

export function saveBranding(nextBranding) {
  const normalized = normalizeBranding(nextBranding)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(
    new CustomEvent('app-branding-updated', {
      detail: normalized,
    }),
  )
  return normalized
}
