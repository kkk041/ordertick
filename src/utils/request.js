import server from '../config/server'

const DEFAULT_METHOD = 'POST'

function isFormData(value) {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

function resolveUrl(url) {
  if (/^https?:\/\//i.test(url)) {
    return url
  }

  if (import.meta.env.DEV) {
    return url
  }

  const localServer = localStorage.getItem('serverBaseUrl')
  const configuredServer =
    localServer && localServer.trim() ? localServer.trim() : server

  const base = configuredServer.endsWith('/')
    ? configuredServer.slice(0, -1)
    : configuredServer
  const path = url.startsWith('/') ? url : `/${url}`
  return `${base}${path}`
}

function getUserInfo() {
  try {
    const raw = localStorage.getItem('userInfo')
    if (!raw || raw === 'undefined') {
      return null
    }
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function readErrorMessage(response) {
  try {
    const data = await response.clone().json()
    return data?.message || data?.error || ''
  } catch {
    return ''
  }
}

function handleUnauthorized() {
  const loginPath = '/dashboard/overview'

  window.localStorage.removeItem('userInfo')
  window.localStorage.removeItem('userPermissionData')
  window.localStorage.removeItem('homePage')
  window.sessionStorage.removeItem('secretkey')

  if (window.location.pathname !== loginPath) {
    window.location.href = `${loginPath}?redirect=${encodeURIComponent(window.location.pathname)}`
  }
}

export default async function request(url, options = {}) {
  const method = (options.method || DEFAULT_METHOD).toUpperCase()
  const headers = { ...(options.headers || {}) }
  const userInfo = getUserInfo()
  const token = userInfo?.token ?? null
  const id = userInfo?.id ?? null
  const secretKey = sessionStorage.getItem('secretkey') || null
  const data = options.data

  headers['process-env'] = import.meta.env.MODE

  if (!isFormData(data) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (!headers.token && token) {
    headers.token = token
  }

  if (!headers.userid && id) {
    headers.userid = id
  }

  if (!headers.secretkey && secretKey) {
    headers.secretkey = secretKey
  }

  const fetchOptions = {
    method,
    headers,
    credentials: options.credentials || 'same-origin',
  }

  if (method !== 'GET' && method !== 'HEAD' && data !== undefined) {
    fetchOptions.body = isFormData(data) ? data : JSON.stringify(data)
  }

  const response = await fetch(resolveUrl(url), fetchOptions)

  if (response.status === 401) {
    handleUnauthorized()
    throw new Error('请先登陆')
  }

  if (!response.ok) {
    const errMsg = await readErrorMessage(response)
    throw new Error(
      `服务异常:${errMsg || `${response.status} ${response.statusText}`}`,
    )
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}
