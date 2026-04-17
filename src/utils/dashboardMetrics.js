import { getNetAmount } from './pricing'

export function getOrderSeconds(order) {
  const startMs = new Date(order.startAt).getTime()
  const endMs = order.endAt ? new Date(order.endAt).getTime() : Date.now()

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return 0
  }

  return Math.max(0, Math.floor((endMs - startMs) / 1000))
}

export function getOrderIncome(order) {
  return getNetAmount(order, getOrderSeconds(order))
}

export function dateStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function dateEnd(date) {
  return dateStart(date) + 24 * 60 * 60 * 1000 - 1
}

export function weekStart(date) {
  const next = new Date(date)
  const day = next.getDay() || 7
  next.setDate(next.getDate() - day + 1)
  next.setHours(0, 0, 0, 0)
  return next.getTime()
}

export function weekEnd(date) {
  return weekStart(date) + 7 * 24 * 60 * 60 * 1000 - 1
}

export function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

export function monthEnd(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  ).getTime()
}

export function sumIncomeInRange(orders, startMs, endMs) {
  return orders.reduce((sum, item) => {
    const ts = new Date(item.startAt).getTime()
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) {
      return sum
    }

    return sum + getOrderIncome(item)
  }, 0)
}

export function sumSecondsInRange(orders, startMs, endMs) {
  return orders.reduce((sum, item) => {
    const ts = new Date(item.startAt).getTime()
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) {
      return sum
    }

    return sum + getOrderSeconds(item)
  }, 0)
}

export function formatPercent(current, previous) {
  if (!previous) {
    return current > 0 ? '+100%' : '0%'
  }

  const percent = ((current - previous) / previous) * 100
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`
}

export function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  return `${hours}小时${minutes}分钟`
}

export function buildRecentDailyIncome(orders, days = 14) {
  const now = new Date()
  const rows = []

  for (let index = days - 1; index >= 0; index -= 1) {
    const current = new Date(now)
    current.setDate(now.getDate() - index)
    const startMs = dateStart(current)
    const endMs = dateEnd(current)

    rows.push({
      label: `${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`,
      income: sumIncomeInRange(orders, startMs, endMs),
    })
  }

  return rows
}

export function buildRecentWeeklyIncome(orders, weeks = 8) {
  const now = new Date()
  const rows = []

  for (let index = weeks - 1; index >= 0; index -= 1) {
    const current = new Date(now)
    current.setDate(now.getDate() - index * 7)
    const startMs = weekStart(current)
    const endMs = weekEnd(current)
    const startDate = new Date(startMs)

    rows.push({
      label: `${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}`,
      income: sumIncomeInRange(orders, startMs, endMs),
    })
  }

  return rows
}

export function buildRecentMonthlyIncome(orders, months = 6) {
  const now = new Date()
  const rows = []

  for (let index = months - 1; index >= 0; index -= 1) {
    const current = new Date(now.getFullYear(), now.getMonth() - index, 1)
    const startMs = monthStart(current)
    const endMs = monthEnd(current)

    rows.push({
      label: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
      income: sumIncomeInRange(orders, startMs, endMs),
    })
  }

  return rows
}

export function buildIncomeSummary(orders) {
  const now = new Date()
  const todayStart = dateStart(now)
  const todayEnd = dateEnd(now)

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayStart = dateStart(yesterday)
  const yesterdayEnd = dateEnd(yesterday)

  const thisWeekStart = weekStart(now)
  const thisWeekEnd = weekEnd(now)
  const lastWeekDate = new Date(now)
  lastWeekDate.setDate(now.getDate() - 7)
  const lastWeekStart = weekStart(lastWeekDate)
  const lastWeekEnd = weekEnd(lastWeekDate)

  const thisMonthStart = monthStart(now)
  const thisMonthEnd = monthEnd(now)
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthStart = monthStart(lastMonthDate)
  const lastMonthEnd = monthEnd(lastMonthDate)

  const todayIncome = sumIncomeInRange(orders, todayStart, todayEnd)
  const yesterdayIncome = sumIncomeInRange(orders, yesterdayStart, yesterdayEnd)
  const thisWeekIncome = sumIncomeInRange(orders, thisWeekStart, thisWeekEnd)
  const lastWeekIncome = sumIncomeInRange(orders, lastWeekStart, lastWeekEnd)
  const thisMonthIncome = sumIncomeInRange(orders, thisMonthStart, thisMonthEnd)
  const lastMonthIncome = sumIncomeInRange(orders, lastMonthStart, lastMonthEnd)
  const todaySeconds = sumSecondsInRange(orders, todayStart, todayEnd)
  const todayCount = orders.filter((item) => {
    const ts = new Date(item.startAt).getTime()
    return !Number.isNaN(ts) && ts >= todayStart && ts <= todayEnd
  }).length

  const bossMap = new Map()
  orders.forEach((item) => {
    const name = item.boss && item.boss.trim() ? item.boss.trim() : '未填写老板'
    const income = getOrderIncome(item)

    if (income <= 0) {
      return
    }

    bossMap.set(name, (bossMap.get(name) || 0) + income)
  })

  const bossRows = Array.from(bossMap.entries())
    .map(([boss, income]) => ({ boss, income }))
    .sort((a, b) => b.income - a.income)

  return {
    todayIncome,
    yesterdayIncome,
    thisWeekIncome,
    lastWeekIncome,
    thisMonthIncome,
    lastMonthIncome,
    todaySeconds,
    todayCount,
    bossRows,
    topIncome: bossRows[0]?.income || 0,
    recentDailyIncome: buildRecentDailyIncome(orders, 14),
    recentWeeklyIncome: buildRecentWeeklyIncome(orders, 8),
    recentMonthlyIncome: buildRecentMonthlyIncome(orders, 6),
    comparisonRows: [
      {
        key: 'today',
        label: '今日 vs 昨日',
        currentLabel: '今日',
        previousLabel: '昨日',
        currentValue: todayIncome,
        previousValue: yesterdayIncome,
      },
      {
        key: 'week',
        label: '本周 vs 上周',
        currentLabel: '本周',
        previousLabel: '上周',
        currentValue: thisWeekIncome,
        previousValue: lastWeekIncome,
      },
      {
        key: 'month',
        label: '本月 vs 上月',
        currentLabel: '本月',
        previousLabel: '上月',
        currentValue: thisMonthIncome,
        previousValue: lastMonthIncome,
      },
    ],
  }
}
