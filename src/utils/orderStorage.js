import { DEFAULT_PRICING_CONFIG, normalizePricingConfig } from './pricing'

const ORDERS_KEY = 'playmate.orders'
const ACTIVE_ORDER_KEY = 'playmate.activeOrder'
const REPORT_TEMPLATE_KEY = 'playmate.reportTemplate'
const REPORT_FIELDS_KEY = 'playmate.reportFields'

/**
 * 自动变量映射表 — 这些变量会从订单数据中自动填充
 */
export const AUTO_VARIABLES = {
  日期: '订单日期',
  老板: '老板名称',
  类型: '备注/游戏类型',
  起止时间: '开始-结束时间',
  时长: '订单时长',
  单价: '单价/把价',
  总计: '结算金额',
  抽成: '抽成金额',
  到手: '到手金额',
  把数: '游戏把数(按把计费)',
  把价: '每把价格(按把计费)',
}

/**
 * 每个模板行：{ label: string, source: 'auto'|'custom', defaultValue: string, required: boolean }
 * - source='auto': label 是自动变量名，值从订单自动填充；defaultValue 仅当自动值为空时使用
 * - source='custom': label 是用户自定义标签，defaultValue 是固定填充内容
 */
export const DEFAULT_TEMPLATE_ROWS = [
  { label: '日期', source: 'auto', defaultValue: '', required: true },
  { label: '管理', source: 'auto', defaultValue: '', required: false },
  { label: '老板', source: 'auto', defaultValue: '', required: true },
  { label: '陪玩', source: 'auto', defaultValue: '', required: false },
  { label: '类型', source: 'auto', defaultValue: '', required: false },
  { label: '起止时间', source: 'auto', defaultValue: '', required: true },
  { label: '时长', source: 'auto', defaultValue: '', required: true },
  { label: '单价', source: 'auto', defaultValue: '', required: true },
  { label: '总计', source: 'auto', defaultValue: '', required: true },
  { label: '抽成', source: 'auto', defaultValue: '', required: true },
  { label: '到手', source: 'auto', defaultValue: '', required: true },
  { label: '直属', source: 'auto', defaultValue: '', required: false },
]

export function loadTemplateRows() {
  try {
    const raw = localStorage.getItem(REPORT_TEMPLATE_KEY)
    if (!raw) return DEFAULT_TEMPLATE_ROWS.map((r) => ({ ...r }))
    const parsed = JSON.parse(raw)
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed[0].label !== undefined
    ) {
      return parsed
    }
    // Old string format — return default
    return DEFAULT_TEMPLATE_ROWS.map((r) => ({ ...r }))
  } catch {
    return DEFAULT_TEMPLATE_ROWS.map((r) => ({ ...r }))
  }
}

export function saveTemplateRows(rows) {
  try {
    localStorage.setItem(REPORT_TEMPLATE_KEY, JSON.stringify(rows))
  } catch {
    // Ignore
  }
}

// Keep old name exports for backward compat but delegate
export function loadReportTemplate() {
  return buildTemplateString(loadTemplateRows())
}

export function saveReportTemplate(template) {
  // no-op, use saveTemplateRows instead
}

export function loadReportFields() {
  const rows = loadTemplateRows()
  const fields = {}
  for (const row of rows) {
    if (row.source === 'custom') {
      fields[row.label] = row.defaultValue || ''
    }
  }
  return fields
}

export function saveReportFields(fields) {
  // no-op, use saveTemplateRows instead
}

function buildTemplateString(rows) {
  return rows.map((r) => `${r.label}：{{${r.label}}}`).join('\n')
}

export function generateReportText(template, order, fields, pricingHelpers) {
  const {
    getOrderDurationSeconds,
    getSettlementAmount,
    getCommissionAmount,
    getNetAmount,
    formatDuration,
  } = pricingHelpers

  const totalSeconds = getOrderDurationSeconds(order)
  const settlement = getSettlementAmount(order, totalSeconds)
  const commission = getCommissionAmount(order, totalSeconds)
  const net = getNetAmount(order, totalSeconds)

  const startDate = order.startAt ? new Date(order.startAt) : null
  const endDate = order.endAt ? new Date(order.endAt) : null

  const fmtDate = (d) => (d ? `${d.getMonth() + 1}.${d.getDate()}` : '')
  const fmtTime = (d) =>
    d
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : ''

  const dateStr = startDate ? fmtDate(startDate) : ''
  const timeRange =
    startDate && endDate ? `${fmtTime(startDate)}-${fmtTime(endDate)}` : ''

  const durationStr = totalSeconds > 0 ? formatDuration(totalSeconds) : ''

  let priceStr = ''
  if (order.billingRule === 'perGame') {
    priceStr = `${order.gamePrice || 0}/把`
  } else {
    priceStr = `${order.hourRate || 0}`
  }

  const commissionDesc =
    order.commissionMode === 'percentage'
      ? `${commission}（${order.commissionValue / 100}）`
      : `${commission}`

  // 自动变量值映射
  const autoVars = {
    日期: dateStr,
    老板: order.boss || '',
    类型: order.note || '',
    起止时间: timeRange,
    时长: durationStr,
    单价: priceStr,
    总计: String(settlement),
    抽成: commissionDesc,
    到手: String(net),
    把数: order.billingRule === 'perGame' ? String(order.gameCount || 0) : '',
    把价: order.billingRule === 'perGame' ? String(order.gamePrice || 0) : '',
  }

  // 基于结构化模板行生成报单
  const rows = loadTemplateRows()
  const lines = rows.map((row) => {
    // 优先使用自动变量值，其次 fields 传入值，最后 defaultValue
    const value =
      autoVars[row.label] || fields[row.label] || row.defaultValue || ''
    return `${row.label}：${value}`
  })

  return lines.join('\n')
}

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
