export const DEFAULT_PRICING_CONFIG = {
  billingRule: 'tiered15',
  commissionMode: 'percentage',
  commissionValue: 10,
  pricingTemplateId: 'tpl-tiered15-10p',
  pricingTemplates: [
    {
      id: 'tpl-tiered15-10p',
      name: '15分钟制 - 抽成10%',
      billingRule: 'tiered15',
      commissionMode: 'percentage',
      commissionValue: 10,
      builtIn: true,
    },
    {
      id: 'tpl-minute-10p',
      name: '分钟制 - 抽成10%',
      billingRule: 'minute',
      commissionMode: 'percentage',
      commissionValue: 10,
      builtIn: true,
    },
    {
      id: 'tpl-pergame-15p',
      name: '按把计费 - 抽成15%',
      billingRule: 'perGame',
      commissionMode: 'percentage',
      commissionValue: 15,
      builtIn: true,
    },
  ],
  showDailyEncouragement: true,
  unsettledReminderEnabled: true,
  unsettledReminderDays: 1,
  unsettledReminderMode: 'naturalDay',
  unsettledReminderMinOrders: 1,
}

export const TIERED15_MINIMUM_MINUTES = 15
export const DEFAULT_CUSTOM_BILLING_SEGMENTS = [
  {
    id: 'seg-1',
    minMinutes: 10,
    maxMinutes: 15,
    billableHours: 0.25,
  },
  {
    id: 'seg-2',
    minMinutes: 16,
    maxMinutes: 30,
    billableHours: 0.5,
  },
]

export const BILLING_RULE_OPTIONS = [
  { value: 'minute', label: '分钟制' },
  { value: 'tiered15', label: '15分钟制' },
  { value: 'perGame', label: '按把计费' },
]

export const COMMISSION_MODE_OPTIONS = [
  { value: 'percentage', label: '按比例抽成' },
  { value: 'fixed', label: '按小时固定抽成' },
]

