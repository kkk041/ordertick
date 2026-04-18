export const DEFAULT_PRICING_CONFIG = {
  billingRule: 'tiered15',
  commissionMode: 'percentage',
  commissionValue: 10,
}

export const TIERED15_MINIMUM_MINUTES = 15

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
  return value === 'tiered15' || value === 'minute' || value === 'perGame'
    ? value
    : fallback
}

export function normalizeCommissionMode(value, fallback = 'percentage') {
  return value === 'fixed' || value === 'percentage' ? value : fallback
}

export function normalizePricingConfig(
  config = {},
  fallback = DEFAULT_PRICING_CONFIG,
) {
  return {
    billingRule: normalizeBillingRule(config.billingRule, fallback.billingRule),
    commissionMode: normalizeCommissionMode(
      config.commissionMode,
      fallback.commissionMode,
    ),
    commissionValue: Math.max(0, Number(config.commissionValue || 0)),
  }
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

export function getBillableMinutes(totalSeconds, billingRule = 'minute') {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0))
  const actualMinutes = safeSeconds / 60
  const normalizedRule = normalizeBillingRule(billingRule)

  if (normalizedRule === 'minute') {
    return actualMinutes
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

export function getBillableHours(totalSeconds, billingRule = 'minute') {
  return getBillableMinutes(totalSeconds, billingRule) / 60
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

  const billableHours = getBillableHours(totalSeconds, pricing.billingRule)
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

  const billableHours = getBillableHours(totalSeconds, pricing.billingRule)
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
