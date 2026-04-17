import { DEFAULT_PRICING_CONFIG, normalizePricingConfig } from './pricing'

const ORDERS_KEY = 'playmate.orders'
const ACTIVE_ORDER_KEY = 'playmate.activeOrder'

function normalizePayload(payload) {
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

function readLocalPayload() {
  try {
    const rawOrders = localStorage.getItem(ORDERS_KEY)
    const rawActive = localStorage.getItem(ACTIVE_ORDER_KEY)

    return normalizePayload({
      orders: rawOrders ? JSON.parse(rawOrders) : [],
      activeOrder: rawActive ? JSON.parse(rawActive) : null,
    })
  } catch {
    return normalizePayload()
  }
}

function writeLocalPayload(payload) {
  const normalized = normalizePayload(payload)
  localStorage.setItem(ORDERS_KEY, JSON.stringify(normalized.orders))
  if (normalized.activeOrder) {
    localStorage.setItem(
      ACTIVE_ORDER_KEY,
      JSON.stringify(normalized.activeOrder),
    )
  } else {
    localStorage.removeItem(ACTIVE_ORDER_KEY)
  }
}

export async function loadOrdersData() {
  const localPayload = readLocalPayload()

  if (!window.appData?.getOrdersData) {
    return localPayload
  }

  try {
    const remotePayload = normalizePayload(await window.appData.getOrdersData())

    // Migrate local data to file storage on first run if file is empty.
    if (
      remotePayload.orders.length === 0 &&
      !remotePayload.activeOrder &&
      (localPayload.orders.length > 0 || localPayload.activeOrder)
    ) {
      await window.appData.setOrdersData(localPayload)
      return localPayload
    }

    return remotePayload
  } catch {
    return localPayload
  }
}

export async function saveOrdersData(payload) {
  const normalized = normalizePayload(payload)
  writeLocalPayload(normalized)

  if (window.appData?.setOrdersData) {
    try {
      await window.appData.setOrdersData(normalized)
    } catch {
      // Ignore file-write errors; local fallback still persists data.
    }
  }
}

export async function getDataStorageConfig() {
  if (!window.appData?.getConfig) {
    return {
      dataDir: '浏览器本地存储',
      supported: false,
      ...DEFAULT_PRICING_CONFIG,
    }
  }

  try {
    const result = await window.appData.getConfig()
    return {
      dataDir: result?.dataDir || '',
      supported: true,
      ...normalizePricingConfig(result),
    }
  } catch {
    return {
      dataDir: '',
      supported: true,
      ...DEFAULT_PRICING_CONFIG,
    }
  }
}

export async function getPricingConfig() {
  const config = await getDataStorageConfig()
  return normalizePricingConfig(config)
}

export async function savePricingConfig(config) {
  const normalized = normalizePricingConfig(config)

  if (!window.appData?.setPricingConfig) {
    return {
      ok: false,
      supported: false,
      ...normalized,
    }
  }

  try {
    const result = await window.appData.setPricingConfig(normalized)
    return {
      ok: true,
      supported: true,
      ...normalizePricingConfig(result, normalized),
    }
  } catch {
    return {
      ok: false,
      supported: true,
      ...normalized,
    }
  }
}

export async function chooseDataStorageDirectory() {
  if (!window.appData?.chooseDirectory) {
    return {
      canceled: true,
      dataDir: '浏览器本地存储',
      supported: false,
    }
  }

  try {
    const result = await window.appData.chooseDirectory()
    return {
      canceled: Boolean(result?.canceled),
      dataDir: result?.dataDir || '',
      supported: true,
    }
  } catch {
    return {
      canceled: true,
      dataDir: '',
      supported: true,
    }
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function buildMockOrdersPayload(days = 14) {
  const now = new Date()
  const bosses = ['老王', '小李', '阿泽', '娜娜', 'Miko']
  const notes = ['王者双排', '金铲铲上分', '吃鸡陪练', '聊天陪玩', 'LOL排位']
  const rates = [32, 36, 40, 45, 50, 55, 60]
  const orders = []

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const dayBase = new Date(now)
    dayBase.setHours(0, 0, 0, 0)
    dayBase.setDate(dayBase.getDate() - dayOffset)

    const count = randomInt(2, 6)
    for (let i = 0; i < count; i += 1) {
      const start = new Date(dayBase)
      start.setHours(randomInt(10, 22), randomInt(0, 11) * 5, 0, 0)

      const durationMinutes = randomInt(40, 220)
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

      if (end > now) {
        end.setTime(now.getTime() - randomInt(3, 30) * 60 * 1000)
      }

      if (end <= start) {
        end.setTime(start.getTime() + 10 * 60 * 1000)
      }

      const hourRate = rates[randomInt(0, rates.length - 1)]
      const seconds = Math.max(0, Math.floor((end - start) / 1000))
      const expectedSettlementAmount = Number(
        ((hourRate * seconds) / 3600).toFixed(2),
      )

      let actualNetAmount = null
      const mode = randomInt(0, 9)
      if (mode >= 2) {
        const delta = randomInt(-8, 12)
        actualNetAmount = Number(
          Math.max(0, expectedSettlementAmount + delta).toFixed(2),
        )
      }

      orders.push({
        id: `mock-${dayOffset}-${i}-${Date.now()}-${randomInt(100, 999)}`,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        boss: bosses[randomInt(0, bosses.length - 1)],
        note: notes[randomInt(0, notes.length - 1)],
        hourRate,
        actualAmount: actualNetAmount,
        status: 'done',
      })
    }
  }

  orders.sort(
    (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
  )

  return {
    orders,
    activeOrder: null,
  }
}

export async function seedMockOrdersData(days = 14) {
  const payload = buildMockOrdersPayload(days)
  await saveOrdersData(payload)
  return payload
}