export function normalizeBillingRule(value, fallback = 'minute') {
  return value === 'tiered15' ||
    value === 'minute' ||
    value === 'perGame' ||
    value === 'customSegment'
    ? value
    : fallback
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

function normalizeBillingSegment(segment = {}, fallback = {}, index = 0) {
  const minMinutes = Math.max(
    0,
    Math.floor(toNumber(segment.minMinutes, fallback.minMinutes || 0)),
  )

  const hasMax =
    segment.maxMinutes !== null &&
    segment.maxMinutes !== undefined &&
    segment.maxMinutes !== ''
  const fallbackHasMax =
    fallback.maxMinutes !== null &&
    fallback.maxMinutes !== undefined &&
    fallback.maxMinutes !== ''
  const rawMax = hasMax
    ? segment.maxMinutes
    : fallbackHasMax
      ? fallback.maxMinutes
      : null
  const maxMinutes =
    rawMax === null
      ? null
      : Math.max(minMinutes, Math.floor(toNumber(rawMax, minMinutes)))

  const billableHours = Math.max(
    0,
    Math.round(
      toNumber(segment.billableHours, fallback.billableHours || 0) * 1000,
    ) / 1000,
  )

  const id =
    typeof segment.id === 'string' && segment.id.trim()
      ? segment.id.trim()
      : typeof fallback.id === 'string' && fallback.id.trim()
        ? fallback.id.trim()
        : `seg-${index + 1}`

  return {
    id,
    minMinutes,
    maxMinutes,
    billableHours,
  }
}

export function normalizeBillingSegments(
  segments,
  fallbackSegments = DEFAULT_CUSTOM_BILLING_SEGMENTS,
) {
  const source =
    Array.isArray(segments) && segments.length > 0 ? segments : fallbackSegments

  const normalized = source
    .map((item, index) =>
      normalizeBillingSegment(item, fallbackSegments[index] || {}, index),
    )
    .sort((a, b) => a.minMinutes - b.minMinutes)

  if (normalized.length === 0) {
    return DEFAULT_CUSTOM_BILLING_SEGMENTS.map((item) => ({ ...item }))
  }

  return normalized.map((item, index) => ({
    ...item,
    id: item.id || `seg-${index + 1}`,
  }))
}

export function normalizeUnsettledReminderMode(value, fallback = 'naturalDay') {
  return value === 'naturalDay' || value === 'elapsed24h' ? value : fallback
}

export function normalizeCommissionMode(value, fallback = 'percentage') {
  return value === 'fixed' || value === 'percentage' ? value : fallback
}

export function normalizePricingConfig(
  config = {},
  fallback = DEFAULT_PRICING_CONFIG,
) {
  const fallbackTemplates = Array.isArray(fallback.pricingTemplates)
    ? fallback.pricingTemplates
    : DEFAULT_PRICING_CONFIG.pricingTemplates

  const normalizedTemplates = normalizePricingTemplates(
    config.pricingTemplates,
    fallbackTemplates,
  )
  const fallbackTemplateId =
    fallback.pricingTemplateId || normalizedTemplates[0]?.id || ''
  const pricingTemplateId = normalizePricingTemplateId(
    config.pricingTemplateId,
    normalizedTemplates,
    fallbackTemplateId,
  )
  const selectedTemplate =
    normalizedTemplates.find((item) => item.id === pricingTemplateId) ||
    normalizedTemplates[0] ||
    null

  const normalizedBillingRule = normalizeBillingRule(
    config.billingRule,
    selectedTemplate?.billingRule || fallback.billingRule,
  )
  const normalizedCommissionMode = normalizeCommissionMode(
    config.commissionMode,
    selectedTemplate?.commissionMode || fallback.commissionMode,
  )
  const normalizedBillingSegments = normalizeBillingSegments(
    config.billingSegments,
    selectedTemplate?.billingSegments || DEFAULT_CUSTOM_BILLING_SEGMENTS,
  )

  return {
    billingRule: normalizedBillingRule,
    billingSegments: normalizedBillingSegments,
    commissionMode: normalizedCommissionMode,
    commissionValue: Math.max(
      0,
      Number(
        config.commissionValue ?? selectedTemplate?.commissionValue ?? 0,
      ) || 0,
    ),
    pricingTemplateId,
    pricingTemplates: normalizedTemplates,
    showDailyEncouragement:
      typeof config.showDailyEncouragement === 'boolean'
        ? config.showDailyEncouragement
        : fallback.showDailyEncouragement !== false,
    unsettledReminderEnabled:
      typeof config.unsettledReminderEnabled === 'boolean'
        ? config.unsettledReminderEnabled
        : fallback.unsettledReminderEnabled !== false,
    unsettledReminderDays: normalizeUnsettledReminderDays(
      config.unsettledReminderDays,
      fallback.unsettledReminderDays,
    ),
    unsettledReminderMode: normalizeUnsettledReminderMode(
      config.unsettledReminderMode,
      fallback.unsettledReminderMode,
    ),
    unsettledReminderMinOrders: normalizeUnsettledReminderMinOrders(
      config.unsettledReminderMinOrders,
      fallback.unsettledReminderMinOrders,
    ),
  }
}

function normalizePricingTemplate(template = {}, fallbackTemplate = {}) {
  const fallbackId =
    typeof fallbackTemplate.id === 'string' ? fallbackTemplate.id : ''
  const id =
    typeof template.id === 'string' && template.id.trim()
      ? template.id.trim()
      : fallbackId || `tpl-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  const fallbackName =
    typeof fallbackTemplate.name === 'string' && fallbackTemplate.name.trim()
      ? fallbackTemplate.name.trim()
      : '自定义模板'
  const name =
    typeof template.name === 'string' && template.name.trim()
      ? template.name.trim()
      : fallbackName

  return {
    id,
    name,
    billingRule: normalizeBillingRule(
      template.billingRule,
      normalizeBillingRule(
        fallbackTemplate.billingRule,
        DEFAULT_PRICING_CONFIG.billingRule,
      ),
    ),
    commissionMode: normalizeCommissionMode(
      template.commissionMode,
      normalizeCommissionMode(
        fallbackTemplate.commissionMode,
        DEFAULT_PRICING_CONFIG.commissionMode,
      ),
    ),
    commissionValue: Math.max(
      0,
      Number(
        template.commissionValue ??
          fallbackTemplate.commissionValue ??
          DEFAULT_PRICING_CONFIG.commissionValue,
      ) || 0,
    ),
    billingSegments: normalizeBillingSegments(
      template.billingSegments,
      fallbackTemplate.billingSegments || DEFAULT_CUSTOM_BILLING_SEGMENTS,
    ),
    builtIn: Boolean(template.builtIn || fallbackTemplate.builtIn),
  }
}

export function normalizePricingTemplates(
  templates,
  fallbackTemplates = DEFAULT_PRICING_CONFIG.pricingTemplates,
) {
  const source =
    Array.isArray(templates) && templates.length > 0
      ? templates
      : fallbackTemplates

  const normalized = source
    .map((item, index) =>
      normalizePricingTemplate(item, fallbackTemplates[index] || {}),
    )
    .filter((item) => item.id)

  if (normalized.length === 0) {
    return DEFAULT_PRICING_CONFIG.pricingTemplates.map((item) => ({ ...item }))
  }

  const used = new Set()
  return normalized.map((item, index) => {
    let nextId = item.id
    if (used.has(nextId)) {
      nextId = `${nextId}-${index + 1}`
    }
    used.add(nextId)
    return {
      ...item,
      id: nextId,
    }
  })
}

export function normalizePricingTemplateId(
  value,
  templates,
  fallbackId = DEFAULT_PRICING_CONFIG.pricingTemplateId,
) {
  const ids = new Set((templates || []).map((item) => item.id))
  if (typeof value === 'string' && ids.has(value)) {
    return value
  }
  if (typeof fallbackId === 'string' && ids.has(fallbackId)) {
    return fallbackId
  }
  return (templates || [])[0]?.id || DEFAULT_PRICING_CONFIG.pricingTemplateId
}

export function getPricingTemplateById(
  pricingConfig,
  templateId,
  fallback = DEFAULT_PRICING_CONFIG,
) {
  const config = normalizePricingConfig(pricingConfig || {}, fallback)
  const targetId = normalizePricingTemplateId(
    templateId,
    config.pricingTemplates,
    config.pricingTemplateId,
  )
  return (
    config.pricingTemplates.find((item) => item.id === targetId) ||
    config.pricingTemplates[0] ||
    null
  )
}

export function applyPricingTemplate(base = {}, template = null) {
  if (!template) {
    return {
      ...base,
    }
  }

  return {
    ...base,
    pricingTemplateId: template.id,
    billingRule: normalizeBillingRule(template.billingRule),
    billingSegments: normalizeBillingSegments(template.billingSegments),
    commissionMode: normalizeCommissionMode(template.commissionMode),
    commissionValue: Math.max(0, Number(template.commissionValue || 0)),
  }
}

export function normalizeUnsettledReminderDays(value, fallback = 1) {
  const parsed = Math.floor(Number(value || fallback || 1))
  if (parsed <= 1) return 1
  if (parsed === 2) return 2
  return 3
}

export function normalizeUnsettledReminderMinOrders(value, fallback = 1) {
  const parsed = Math.floor(Number(value || fallback || 1))
  if (!Number.isFinite(parsed) || parsed <= 1) {
    return 1
  }
  return Math.max(1, parsed)
}

export function normalizeSettlementStatus(value, fallback = 'settled') {
  return value === 'settled' || value === 'unsettled' ? value : fallback
}

export function isOrderSettled(order = {}) {
  return normalizeSettlementStatus(order.settlementStatus) === 'settled'
}

function dateStartMs(input) {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    return NaN
  }
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function getUnsettledAgeDays(
  order = {},
  nowMs = Date.now(),
  mode = 'naturalDay',
) {
  const endMs = new Date(order.endAt || order.startAt || nowMs).getTime()
  if (Number.isNaN(endMs)) {
    return 0
  }

  if (normalizeUnsettledReminderMode(mode) === 'elapsed24h') {
    return Math.max(0, Math.floor((nowMs - endMs) / (24 * 60 * 60 * 1000)))
  }

  const nowDay = dateStartMs(nowMs)
  const orderDay = dateStartMs(endMs)
  if (Number.isNaN(nowDay) || Number.isNaN(orderDay)) {
    return 0
  }
  return Math.max(0, Math.floor((nowDay - orderDay) / (24 * 60 * 60 * 1000)))
}

export function shouldOrderTriggerUnsettledReminder(
  order = {},
  pricingConfig = {},
  nowMs = Date.now(),
) {
  const config = normalizePricingConfig(pricingConfig)
  if (!config.unsettledReminderEnabled) {
    return false
  }
  if (isOrderSettled(order)) {
    return false
  }
  const ageDays = getUnsettledAgeDays(
    order,
    nowMs,
    config.unsettledReminderMode,
  )
  return ageDays >= config.unsettledReminderDays
}

export function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

export function hasManualActualAmount(order = {}) {
  return (
    order.actualAmount !== null &&
    order.actualAmount !== undefined &&
    order.actualAmount !== ''
  )
}

export function isTiered15BelowMinimum(
  totalSeconds = 0,
  billingRule = 'minute',
) {
  return (
    normalizeBillingRule(billingRule) === 'tiered15' &&
    Math.max(0, Number(totalSeconds || 0)) < TIERED15_MINIMUM_MINUTES * 60
  )
}

export function getUnbilledThresholdMinutes(
  billingRule = 'minute',
  billingSegments = [],
) {
  const normalizedRule = normalizeBillingRule(billingRule)
  if (normalizedRule === 'tiered15') {
    return TIERED15_MINIMUM_MINUTES
  }

  if (normalizedRule === 'customSegment') {
    const segments = normalizeBillingSegments(billingSegments)
    const minThreshold = segments.reduce((min, item) => {
      if (!Number.isFinite(item.minMinutes) || item.minMinutes <= 0) {
        return min
      }
      if (min === 0) {
        return item.minMinutes
      }
      return Math.min(min, item.minMinutes)
    }, 0)
    return minThreshold
  }

  return 0
}

function getBillableMinutesBySegments(totalMinutes, billingSegments = []) {
  const segments = normalizeBillingSegments(billingSegments)
  const matched = segments.find((segment) => {
    const minPass = totalMinutes >= segment.minMinutes
    const maxPass =
      segment.maxMinutes === null || totalMinutes <= Number(segment.maxMinutes)
    return minPass && maxPass
  })

  if (!matched) {
    return 0
  }

  return Math.max(0, Number(matched.billableHours || 0) * 60)
}

export function getBillableMinutes(
  totalSeconds,
  billingRule = 'minute',
  billingSegments = [],
) {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0))
  const actualMinutes = safeSeconds / 60
  const normalizedRule = normalizeBillingRule(billingRule)

  if (normalizedRule === 'minute') {
    return actualMinutes
  }

  if (normalizedRule === 'customSegment') {
    return getBillableMinutesBySegments(actualMinutes, billingSegments)
  }

  const fullHours = Math.floor(actualMinutes / 60)
  const remainderMinutes = actualMinutes - fullHours * 60

  if (remainderMinutes <= 0) {
    return fullHours * 60
  }

  if (remainderMinutes < TIERED15_MINIMUM_MINUTES) {
    return fullHours * 60
  }

  if (remainderMinutes <= TIERED15_MINIMUM_MINUTES) {
    return fullHours * 60 + 15
  }

  if (remainderMinutes <= 45) {
    return fullHours * 60 + 30
  }

  return (fullHours + 1) * 60
}

export function getBillableHours(
  totalSeconds,
  billingRule = 'minute',
  billingSegments = [],
) {
  return getBillableMinutes(totalSeconds, billingRule, billingSegments) / 60
}

export function getOrderPricingConfig(
  order = {},
  fallback = DEFAULT_PRICING_CONFIG,
) {
  return normalizePricingConfig(order, fallback)
}

export function getGrossAmount(
  order = {},
  totalSeconds = 0,
  fallback = DEFAULT_PRICING_CONFIG,
) {
  const pricing = getOrderPricingConfig(order, fallback)

  if (pricing.billingRule === 'perGame') {
    return roundCurrency(
      Number(order.gamePrice || 0) * Math.max(0, Number(order.gameCount || 0)),
    )
  }

  const billableHours = getBillableHours(
    totalSeconds,
    pricing.billingRule,
    pricing.billingSegments,
  )
  return roundCurrency(Number(order.hourRate || 0) * billableHours)
}

export function getSettlementAmount(
  order = {},
  totalSeconds = 0,
  fallback = DEFAULT_PRICING_CONFIG,
) {
  return getGrossAmount(order, totalSeconds, fallback)
}

export function getCommissionAmount(
  order = {},
  totalSeconds = 0,
  fallback = DEFAULT_PRICING_CONFIG,
) {
  const pricing = getOrderPricingConfig(order, fallback)
  const settlementAmount = getSettlementAmount(order, totalSeconds, fallback)

  if (
    pricing.billingRule === 'perGame' ||
    pricing.commissionMode === 'percentage'
  ) {
    return roundCurrency((settlementAmount * pricing.commissionValue) / 100)
  }

  const billableHours = getBillableHours(
    totalSeconds,
    pricing.billingRule,
    pricing.billingSegments,
  )
  return roundCurrency(billableHours * pricing.commissionValue)
}

export function getNetAmount(
  order = {},
  totalSeconds = 0,
  fallback = DEFAULT_PRICING_CONFIG,
) {
  if (hasManualActualAmount(order)) {
    return roundCurrency(order.actualAmount)
  }

  const settlementAmount = getSettlementAmount(order, totalSeconds, fallback)
  const commissionAmount = getCommissionAmount(order, totalSeconds, fallback)
  return roundCurrency(Math.max(0, settlementAmount - commissionAmount))
}

export function getBillingRuleLabel(value) {
  return (
    BILLING_RULE_OPTIONS.find((item) => item.value === value)?.label ||
    BILLING_RULE_OPTIONS[0].label
  )
}

export function getCommissionModeLabel(value) {
  return (
    COMMISSION_MODE_OPTIONS.find((item) => item.value === value)?.label ||
    COMMISSION_MODE_OPTIONS[0].label
  )
}
