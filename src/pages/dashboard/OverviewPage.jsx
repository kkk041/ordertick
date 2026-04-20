import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  QuestionCircleOutlined,
  RollbackOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import AnimatedNumber from '../../components/common/AnimatedNumber'
import overviewCopy from '../../data/overviewCopy.json'
import {
  getPricingConfig,
  loadOrdersData,
  saveOrdersData,
  loadReportTemplate,
  loadReportFields,
  generateReportText,
} from '../../utils/orderStorage'
import {
  BILLING_RULE_OPTIONS,
  COMMISSION_MODE_OPTIONS,
  DEFAULT_PRICING_CONFIG,
  getPricingTemplateById,
  getBillingRuleLabel,
  getCommissionAmount,
  getCommissionModeLabel,
  getUnbilledThresholdMinutes,
  getUnsettledAgeDays,
  getGrossAmount,
  hasManualActualAmount,
  isOrderSettled,
  getNetAmount,
  getOrderPricingConfig,
  getSettlementAmount,
  normalizeBillingRule,
  normalizeBillingSegments,
  normalizeCommissionMode,
  normalizeSettlementStatus,
  shouldOrderTriggerUnsettledReminder,
} from '../../utils/pricing'
import './OverviewPage.css'

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
  })
}

function toDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  return `${hours}小时 ${minutes}分钟 ${seconds}秒`
}

function getOrderDurationSeconds(order, nowMs = Date.now()) {
  const startMs = new Date(order.startAt).getTime()
  const endMs = order.endAt ? new Date(order.endAt).getTime() : nowMs
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return 0
  }

  return Math.max(0, Math.floor((endMs - startMs) / 1000))
}

function calcExpectedAmount(order, nowMs = Date.now()) {
  const seconds = getOrderDurationSeconds(order, nowMs)
  return getGrossAmount(order, seconds).toFixed(2)
}

function calcCommissionTotal(order, nowMs = Date.now()) {
  const seconds = getOrderDurationSeconds(order, nowMs)
  return getCommissionAmount(order, seconds).toFixed(2)
}

function calcNetAmount(order, nowMs = Date.now()) {
  const seconds = getOrderDurationSeconds(order, nowMs)
  return getNetAmount(order, seconds).toFixed(2)
}

function toPickerValue(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return dayjs(date)
}

function pickerToIso(value) {
  if (!value) {
    return ''
  }

  const parsed = dayjs.isDayjs(value) ? value.toDate() : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString()
}

const {
  hourlyEncouragements: hourlyEncouragementCopy,
  dailyReflections: dailyReflectionCopy,
} = overviewCopy

const BILLING_RULE_HELP =
  '分钟制：打几分钟算几分钟。15分钟制：未满15分钟默认不计费；满15分钟按15分钟算，超过15分钟按半小时算，超过45分钟按1小时算。'
const COMMISSION_MODE_HELP =
  '按比例抽成：按结算金额扣百分比。按小时固定抽成：按可计费时长，每小时固定扣一笔。'
const COMMISSION_VALUE_HELP =
  '抽成数值会跟随抽成方式变化：比例模式填百分比，固定模式填每小时金额。'

function renderFieldLabel(label, tooltip) {
  return (
    <span className="overview-field-label">
      <span>{label}</span>
      {tooltip ? (
        <Tooltip title={tooltip}>
          <QuestionCircleOutlined className="overview-field-label-help" />
        </Tooltip>
      ) : null}
    </span>
  )
}

function getValidHourRate(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function ensureHourRate(value, warningMessage = '请先填写单价，单价为必填项') {
  const validHourRate = getValidHourRate(value)
  if (validHourRate === null) {
    message.warning(warningMessage)
    return null
  }

  return validHourRate
}

function normalizeOptionalActualAmount(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(0, parsed)
}

function getFormDurationSeconds(startValue, endValue) {
  const startAt = pickerToIso(startValue)
  const endAt = pickerToIso(endValue)

  if (!startAt || !endAt) {
    return 0
  }

  return Math.max(
    0,
    Math.floor(
      (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000,
    ),
  )
}

function getShortTiered15State({
  billingRule,
  billingSegments,
  totalSeconds,
  actualAmount,
}) {
  const thresholdMinutes = getUnbilledThresholdMinutes(
    billingRule,
    billingSegments,
  )
  const belowMinimum =
    thresholdMinutes > 0 &&
    Math.max(0, Number(totalSeconds || 0)) < thresholdMinutes * 60
  const hasManualActual =
    actualAmount !== null && actualAmount !== undefined && actualAmount !== ''

  return {
    thresholdMinutes,
    ruleLabel: getBillingRuleLabel(
      normalizeBillingRule(billingRule, DEFAULT_PRICING_CONFIG.billingRule),
    ),
    belowMinimum,
    hasManualActual,
    shouldGrayOut: belowMinimum && !hasManualActual,
    usesManualActual: belowMinimum && hasManualActual,
  }
}

function buildUnbilledHintText(state) {
  if (!state?.thresholdMinutes) {
    return ''
  }
  return `${state.ruleLabel}未满${state.thresholdMinutes}分钟`
}

function renderShortTiered15Notice({
  totalSeconds,
  billingRule,
  billingSegments,
  actualAmount,
  context = 'active',
}) {
  const state = getShortTiered15State({
    billingRule,
    billingSegments,
    totalSeconds,
    actualAmount,
  })

  if (!state.belowMinimum) {
    return null
  }

  const messageText = state.hasManualActual
    ? `当前时长${buildUnbilledHintText(state)}，系统结算仍按0处理，到手金额将优先按你手动填写的实际到手金额显示。`
    : `当前时长${buildUnbilledHintText(state)}，默认不计费。如果老板付款了，请手动填写实际到手金额；不填则会按未计费记录保存并置灰显示。`

  const descriptionMap = {
    active: '结束接单后，这条记录会保留在表格里，是否删除由你决定。',
    supplement:
      '补录时通常不建议加这类订单；如果你确定要留档，也可以直接保存，后续再删除或编辑。',
    quick:
      '快速计算通常用于直接补入有效订单；如果这单只是留痕，可以保存后再决定是否删除。',
    edit: '如果老板付款了，直接手动填写实际到手金额即可。',
  }

  return (
    <Alert
      showIcon
      type={state.hasManualActual ? 'info' : 'warning'}
      className="overview-short-order-alert compact-order-form-span-2"
      message={`${state.ruleLabel}阈值提醒`}
      description={`${messageText} ${descriptionMap[context] || ''}`.trim()}
    />
  )
}

function formatTableMoneyInteger(value) {
  return Math.round(Number(value || 0))
}

function getSettlementStatusLabel(order) {
  return isOrderSettled(order) ? '已结' : '未结'
}

function getSettlementStatusClass(order) {
  return isOrderSettled(order)
    ? 'overview-order-status-pill is-settled'
    : 'overview-order-status-pill is-unsettled'
}

function hashString(value) {
  const input = String(value || '')
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }

  return hash
}

function pickSeededItem(items, seedKey) {
  if (!Array.isArray(items) || items.length === 0) {
    return ''
  }

  return items[hashString(seedKey) % items.length]
}

function trimLeadingConnector(value) {
  return String(value || '').replace(
    /^(先把|先让|先|把|让|继续把|继续|别急着|别让)/,
    '',
  )
}

function buildHourlyQuote(copy, seedKey) {
  if (!copy || typeof copy !== 'object') {
    return ''
  }

  const opener = pickSeededItem(copy.opener, `${seedKey}:opener`)
  const focus = pickSeededItem(copy.focus, `${seedKey}:focus`)
  const mindset = pickSeededItem(copy.mindset, `${seedKey}:mindset`)
  const ending = pickSeededItem(copy.ending, `${seedKey}:ending`)

  const patterns = [
    `${opener}，${focus}。${mindset}，${ending}`,
    `${opener}。${mindset}，${focus}。${ending}`,
    `${opener}，别着急，${focus}。${ending}`,
    `${opener}，${mindset}。这会儿就先${trimLeadingConnector(focus)}。${ending}`,
  ]

  return patterns[hashString(`${seedKey}:pattern`) % patterns.length]
}

function getTimePeriod(hour) {
  if (hour >= 5 && hour < 11) {
    return 'morning'
  }

  if (hour >= 11 && hour < 17) {
    return 'noon'
  }

  if (hour >= 17 && hour < 23) {
    return 'evening'
  }

  return 'lateNight'
}

function buildHourlyEncouragement({
  hour,
  todayOrderCount,
  activeOrder,
  period,
  message,
}) {
  const periodLabelMap = {
    morning: '早上状态拉满',
    noon: '下午继续加油',
    evening: '晚上努努力',
    lateNight: '夜深也顶住',
  }

  const periodLabel = periodLabelMap[period]

  if (activeOrder) {
    return {
      title: `${String(hour).padStart(2, '0')}:00 鼓励一下`,
      periodLabel,
      period,
      message,
      footer: '你现在正在计时中，先把手上的这一单稳稳做完，剩下的慢慢来。',
    }
  }

  if (todayOrderCount > 0) {
    return {
      title: `${String(hour).padStart(2, '0')}:00 鼓励一下`,
      periodLabel,
      period,
      message,
      footer: `今天已经记了 ${todayOrderCount} 单，节奏已经在你手里，后面稳稳往前走就好。`,
    }
  }

  return {
    title: `${String(hour).padStart(2, '0')}:00 鼓励一下`,
    periodLabel,
    period,
    message,
    footer: '今天还没开单也没关系，先把自己调回状态，机会来了会更容易接住。',
  }
}

function buildDailyReflectionQuote(copy, seedKey) {
  if (!copy || typeof copy !== 'object') {
    return ''
  }

  const subject = pickSeededItem(copy.subject, `${seedKey}:subject`)
  const observation = pickSeededItem(copy.observation, `${seedKey}:observation`)
  const advice = pickSeededItem(copy.advice, `${seedKey}:advice`)

  const patterns = [
    `${subject}，${observation}${advice}`,
    `${subject}${observation}${advice}`,
    `${subject}，说到底${observation}${advice}`,
  ]

  return patterns[hashString(`${seedKey}:pattern`) % patterns.length]
}

function buildDailyReflection(nowMs, quote) {
  const currentDate = new Date(nowMs)
  const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  return {
    key: `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}`,
    title: `每日一句 · ${weekLabels[currentDate.getDay()]}`,
    quote,
    note: '别急着把所有事都想明白，先把今天过稳，很多答案会自己慢慢出现。',
  }
}

function renderOverviewPanelTitle(icon, label) {
  return (
    <div className="overview-panel-title">
      <span className="overview-panel-title-icon">{icon}</span>
      <span>{label}</span>
    </div>
  )
}

function OverviewPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [activeOrder, setActiveOrder] = useState(null)
  const [settlementFeedback, setSettlementFeedback] = useState(null)
  const [dataReady, setDataReady] = useState(false)
  const [pricingConfig, setPricingConfig] = useState(DEFAULT_PRICING_CONFIG)
  const [note, setNote] = useState('')
  const [boss, setBoss] = useState('')
  const [groupName, setGroupName] = useState('')
  const [hourRate, setHourRate] = useState(40)
  const [gamePrice, setGamePrice] = useState(0)
  const [gameCount, setGameCount] = useState(1)
  const [billingRule, setBillingRule] = useState(
    DEFAULT_PRICING_CONFIG.billingRule,
  )
  const [commissionMode, setCommissionMode] = useState(
    DEFAULT_PRICING_CONFIG.commissionMode,
  )
  const [commissionValue, setCommissionValue] = useState(
    DEFAULT_PRICING_CONFIG.commissionValue,
  )
  const [pricingTemplateId, setPricingTemplateId] = useState(
    DEFAULT_PRICING_CONFIG.pricingTemplateId,
  )
  const [pricingTemplates, setPricingTemplates] = useState(
    DEFAULT_PRICING_CONFIG.pricingTemplates,
  )
  const [showDailyEncouragement, setShowDailyEncouragement] = useState(
    DEFAULT_PRICING_CONFIG.showDailyEncouragement,
  )
  const [unsettledReminderEnabled, setUnsettledReminderEnabled] = useState(
    DEFAULT_PRICING_CONFIG.unsettledReminderEnabled,
  )
  const [unsettledReminderDays, setUnsettledReminderDays] = useState(
    DEFAULT_PRICING_CONFIG.unsettledReminderDays,
  )
  const [unsettledReminderMode, setUnsettledReminderMode] = useState(
    DEFAULT_PRICING_CONFIG.unsettledReminderMode,
  )
  const [unsettledReminderMinOrders, setUnsettledReminderMinOrders] = useState(
    DEFAULT_PRICING_CONFIG.unsettledReminderMinOrders,
  )
  const [nowMs, setNowMs] = useState(Date.now())
  const [isSupplementOpen, setIsSupplementOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isQuickCalcOpen, setIsQuickCalcOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState(null)
  const [settlementFlashHovered, setSettlementFlashHovered] = useState(false)
  const [settlementFlashWasHovered, setSettlementFlashWasHovered] =
    useState(false)
  const [editingOrderId, setEditingOrderId] = useState('')
  const [supplementForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [quickCalcForm] = Form.useForm()

  const supplementStart = Form.useWatch('startAtInput', supplementForm)
  const supplementEnd = Form.useWatch('endAtInput', supplementForm)
  const supplementTemplateId = Form.useWatch(
    'pricingTemplateId',
    supplementForm,
  )
  const supplementBillingRule = Form.useWatch('billingRule', supplementForm)
  const supplementActualAmount = Form.useWatch('actualAmount', supplementForm)
  const editStart = Form.useWatch('startAtInput', editForm)
  const editEnd = Form.useWatch('endAtInput', editForm)
  const editTemplateId = Form.useWatch('pricingTemplateId', editForm)
  const editBillingRule = Form.useWatch('billingRule', editForm)
  const editActualAmount = Form.useWatch('actualAmount', editForm)
  const quickCalcStart = Form.useWatch('startAtInput', quickCalcForm)
  const quickCalcEnd = Form.useWatch('endAtInput', quickCalcForm)
  const quickCalcTemplateId = Form.useWatch('pricingTemplateId', quickCalcForm)
  const quickCalcBillingRule = Form.useWatch('billingRule', quickCalcForm)
  const quickCalcActualAmount = Form.useWatch('actualAmount', quickCalcForm)

  const supplementSeconds = useMemo(
    () => getFormDurationSeconds(supplementStart, supplementEnd),
    [supplementEnd, supplementStart],
  )
  const editSeconds = useMemo(
    () => getFormDurationSeconds(editStart, editEnd),
    [editEnd, editStart],
  )

  const quickCalcSeconds = useMemo(() => {
    return getFormDurationSeconds(quickCalcStart, quickCalcEnd)
  }, [quickCalcStart, quickCalcEnd])

  const supplementBillingSegments = buildBillingSegmentsSnapshot(
    supplementBillingRule,
    supplementTemplateId || pricingTemplateId,
  )

  const editBillingSegments = buildBillingSegmentsSnapshot(
    editBillingRule,
    editTemplateId || pricingTemplateId,
  )

  const quickCalcBillingSegments = buildBillingSegmentsSnapshot(
    quickCalcBillingRule,
    quickCalcTemplateId || pricingTemplateId,
  )

  const applyPricingConfigState = useCallback((savedPricingConfig) => {
    setPricingConfig(savedPricingConfig)
    setBillingRule(savedPricingConfig.billingRule)
    setCommissionMode(savedPricingConfig.commissionMode)
    setCommissionValue(savedPricingConfig.commissionValue)
    setPricingTemplateId(savedPricingConfig.pricingTemplateId)
    setPricingTemplates(savedPricingConfig.pricingTemplates)
    setShowDailyEncouragement(
      savedPricingConfig.showDailyEncouragement !== false,
    )
    setUnsettledReminderEnabled(
      savedPricingConfig.unsettledReminderEnabled !== false,
    )
    setUnsettledReminderDays(savedPricingConfig.unsettledReminderDays || 1)
    setUnsettledReminderMode(
      savedPricingConfig.unsettledReminderMode || 'naturalDay',
    )
    setUnsettledReminderMinOrders(
      savedPricingConfig.unsettledReminderMinOrders || 1,
    )
  }, [])

  useEffect(() => {
    let canceled = false

    const load = async () => {
      const [payload, savedPricingConfig] = await Promise.all([
        loadOrdersData(),
        getPricingConfig(),
      ])
      if (canceled) {
        return
      }

      setOrders(Array.isArray(payload.orders) ? payload.orders : [])
      setActiveOrder(payload.activeOrder || null)
      applyPricingConfigState(savedPricingConfig)
      setDataReady(true)
    }

    load()

    return () => {
      canceled = true
    }
  }, [applyPricingConfigState])

  useEffect(() => {
    const syncPricing = async (event) => {
      if (event?.detail) {
        applyPricingConfigState(event.detail)
        return
      }
      const latest = await getPricingConfig()
      applyPricingConfigState(latest)
    }

    window.addEventListener('pricing-config-updated', syncPricing)
    window.addEventListener('storage', syncPricing)

    return () => {
      window.removeEventListener('pricing-config-updated', syncPricing)
      window.removeEventListener('storage', syncPricing)
    }
  }, [applyPricingConfigState])

  useEffect(() => {
    if (!dataReady) {
      return
    }

    saveOrdersData({
      orders,
      activeOrder,
    })
  }, [orders, activeOrder, dataReady])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!settlementFeedback) {
      return undefined
    }

    const delay = settlementFlashHovered
      ? 0
      : settlementFlashWasHovered
        ? 1200
        : 8000
    if (!delay) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setSettlementFeedback(null)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [settlementFeedback, settlementFlashHovered, settlementFlashWasHovered])

  const todayKey = toDateKey(nowMs)
  const currentHour = new Date(nowMs).getHours()
  const hourBucketKey = `${todayKey}-${String(currentHour).padStart(2, '0')}`

  const todayOrders = useMemo(() => {
    return orders.filter((item) => toDateKey(item.startAt) === todayKey)
  }, [orders, todayKey])

  const activeSeconds = useMemo(() => {
    if (!activeOrder) {
      return 0
    }
    return getOrderDurationSeconds(activeOrder, nowMs)
  }, [activeOrder, nowMs])

  const todayTotalSeconds = useMemo(() => {
    return todayOrders.reduce(
      (sum, item) => sum + getOrderDurationSeconds(item, nowMs),
      0,
    )
  }, [todayOrders, nowMs])

  const todayExpectedIncome = useMemo(() => {
    return todayOrders.reduce((sum, item) => {
      return sum + Number(calcExpectedAmount(item, nowMs))
    }, 0)
  }, [todayOrders, nowMs])

  const todayActualIncome = useMemo(() => {
    return todayOrders.reduce((sum, item) => {
      return sum + Number(calcNetAmount(item, nowMs))
    }, 0)
  }, [todayOrders, nowMs])

  const activeOrderExpectedIncome = useMemo(() => {
    if (!activeOrder) {
      return 0
    }

    return Number(calcExpectedAmount(activeOrder, nowMs))
  }, [activeOrder, nowMs])

  const activeOrderCommission = useMemo(() => {
    if (!activeOrder) {
      return 0
    }

    return Number(calcCommissionTotal(activeOrder, nowMs))
  }, [activeOrder, nowMs])

  const activeOrderNetIncome = useMemo(() => {
    if (!activeOrder) {
      return 0
    }

    return Number(calcNetAmount(activeOrder, nowMs))
  }, [activeOrder, nowMs])

  const activeShortTiered15State = useMemo(() => {
    if (!activeOrder) {
      return {
        belowMinimum: false,
        hasManualActual: false,
        shouldGrayOut: false,
        usesManualActual: false,
      }
    }

    return getShortTiered15State({
      billingRule: activeOrder.billingRule,
      billingSegments: activeOrder.billingSegments,
      totalSeconds: activeSeconds,
      actualAmount: activeOrder.actualAmount,
    })
  }, [activeOrder, activeSeconds])

  const selectedPricingTemplate = useMemo(() => {
    return getPricingTemplateById(
      {
        ...pricingConfig,
        pricingTemplates,
        pricingTemplateId,
      },
      pricingTemplateId,
      pricingConfig,
    )
  }, [pricingConfig, pricingTemplateId, pricingTemplates])

  useEffect(() => {
    if (!selectedPricingTemplate) {
      return
    }
    setBillingRule(selectedPricingTemplate.billingRule)
    setCommissionMode(selectedPricingTemplate.commissionMode)
    setCommissionValue(Number(selectedPricingTemplate.commissionValue || 0))
  }, [selectedPricingTemplate])

  const todaySettledNetIncome = useMemo(() => {
    return todayOrders.reduce((sum, item) => {
      if (!isOrderSettled(item)) {
        return sum
      }
      return sum + Number(calcNetAmount(item, nowMs))
    }, 0)
  }, [todayOrders, nowMs])

  const todaySettledCount = useMemo(() => {
    return todayOrders.filter((item) => isOrderSettled(item)).length
  }, [todayOrders])

  const todayUnsettledCount = useMemo(() => {
    return todayOrders.filter((item) => !isOrderSettled(item)).length
  }, [todayOrders])

  const todayUnsettledNetIncome = useMemo(() => {
    return todayOrders.reduce((sum, item) => {
      if (isOrderSettled(item)) {
        return sum
      }
      return sum + Number(calcNetAmount(item, nowMs))
    }, 0)
  }, [todayOrders, nowMs])

  const overdueUnsettledOrders = useMemo(() => {
    return orders.filter((item) =>
      shouldOrderTriggerUnsettledReminder(
        item,
        {
          ...pricingConfig,
          unsettledReminderEnabled,
          unsettledReminderDays,
          unsettledReminderMode,
        },
        nowMs,
      ),
    )
  }, [
    nowMs,
    orders,
    pricingConfig,
    unsettledReminderDays,
    unsettledReminderEnabled,
    unsettledReminderMode,
  ])

  const shouldShowUnsettledReminder =
    unsettledReminderEnabled &&
    overdueUnsettledOrders.length >= unsettledReminderMinOrders

  const hourlyCopySelection = useMemo(() => {
    const period = getTimePeriod(currentHour)
    return {
      period,
      message: buildHourlyQuote(
        hourlyEncouragementCopy,
        `${hourBucketKey}:hourly`,
      ),
    }
  }, [currentHour, hourBucketKey])

  const hourlyEncouragement = useMemo(() => {
    return buildHourlyEncouragement({
      hour: currentHour,
      todayOrderCount: todayOrders.length,
      activeOrder,
      period: hourlyCopySelection.period,
      message: hourlyCopySelection.message,
    })
  }, [
    activeOrder,
    currentHour,
    hourlyCopySelection.message,
    hourlyCopySelection.period,
    todayOrders.length,
  ])

  const dailyReflectionQuote = useMemo(() => {
    return buildDailyReflectionQuote(dailyReflectionCopy, `${todayKey}:daily`)
  }, [todayKey])

  const dailyReflection = useMemo(() => {
    return buildDailyReflection(nowMs, dailyReflectionQuote)
  }, [dailyReflectionQuote, nowMs])

  const startOrder = () => {
    if (activeOrder) {
      message.warning('当前已有进行中的订单，请先结束')
      return
    }

    const currentBillingRule = normalizeBillingRule(
      billingRule,
      pricingConfig.billingRule,
    )

    if (currentBillingRule !== 'perGame') {
      const validHourRate = ensureHourRate(hourRate)
      if (validHourRate === null) {
        return
      }
    }

    const payload = {
      id: `run-${Date.now()}`,
      startAt: new Date().toISOString(),
      note: note.trim() || '未备注',
      boss: boss.trim() || '',
      groupName: groupName.trim() || '',
      hourRate: currentBillingRule === 'perGame' ? 0 : ensureHourRate(hourRate),
      pricingTemplateId,
      billingRule: currentBillingRule,
      billingSegments: buildBillingSegmentsSnapshot(
        currentBillingRule,
        pricingTemplateId,
      ),
      commissionMode: normalizeCommissionMode(
        commissionMode,
        pricingConfig.commissionMode,
      ),
      commissionValue: Math.max(0, Number(commissionValue || 0)),
      actualAmount: null,
      settlementStatus: 'unsettled',
      settledAt: null,
      status: 'running',
      ...(currentBillingRule === 'perGame' && {
        gamePrice: Math.max(0, Number(gamePrice || 0)),
        gameCount: Math.max(1, Math.round(Number(gameCount || 1))),
      }),
    }

    setActiveOrder(payload)
    message.success('已开始计时，接单中')
  }

  const endOrder = () => {
    if (!activeOrder) {
      message.warning('当前没有进行中的订单')
      return
    }

    const currentBillingRule = normalizeBillingRule(
      billingRule || activeOrder.billingRule,
      pricingConfig.billingRule,
    )

    if (currentBillingRule !== 'perGame') {
      const validHourRate = ensureHourRate(
        hourRate || activeOrder.hourRate,
        '结束接单前请先填写单价，单价为必填项',
      )
      if (validHourRate === null) {
        return
      }
    }

    const endAt = new Date().toISOString()
    const endedOrder = {
      ...activeOrder,
      endAt,
      status: 'done',
      note: note.trim() || activeOrder.note || '未备注',
      boss: boss.trim() || activeOrder.boss || '',
      groupName: groupName.trim() || activeOrder.groupName || '',
      hourRate:
        currentBillingRule === 'perGame'
          ? 0
          : ensureHourRate(hourRate || activeOrder.hourRate),
      pricingTemplateId,
      billingRule: currentBillingRule,
      billingSegments:
        normalizeBillingRule(
          activeOrder.billingRule,
          pricingConfig.billingRule,
        ) === 'customSegment'
          ? normalizeBillingSegments(activeOrder.billingSegments)
          : buildBillingSegmentsSnapshot(currentBillingRule, pricingTemplateId),
      commissionMode: normalizeCommissionMode(
        commissionMode || activeOrder.commissionMode,
        pricingConfig.commissionMode,
      ),
      commissionValue: Math.max(
        0,
        Number(commissionValue ?? activeOrder.commissionValue ?? 0),
      ),
      actualAmount: normalizeOptionalActualAmount(activeOrder.actualAmount),
      settlementStatus: normalizeSettlementStatus(
        activeOrder.settlementStatus,
        'unsettled',
      ),
      settledAt: activeOrder.settledAt || null,
      ...(currentBillingRule === 'perGame' && {
        gamePrice: Math.max(0, Number(gamePrice || activeOrder.gamePrice || 0)),
        gameCount: Math.max(
          1,
          Math.round(Number(gameCount || activeOrder.gameCount || 1)),
        ),
      }),
    }

    const endedSeconds = getOrderDurationSeconds(
      endedOrder,
      new Date(endAt).getTime(),
    )
    const settlementAmount = getSettlementAmount(endedOrder, endedSeconds)
    const commissionAmount = getCommissionAmount(endedOrder, endedSeconds)
    const netAmount = getNetAmount(endedOrder, endedSeconds)
    const shortTiered15State = getShortTiered15State({
      billingRule: endedOrder.billingRule,
      billingSegments: endedOrder.billingSegments,
      totalSeconds: endedSeconds,
      actualAmount: endedOrder.actualAmount,
    })

    setOrders((prev) => [endedOrder, ...prev])
    setActiveOrder(null)
    setSettlementFlashHovered(false)
    setSettlementFlashWasHovered(false)
    setSettlementFeedback({
      id: endedOrder.id,
      durationText: formatDuration(endedSeconds),
      settlementAmount,
      commissionAmount,
      netAmount,
      isShortTiered15Unbilled: shortTiered15State.shouldGrayOut,
    })

    if (shortTiered15State.shouldGrayOut) {
      message.warning(
        `这单${buildUnbilledHintText(shortTiered15State)}，已按未计费记录保存；如果老板付款了，请编辑并手动填写实际到手金额。`,
      )
      return
    }

    message.success('订单已结束并记录')
  }

  const deleteOrder = (id) => {
    setOrders((prev) => prev.filter((item) => item.id !== id))
  }

  const toggleOrderSettlementStatus = (id) => {
    setOrders((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item
        }

        const nextStatus = isOrderSettled(item) ? 'unsettled' : 'settled'
        return {
          ...item,
          settlementStatus: nextStatus,
          settledAt:
            nextStatus === 'settled'
              ? item.settledAt || new Date().toISOString()
              : null,
        }
      }),
    )
  }

  const openDetailModal = (order) => {
    setDetailOrder(order)
    setDetailOpen(true)
  }

  const handleCopyReport = async (record) => {
    try {
      const template = loadReportTemplate()
      const fields = loadReportFields()
      const text = generateReportText(template, record, fields, {
        getOrderDurationSeconds,
        getSettlementAmount,
        getCommissionAmount,
        getNetAmount,
        formatDuration,
      })
      await navigator.clipboard.writeText(text)
      message.success('报单已复制到剪贴板')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  const handleCopyLatestReport = () => {
    const latestDone = todayOrders.find((o) => o.status === 'done')
    if (!latestDone) {
      message.warning('今日还没有已完成的订单，无法生成报单')
      return
    }
    handleCopyReport(latestDone)
  }

  function buildBillingSegmentsSnapshot(ruleValue, templateIdValue) {
    if (
      normalizeBillingRule(ruleValue, pricingConfig.billingRule) !==
      'customSegment'
    ) {
      return []
    }

    const template = getPricingTemplateById(
      {
        ...pricingConfig,
        pricingTemplates,
        pricingTemplateId,
      },
      templateIdValue || pricingTemplateId,
      pricingConfig,
    )

    return normalizeBillingSegments(template?.billingSegments)
  }

  const openSupplementModal = () => {
    const end = new Date()
    const start = new Date(end.getTime() - 60 * 60 * 1000)

    supplementForm.setFieldsValue({
      startAtInput: toPickerValue(start.toISOString()),
      endAtInput: toPickerValue(end.toISOString()),
      pricingTemplateId,
      hourRate: Number(hourRate || 0),
      billingRule,
      commissionMode,
      commissionValue: Number(commissionValue || 0),
      boss: boss.trim() || '',
      groupName: groupName.trim() || '',
      note: note.trim() || '',
      actualAmount: null,
      settlementStatus: 'unsettled',
    })
    setIsSupplementOpen(true)
  }

  const submitSupplement = async () => {
    const values = await supplementForm.validateFields()
    const startAt = pickerToIso(values.startAtInput)
    const endAt = pickerToIso(values.endAtInput)

    if (!startAt || !endAt) {
      message.error('开始时间和结束时间格式不正确')
      return
    }

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      message.error('结束时间必须晚于开始时间')
      return
    }

    const suppBillingRule = normalizeBillingRule(
      values.billingRule,
      pricingConfig.billingRule,
    )

    if (suppBillingRule !== 'perGame') {
      const validHourRate = ensureHourRate(
        values.hourRate,
        '补录订单时请填写单价，单价为必填项',
      )
      if (validHourRate === null) {
        return
      }
    }

    const newOrder = {
      id: `manual-${Date.now()}`,
      startAt,
      endAt,
      boss: values.boss?.trim() || '',
      groupName: values.groupName?.trim() || '',
      note: values.note?.trim() || '补录订单',
      hourRate:
        suppBillingRule === 'perGame' ? 0 : ensureHourRate(values.hourRate),
      pricingTemplateId: values.pricingTemplateId || pricingTemplateId,
      billingRule: suppBillingRule,
      billingSegments: buildBillingSegmentsSnapshot(
        suppBillingRule,
        values.pricingTemplateId || pricingTemplateId,
      ),
      commissionMode: normalizeCommissionMode(
        values.commissionMode,
        pricingConfig.commissionMode,
      ),
      commissionValue: Math.max(0, Number(values.commissionValue || 0)),
      actualAmount: normalizeOptionalActualAmount(values.actualAmount),
      settlementStatus: normalizeSettlementStatus(
        values.settlementStatus,
        'unsettled',
      ),
      settledAt:
        normalizeSettlementStatus(values.settlementStatus, 'unsettled') ===
        'settled'
          ? new Date().toISOString()
          : null,
      status: 'done',
      ...(suppBillingRule === 'perGame' && {
        gamePrice: Math.max(0, Number(values.gamePrice || 0)),
        gameCount: Math.max(1, Math.round(Number(values.gameCount || 1))),
      }),
    }

    const shortTiered15State = getShortTiered15State({
      billingRule: newOrder.billingRule,
      billingSegments: newOrder.billingSegments,
      totalSeconds: getOrderDurationSeconds(newOrder),
      actualAmount: newOrder.actualAmount,
    })

    setOrders((prev) => [newOrder, ...prev])
    setIsSupplementOpen(false)

    if (shortTiered15State.shouldGrayOut) {
      message.warning(
        `这条补录订单${buildUnbilledHintText(shortTiered15State)}，已按未计费记录保存；如果老板付款了，请编辑并手动填写实际到手金额。`,
      )
      return
    }

    message.success('补录订单已添加')
  }

  const openEditModal = (record) => {
    setEditingOrderId(record.id)
    editForm.setFieldsValue({
      startAtInput: toPickerValue(record.startAt),
      endAtInput: toPickerValue(record.endAt),
      pricingTemplateId: record.pricingTemplateId || '',
      hourRate: Number(record.hourRate || 0),
      billingRule: normalizeBillingRule(
        record.billingRule,
        pricingConfig.billingRule,
      ),
      commissionMode: normalizeCommissionMode(
        record.commissionMode,
        pricingConfig.commissionMode,
      ),
      commissionValue: Number(record.commissionValue || 0),
      boss: record.boss || '',
      groupName: record.groupName || '',
      note: record.note || '',
      actualAmount: normalizeOptionalActualAmount(record.actualAmount),
      settlementStatus: normalizeSettlementStatus(
        record.settlementStatus,
        'settled',
      ),
      gamePrice: Number(record.gamePrice || 0),
      gameCount: Number(record.gameCount || 1),
    })
    setIsEditOpen(true)
  }

  const submitEditOrder = async () => {
    const values = await editForm.validateFields()
    const startAt = pickerToIso(values.startAtInput)
    const endAt = pickerToIso(values.endAtInput)

    if (!startAt || !endAt) {
      message.error('开始时间和结束时间格式不正确')
      return
    }

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      message.error('结束时间必须晚于开始时间')
      return
    }

    const editBillingRuleVal = normalizeBillingRule(
      values.billingRule,
      pricingConfig.billingRule,
    )

    if (editBillingRuleVal !== 'perGame') {
      const validHourRate = ensureHourRate(
        values.hourRate,
        '保存订单前请填写单价，单价为必填项',
      )
      if (validHourRate === null) {
        return
      }
    }

    setOrders((prev) =>
      prev.map((item) => {
        if (item.id !== editingOrderId) {
          return item
        }

        return {
          ...item,
          startAt,
          endAt,
          boss: values.boss?.trim() || '',
          groupName: values.groupName?.trim() || '',
          hourRate:
            editBillingRuleVal === 'perGame'
              ? 0
              : ensureHourRate(values.hourRate),
          pricingTemplateId: values.pricingTemplateId || pricingTemplateId,
          billingRule: editBillingRuleVal,
          billingSegments: buildBillingSegmentsSnapshot(
            editBillingRuleVal,
            values.pricingTemplateId || pricingTemplateId,
          ),
          commissionMode: normalizeCommissionMode(
            values.commissionMode,
            pricingConfig.commissionMode,
          ),
          commissionValue: Math.max(0, Number(values.commissionValue || 0)),
          note: values.note?.trim() || '未备注',
          actualAmount: normalizeOptionalActualAmount(values.actualAmount),
          settlementStatus: normalizeSettlementStatus(
            values.settlementStatus,
            item.settlementStatus,
          ),
          settledAt:
            normalizeSettlementStatus(
              values.settlementStatus,
              item.settlementStatus,
            ) === 'settled'
              ? item.settledAt || new Date().toISOString()
              : null,
          ...(editBillingRuleVal === 'perGame' && {
            gamePrice: Math.max(0, Number(values.gamePrice || 0)),
            gameCount: Math.max(1, Math.round(Number(values.gameCount || 1))),
          }),
          ...(editBillingRuleVal !== 'perGame' && {
            gamePrice: undefined,
            gameCount: undefined,
          }),
        }
      }),
    )

    const shortTiered15State = getShortTiered15State({
      billingRule: values.billingRule,
      billingSegments: buildBillingSegmentsSnapshot(
        editBillingRuleVal,
        values.pricingTemplateId || pricingTemplateId,
      ),
      totalSeconds: getFormDurationSeconds(
        values.startAtInput,
        values.endAtInput,
      ),
      actualAmount: values.actualAmount,
    })

    setIsEditOpen(false)
    setEditingOrderId('')

    if (shortTiered15State.shouldGrayOut) {
      message.warning(
        `这条订单${buildUnbilledHintText(shortTiered15State)}，当前会按未计费记录显示；如果老板付款了，请手动填写实际到手金额。`,
      )
      return
    }

    message.success('订单已更新')
  }

  const openQuickCalcModal = () => {
    const end = new Date()
    const start = new Date(end.getTime() - 60 * 60 * 1000)

    quickCalcForm.setFieldsValue({
      startAtInput: toPickerValue(start.toISOString()),
      endAtInput: toPickerValue(end.toISOString()),
      pricingTemplateId,
      hourRate: Number(hourRate || 0),
      billingRule,
      commissionMode,
      commissionValue: Number(commissionValue || 0),
      actualAmount: null,
      settlementStatus: 'unsettled',
    })
    setIsQuickCalcOpen(true)
  }

  const submitQuickCalc = async () => {
    const values = await quickCalcForm.validateFields()
    const startAt = pickerToIso(values.startAtInput)
    const endAt = pickerToIso(values.endAtInput)

    if (!startAt || !endAt) {
      message.error('开始时间和结束时间格式不正确')
      return
    }

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      message.error('结束时间必须晚于开始时间')
      return
    }

    const qcBillingRule = normalizeBillingRule(
      values.billingRule,
      pricingConfig.billingRule,
    )

    if (qcBillingRule !== 'perGame') {
      const validHourRate = ensureHourRate(
        values.hourRate,
        '快速补入前请填写单价，单价为必填项',
      )
      if (validHourRate === null) {
        return
      }
    }

    const newOrder = {
      id: `quick-${Date.now()}`,
      startAt,
      endAt,
      boss: '未填写',
      groupName: '',
      note: '未填写',
      hourRate:
        qcBillingRule === 'perGame' ? 0 : ensureHourRate(values.hourRate),
      pricingTemplateId: values.pricingTemplateId || pricingTemplateId,
      billingRule: qcBillingRule,
      billingSegments: buildBillingSegmentsSnapshot(
        qcBillingRule,
        values.pricingTemplateId || pricingTemplateId,
      ),
      commissionMode: normalizeCommissionMode(
        values.commissionMode,
        pricingConfig.commissionMode,
      ),
      commissionValue: Math.max(0, Number(values.commissionValue || 0)),
      actualAmount: normalizeOptionalActualAmount(values.actualAmount),
      settlementStatus: normalizeSettlementStatus(
        values.settlementStatus,
        'unsettled',
      ),
      settledAt:
        normalizeSettlementStatus(values.settlementStatus, 'unsettled') ===
        'settled'
          ? new Date().toISOString()
          : null,
      status: 'done',
      ...(qcBillingRule === 'perGame' && {
        gamePrice: Math.max(0, Number(values.gamePrice || 0)),
        gameCount: Math.max(1, Math.round(Number(values.gameCount || 1))),
      }),
    }

    const shortTiered15State = getShortTiered15State({
      billingRule: newOrder.billingRule,
      billingSegments: newOrder.billingSegments,
      totalSeconds: getOrderDurationSeconds(newOrder),
      actualAmount: newOrder.actualAmount,
    })

    setOrders((prev) => [newOrder, ...prev])
    setIsQuickCalcOpen(false)

    if (shortTiered15State.shouldGrayOut) {
      message.warning(
        `这条快速补入订单${buildUnbilledHintText(shortTiered15State)}，已按未计费记录保存；如果老板付款了，请手动填写实际到手金额。`,
      )
      return
    }

    message.success('已按时间快速补入订单，请在表格中继续编辑其他字段')
  }

  const columns = [
    {
      title: '计费状态',
      key: 'status',
      width: 86,
      render: (_, record) => {
        const shortState = getShortTiered15State({
          billingRule: record.billingRule,
          billingSegments: record.billingSegments,
          totalSeconds: getOrderDurationSeconds(record, nowMs),
          actualAmount: record.actualAmount,
        })

        if (!shortState.shouldGrayOut) {
          return (
            <span className="overview-order-status-pill is-normal">已计费</span>
          )
        }

        return (
          <Tooltip
            title={`${buildUnbilledHintText(shortState)}，默认不计费；如果老板付款了，请编辑并手动填写实际到手金额。`}
          >
            <span className="overview-order-status-pill is-muted">未计费</span>
          </Tooltip>
        )
      },
    },
    {
      title: '结算',
      key: 'settlementStatus',
      width: 82,
      render: (_, record) => {
        const settled = isOrderSettled(record)
        return (
          <Tooltip
            title={
              settled
                ? `已结算${record.settledAt ? `：${formatDateTime(record.settledAt)}` : ''}`
                : `未结算，已等待 ${getUnsettledAgeDays(record, nowMs, unsettledReminderMode)} 天`
            }
          >
            <span
              role="button"
              tabIndex={0}
              className={`${getSettlementStatusClass(record)} overview-settlement-clickable overview-row-interactive`}
              onClick={(event) => {
                event.stopPropagation()
                toggleOrderSettlementStatus(record.id)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggleOrderSettlementStatus(record.id)
                }
              }}
            >
              {getSettlementStatusLabel(record)}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '单价/结算/抽成',
      key: 'priceSummary',
      width: 180,
      render: (_, record) => {
        const isPerGame = record.billingRule === 'perGame'
        const settlementText = Number(
          getSettlementAmount(record, getOrderDurationSeconds(record, nowMs)),
        ).toFixed(2)
        const commissionText = Number(
          calcCommissionTotal(record, nowMs),
        ).toFixed(2)
        const netText = Number(calcNetAmount(record, nowMs)).toFixed(2)
        const pricing = getOrderPricingConfig(record)
        const hasActualNetOverride = hasManualActualAmount(record)
        const shortState = getShortTiered15State({
          billingRule: pricing.billingRule,
          billingSegments: pricing.billingSegments,
          totalSeconds: getOrderDurationSeconds(record, nowMs),
          actualAmount: record.actualAmount,
        })

        const compactPrice = isPerGame
          ? `${Number(record.gamePrice || 0)}×${record.gameCount || 0}`
          : formatTableMoneyInteger(record.hourRate)
        const compact = `${compactPrice}/${formatTableMoneyInteger(getSettlementAmount(record, getOrderDurationSeconds(record, nowMs)))}/${formatTableMoneyInteger(calcCommissionTotal(record, nowMs))}`

        const tooltipLabel = isPerGame
          ? `把价¥${Number(record.gamePrice || 0)} × ${record.gameCount || 0}把`
          : `单价¥${Number(record.hourRate || 0).toFixed(2)}`

        return (
          <Tooltip
            title={`${tooltipLabel} / 规则${getBillingRuleLabel(pricing.billingRule)} / ${getCommissionModeLabel(pricing.commissionMode)} ${pricing.commissionMode === 'fixed' ? `¥${Number(pricing.commissionValue || 0).toFixed(2)}/小时` : `${Number(pricing.commissionValue || 0).toFixed(2)}%`} / 结算¥${settlementText} / 抽成金额¥${commissionText} / ${hasActualNetOverride ? `实际到手¥${netText}` : `到手¥${netText}`}`}
          >
            <span
              className={`price-summary-text ${
                shortState.shouldGrayOut ? 'is-muted' : ''
              }`}
            >
              {compact}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '到手',
      key: 'actualAmount',
      width: 90,
      render: (_, record) => {
        const netAmount = Number(calcNetAmount(record, nowMs))
        const shortState = getShortTiered15State({
          billingRule: record.billingRule,
          billingSegments: record.billingSegments,
          totalSeconds: getOrderDurationSeconds(record, nowMs),
          actualAmount: record.actualAmount,
        })
        return (
          <Tooltip title={`¥ ${netAmount.toFixed(2)}`}>
            <span
              className={shortState.shouldGrayOut ? 'overview-muted-text' : ''}
            >{`¥ ${formatTableMoneyInteger(netAmount)}`}</span>
          </Tooltip>
        )
      },
    },
    {
      title: '老板',
      dataIndex: 'boss',
      key: 'boss',
      width: 92,
      ellipsis: true,
      render: (value) => {
        const text = value && value.trim() ? value : '--'
        return <Tooltip title={text}>{text}</Tooltip>
      },
    },
    {
      title: '接单群',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 100,
      ellipsis: true,
      render: (value) => {
        const text = value && value.trim() ? value : '--'
        return <Tooltip title={text}>{text}</Tooltip>
      },
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 136,
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="查看详情" placement="top">
            <Button
              type="text"
              size="small"
              className="action-icon-btn overview-row-interactive"
              icon={<EyeOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                openDetailModal(record)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
            />
          </Tooltip>
          <Tooltip title="复制报单" placement="top">
            <Button
              type="text"
              size="small"
              className="action-icon-btn overview-row-interactive"
              icon={<CopyOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                handleCopyReport(record)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
            />
          </Tooltip>
          <Tooltip title="编辑订单" placement="top">
            <Button
              type="text"
              size="small"
              className="action-icon-btn overview-row-interactive"
              icon={<EditOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                openEditModal(record)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
            />
          </Tooltip>
          <Tooltip
            title={isOrderSettled(record) ? '改为未结算' : '标记为已结算'}
            placement="top"
          >
            <Button
              type="text"
              size="small"
              className="action-icon-btn overview-row-interactive"
              icon={
                isOrderSettled(record) ? (
                  <RollbackOutlined />
                ) : (
                  <CheckCircleOutlined />
                )
              }
              onClick={(event) => {
                event.stopPropagation()
                toggleOrderSettlementStatus(record.id)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
            />
          </Tooltip>
          <Popconfirm
            title="删除该订单记录？"
            okText="删除"
            cancelText="取消"
            placement="topRight"
            onConfirm={() => deleteOrder(record.id)}
          >
            <Button
              type="text"
              size="small"
              danger
              className="action-icon-btn overview-row-interactive"
              icon={<DeleteOutlined />}
              onClick={(event) => {
                event.stopPropagation()
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <section className="overview-page">
      <div className="overview-stack">
        <div className="overview-hero">
          <div className="overview-hero-top">
            <h2>今日接单统计</h2>
            <div className="overview-hero-cta">
              <Tooltip title="一键复制最近一笔已完成订单的报单文本到剪贴板，粘贴即可发送">
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  className="overview-hero-btn is-copy"
                  onClick={handleCopyLatestReport}
                >
                  一键复制报单
                  <QuestionCircleOutlined className="overview-hero-btn-help" />
                </Button>
              </Tooltip>
              <Tooltip title="自定义报单模板字段、默认值和必填项，跳转到软件设置页配置">
                <Button
                  icon={<SettingOutlined />}
                  type="primary"
                  className="overview-hero-btn is-config is-highlight"
                  onClick={() =>
                    navigate('/system/app-settings?focus=report-template', {
                      state: {
                        slideFromRight: true,
                      },
                    })
                  }
                >
                  配置报单模板
                  <QuestionCircleOutlined className="overview-hero-btn-help" />
                </Button>
              </Tooltip>
            </div>
          </div>
          <div className="overview-hero-badges">
            <span className="overview-hero-badge is-key-orders">{`今日单数 ${todayOrders.length} 单`}</span>
            <span className="overview-hero-badge">{`时长 ${formatDuration(todayTotalSeconds)}`}</span>
            <span className="overview-hero-badge">{`预计 ¥${todayExpectedIncome.toFixed(2)}`}</span>
            <span className="overview-hero-badge is-spotlight">{`今日到手 ¥${todayActualIncome.toFixed(2)}`}</span>
            <span className="overview-hero-badge is-key-settled">{`今日已结 ${todaySettledCount} 单 ¥${todaySettledNetIncome.toFixed(2)}`}</span>
            <span className="overview-hero-badge is-key-unsettled">{`今日未结 ${todayUnsettledCount} 单 ¥${todayUnsettledNetIncome.toFixed(2)}`}</span>
            <span
              className={`overview-hero-badge ${
                activeOrder ? 'is-live' : 'is-muted'
              }`}
            >
              {activeOrder ? '本单计时中' : '当前待开始'}
            </span>
          </div>
          {shouldShowUnsettledReminder ? (
            <Alert
              showIcon
              type="warning"
              style={{ marginTop: 10 }}
              message={`有 ${overdueUnsettledOrders.length} 笔订单超过 ${unsettledReminderDays} 天未结算`}
              description={`提醒规则：${unsettledReminderMode === 'naturalDay' ? '按自然日' : '按24小时'}，仅在未结订单达到 ${unsettledReminderMinOrders} 笔时提示。建议去历史账单页按“未结算”快速核对。`}
            />
          ) : null}
        </div>

        <Card
          title={renderOverviewPanelTitle(<ClockCircleOutlined />, '快速计时')}
          extra={
            <span
              className={`overview-panel-status ${
                activeOrder ? 'is-live' : 'is-idle'
              }`}
            >
              {activeOrder ? '计时中' : '待开始'}
            </span>
          }
          size="small"
          className={`overview-timer-card ${activeOrder ? 'is-live' : 'is-idle'}`}
        >
          <Row gutter={[10, 8]} align="middle">
            <Col xs={24} md={7}>
              <Typography.Text className="overview-form-label">
                本单备注
              </Typography.Text>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：英雄联盟双排 / 三角洲陪跑"
                maxLength={40}
              />
            </Col>
            <Col xs={24} md={4}>
              <Typography.Text className="overview-form-label">
                老板(选填)
              </Typography.Text>
              <Input
                value={boss}
                onChange={(e) => setBoss(e.target.value)}
                placeholder="可不填"
                maxLength={20}
              />
            </Col>
            <Col xs={24} md={4}>
              <Typography.Text className="overview-form-label">
                接单群(选填)
              </Typography.Text>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="例如：QQ群A"
                maxLength={30}
              />
            </Col>
            <Col xs={24} md={4}>
              {billingRule === 'perGame' ? (
                <>
                  <Typography.Text className="overview-form-label">
                    把价(元/把)
                  </Typography.Text>
                  <InputNumber
                    value={gamePrice}
                    min={0}
                    step={5}
                    style={{ width: '100%' }}
                    placeholder="每把单价"
                    onChange={(value) => setGamePrice(Number(value || 0))}
                  />
                </>
              ) : (
                <>
                  <Typography.Text className="overview-form-label">
                    单价(元/小时)
                  </Typography.Text>
                  <InputNumber
                    value={hourRate}
                    min={0.01}
                    step={5}
                    style={{ width: '100%' }}
                    placeholder="必填"
                    onChange={(value) => setHourRate(Number(value || 0))}
                  />
                </>
              )}
            </Col>
            {billingRule === 'perGame' && (
              <Col xs={24} md={2}>
                <Typography.Text className="overview-form-label">
                  把数
                </Typography.Text>
                <InputNumber
                  value={gameCount}
                  min={1}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="几把"
                  onChange={(value) =>
                    setGameCount(Math.max(1, Math.round(Number(value || 1))))
                  }
                />
              </Col>
            )}
          </Row>

          <Space style={{ marginTop: 10, marginBottom: 6 }}>
            <Button
              type="primary"
              className={`overview-action-btn overview-action-btn-start ${
                activeOrder ? 'is-disabledish' : 'is-ready'
              }`}
              onClick={startOrder}
              disabled={Boolean(activeOrder)}
            >
              开始接单
            </Button>
            <Button
              danger
              className={`overview-action-btn overview-action-btn-stop ${
                activeOrder ? 'is-live' : 'is-disabledish'
              }`}
              onClick={endOrder}
              disabled={!activeOrder}
            >
              结束接单
            </Button>
            <Button onClick={openSupplementModal}>补录订单</Button>
            <Button
              type="primary"
              className="quick-calc-btn"
              onClick={openQuickCalcModal}
            >
              快速计算接单时间
            </Button>
            {activeOrder ? (
              <Tag color="red" className="overview-live-tag">
                正在计时
              </Tag>
            ) : (
              <Tag color="green" className="overview-live-tag is-idle">
                暂无进行中订单
              </Tag>
            )}
          </Space>

          {settlementFeedback ? (
            <div
              key={settlementFeedback.id}
              className={`overview-settlement-flash ${
                settlementFeedback.isShortTiered15Unbilled ? 'is-muted' : ''
              }`}
              onMouseEnter={() => {
                setSettlementFlashHovered(true)
                setSettlementFlashWasHovered(true)
              }}
              onMouseLeave={() => {
                setSettlementFlashHovered(false)
              }}
            >
              <span className="overview-settlement-flash-kicker">
                {settlementFeedback.isShortTiered15Unbilled
                  ? '本单未计费保存'
                  : '本单结算完成'}
              </span>
              <strong className="overview-settlement-flash-amount">
                <AnimatedNumber
                  value={settlementFeedback.netAmount}
                  decimals={2}
                  prefix="¥ "
                  duration={920}
                />
              </strong>
              <div className="overview-settlement-flash-meta">
                <span>{settlementFeedback.durationText}</span>
                <span>{`结算 ¥${settlementFeedback.settlementAmount.toFixed(2)}`}</span>
                <span>{`抽成 ¥${settlementFeedback.commissionAmount.toFixed(2)}`}</span>
                <span className="is-net">
                  {settlementFeedback.isShortTiered15Unbilled
                    ? '未计费，可后续删或补'
                    : '到手已入账'}
                </span>
              </div>
            </div>
          ) : null}

          <div className="overview-timer-bottom-layout">
            <div className="overview-timer-wait-panel">
              <Typography.Text
                type="secondary"
                className="overview-secondary-label"
              >
                {activeOrder ? '本单进行时长' : '等待开始'}
              </Typography.Text>
              <div
                className={`run-duration ${activeOrder ? 'is-live' : 'is-idle'}`}
              >
                <span className="run-duration-state">
                  {activeOrder ? '实时累计中' : '等待开始'}
                </span>
                <span className="run-duration-value">
                  {formatDuration(activeSeconds)}
                </span>
                {activeOrder ? (
                  <div className="run-duration-metrics">
                    <span>{`预计 ¥${activeOrderExpectedIncome.toFixed(2)}`}</span>
                    <span>{`抽成 ¥${activeOrderCommission.toFixed(2)}`}</span>
                    <span className="is-net">{`到手 ¥${activeOrderNetIncome.toFixed(2)}`}</span>
                  </div>
                ) : (
                  <span className="run-duration-hint">
                    开始接单后，这里会实时突出本单时长和到手金额。
                  </span>
                )}
              </div>
            </div>

            <div className="overview-secondary-fields">
              <Typography.Text
                type="secondary"
                className="overview-secondary-label"
              >
                计费设置
              </Typography.Text>
              <Row gutter={[8, 6]}>
                <Col xs={12} md={8}>
                  <Typography.Text className="overview-form-label-sm">
                    {renderFieldLabel('计费规则', BILLING_RULE_HELP)}
                  </Typography.Text>
                  <Select
                    size="small"
                    value={billingRule}
                    options={BILLING_RULE_OPTIONS}
                    onChange={setBillingRule}
                    popupMatchSelectWidth={320}
                  />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text className="overview-form-label-sm">
                    {renderFieldLabel('抽成方式', COMMISSION_MODE_HELP)}
                  </Typography.Text>
                  <Select
                    size="small"
                    value={commissionMode}
                    options={COMMISSION_MODE_OPTIONS}
                    onChange={setCommissionMode}
                    popupMatchSelectWidth={320}
                  />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text className="overview-form-label-sm">
                    {renderFieldLabel(
                      commissionMode === 'fixed'
                        ? '每小时抽成(元)'
                        : '抽成比例(%)',
                      COMMISSION_VALUE_HELP,
                    )}
                  </Typography.Text>
                  <InputNumber
                    size="small"
                    value={commissionValue}
                    min={0}
                    step={commissionMode === 'fixed' ? 1 : 5}
                    style={{ width: '100%' }}
                    onChange={(value) => setCommissionValue(Number(value || 0))}
                  />
                </Col>
                <Col xs={12} md={16}>
                  <Typography.Text className="overview-form-label-sm">
                    {renderFieldLabel(
                      '实际到手(选填)',
                      '如果这单最终到手和系统计算结果不一致，可以手动填写实际收到的金额；填写后，到手金额将优先按这里显示。',
                    )}
                  </Typography.Text>
                  <InputNumber
                    size="small"
                    value={
                      activeOrder ? (activeOrder.actualAmount ?? null) : null
                    }
                    min={0}
                    step={1}
                    disabled={!activeOrder}
                    style={{ width: '100%' }}
                    placeholder={activeOrder ? '可手动修正' : '接单后可填'}
                    onChange={(value) => {
                      if (!activeOrder) {
                        return
                      }
                      setActiveOrder((prev) => {
                        if (!prev) {
                          return prev
                        }
                        return {
                          ...prev,
                          actualAmount: normalizeOptionalActualAmount(value),
                        }
                      })
                    }}
                  />
                </Col>
              </Row>
              {activeOrder && activeShortTiered15State.belowMinimum ? (
                <div style={{ marginTop: 4 }}>
                  {renderShortTiered15Notice({
                    totalSeconds: activeSeconds,
                    billingRule: activeOrder.billingRule,
                    billingSegments: activeOrder.billingSegments,
                    actualAmount: activeOrder.actualAmount,
                    context: 'active',
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card
          title={renderOverviewPanelTitle(<FileTextOutlined />, '今日订单明细')}
          extra={
            <span className="overview-panel-status is-neutral">
              {`${todayOrders.length} 单`}
            </span>
          }
          className="overview-orders-card overview-surface-card"
          size="small"
        >
          {todayOrders.length === 0 ? (
            <div className="overview-orders-empty-state">
              <Empty description="今天还没有订单记录" />
            </div>
          ) : (
            <div className="overview-orders-table">
              <Table
                size="small"
                rowKey="id"
                columns={columns}
                dataSource={todayOrders}
                rowClassName={(record) => {
                  const shortState = getShortTiered15State({
                    billingRule: record.billingRule,
                    billingSegments: record.billingSegments,
                    totalSeconds: getOrderDurationSeconds(record, nowMs),
                    actualAmount: record.actualAmount,
                  })

                  return shortState.shouldGrayOut
                    ? 'overview-order-row-muted'
                    : ''
                }}
                onRow={(record) => ({
                  onDoubleClick: (event) => {
                    const target = event.target
                    if (
                      target instanceof HTMLElement &&
                      target.closest('.overview-row-interactive')
                    ) {
                      return
                    }
                    openDetailModal(record)
                  },
                })}
                pagination={{
                  pageSize: 8,
                  showSizeChanger: false,
                  hideOnSinglePage: true,
                }}
              />
            </div>
          )}
        </Card>

        {showDailyEncouragement ? (
          <Card
            title={renderOverviewPanelTitle(<BulbOutlined />, '今日打气')}
            extra={
              <span className="overview-panel-status is-accent">
                {hourlyEncouragement.periodLabel}
              </span>
            }
            className="overview-encourage-card overview-surface-card"
            size="small"
          >
            <div className="overview-encourage-panel">
              <div
                className={`overview-encourage-block is-${hourlyEncouragement.period}`}
              >
                <div className="overview-encourage-meta">
                  <span className="overview-encourage-kicker">
                    {hourlyEncouragement.title}
                  </span>
                  <span className="overview-encourage-period">
                    {hourlyEncouragement.periodLabel}
                  </span>
                </div>
                <Typography.Text className="overview-encourage-subcopy">
                  {hourlyEncouragement.message}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {hourlyEncouragement.footer}
                </Typography.Text>
              </div>

              <div
                key={dailyReflection.key}
                className="overview-daily-quote-card"
              >
                <span className="overview-daily-quote-kicker">
                  {dailyReflection.title}
                </span>
                <blockquote>{dailyReflection.quote}</blockquote>
                <Typography.Text type="secondary">
                  {dailyReflection.note}
                </Typography.Text>
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      <Modal
        title="补录订单"
        open={isSupplementOpen}
        okText="保存补录"
        cancelText="取消"
        width={660}
        className="supplement-order-modal"
        onCancel={() => setIsSupplementOpen(false)}
        onOk={submitSupplement}
      >
        <Form
          layout="vertical"
          form={supplementForm}
          className="compact-order-form compact-order-form-tight"
        >
          <Form.Item
            label="开始时间"
            name="startAtInput"
            rules={[{ required: true, message: '请输入开始时间' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder="选择开始时间"
            />
          </Form.Item>
          <Form.Item
            label="结束时间"
            name="endAtInput"
            rules={[{ required: true, message: '请输入结束时间' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder="选择结束时间"
            />
          </Form.Item>
          {supplementBillingRule === 'perGame' ? (
            <>
              <Form.Item
                label="把价(元/把)"
                name="gamePrice"
                rules={[{ required: true, message: '请填写把价' }]}
              >
                <InputNumber min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="把数"
                name="gameCount"
                rules={[{ required: true, message: '请填写把数' }]}
              >
                <InputNumber min={1} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              label="单价(元/小时)"
              name="hourRate"
              rules={[{ required: true, message: '请填写单价' }]}
            >
              <InputNumber min={0.01} step={5} style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Form.Item
            label={renderFieldLabel('计费规则', BILLING_RULE_HELP)}
            name="billingRule"
          >
            <Select
              options={BILLING_RULE_OPTIONS}
              popupMatchSelectWidth={320}
            />
          </Form.Item>
          <Form.Item
            label={renderFieldLabel('抽成方式', COMMISSION_MODE_HELP)}
            name="commissionMode"
          >
            <Select
              options={COMMISSION_MODE_OPTIONS}
              popupMatchSelectWidth={320}
            />
          </Form.Item>
          <Form.Item
            label={renderFieldLabel('抽成数值', COMMISSION_VALUE_HELP)}
            name="commissionValue"
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="老板(选填)" name="boss">
            <Input maxLength={20} placeholder="例如：张总" />
          </Form.Item>
          <Form.Item label="接单群(选填)" name="groupName">
            <Input maxLength={30} placeholder="例如：某某车队群" />
          </Form.Item>
          <Form.Item label="结算状态" name="settlementStatus">
            <Select
              options={[
                { value: 'unsettled', label: '未结算' },
                { value: 'settled', label: '已结算' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label={renderFieldLabel(
              '实际到手(选填)',
              '如果实际收到的金额和系统计算出的到手金额不一致，可以直接手动填写实际到手金额。',
            )}
            name="actualAmount"
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="备注"
            name="note"
            className="compact-order-form-span-2"
          >
            <Input maxLength={40} placeholder="例如：忘记点击计时，手动补录" />
          </Form.Item>
          {renderShortTiered15Notice({
            totalSeconds: supplementSeconds,
            billingRule: supplementBillingRule,
            billingSegments: supplementBillingSegments,
            actualAmount: supplementActualAmount,
            context: 'supplement',
          })}
        </Form>
      </Modal>

      <Modal
        title="编辑订单"
        open={isEditOpen}
        okText="保存修改"
        cancelText="取消"
        width={720}
        className="edit-order-modal"
        onCancel={() => {
          setIsEditOpen(false)
          setEditingOrderId('')
        }}
        onOk={submitEditOrder}
      >
        <Form layout="vertical" form={editForm} className="compact-order-form">
          <Form.Item
            label="开始时间"
            name="startAtInput"
            rules={[{ required: true, message: '请输入开始时间' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder="选择开始时间"
            />
          </Form.Item>
          <Form.Item
            label="结束时间"
            name="endAtInput"
            rules={[{ required: true, message: '请输入结束时间' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder="选择结束时间"
            />
          </Form.Item>
          {editBillingRule === 'perGame' ? (
            <>
              <Form.Item
                label="把价(元/把)"
                name="gamePrice"
                rules={[{ required: true, message: '请填写把价' }]}
              >
                <InputNumber min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="把数"
                name="gameCount"
                rules={[{ required: true, message: '请填写把数' }]}
              >
                <InputNumber min={1} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              label="单价(元/小时)"
              name="hourRate"
              rules={[{ required: true, message: '请填写单价' }]}
            >
              <InputNumber min={0.01} step={5} style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Form.Item
            label={renderFieldLabel('计费规则', BILLING_RULE_HELP)}
            name="billingRule"
          >
            <Select
              options={BILLING_RULE_OPTIONS}
              popupMatchSelectWidth={320}
            />
          </Form.Item>
          <Form.Item
            label={renderFieldLabel('抽成方式', COMMISSION_MODE_HELP)}
            name="commissionMode"
          >
            <Select
              options={COMMISSION_MODE_OPTIONS}
              popupMatchSelectWidth={320}
            />
          </Form.Item>
          <Form.Item
            label={renderFieldLabel('抽成数值', COMMISSION_VALUE_HELP)}
            name="commissionValue"
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="老板(选填)" name="boss">
            <Input maxLength={20} placeholder="例如：张总" />
          </Form.Item>
          <Form.Item label="接单群(选填)" name="groupName">
            <Input maxLength={30} placeholder="例如：某某车队群" />
          </Form.Item>
          <Form.Item label="结算状态" name="settlementStatus">
            <Select
              options={[
                { value: 'unsettled', label: '未结算' },
                { value: 'settled', label: '已结算' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label={renderFieldLabel(
              '实际到手(选填)',
              '如果实际收到的金额和系统计算出的到手金额不一致，可以直接手动填写实际到手金额。',
            )}
            name="actualAmount"
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="备注"
            name="note"
            className="compact-order-form-span-2"
          >
            <Input maxLength={40} />
          </Form.Item>
          {renderShortTiered15Notice({
            totalSeconds: editSeconds,
            billingRule: editBillingRule,
            billingSegments: editBillingSegments,
            actualAmount: editActualAmount,
            context: 'edit',
          })}
        </Form>
      </Modal>

      <Modal
        title="快速计算接单时间"
        open={isQuickCalcOpen}
        okText="确认补入"
        cancelText="取消"
        width={660}
        className="quick-calc-modal"
        onCancel={() => setIsQuickCalcOpen(false)}
        onOk={submitQuickCalc}
      >
        <Form
          layout="vertical"
          form={quickCalcForm}
          className="compact-order-form compact-order-form-tight"
        >
          <Form.Item
            label="开始时间"
            name="startAtInput"
            rules={[{ required: true, message: '请选择开始时间' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder="选择开始时间"
            />
          </Form.Item>
          <Form.Item
            label="结束时间"
            name="endAtInput"
            rules={[{ required: true, message: '请选择结束时间' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder="选择结束时间"
            />
          </Form.Item>
          {quickCalcBillingRule === 'perGame' ? (
            <>
              <Form.Item
                label="把价(元/把)"
                name="gamePrice"
                rules={[{ required: true, message: '请填写把价' }]}
              >
                <InputNumber min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="把数"
                name="gameCount"
                rules={[{ required: true, message: '请填写把数' }]}
              >
                <InputNumber min={1} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              label="单价(元/小时)"
              name="hourRate"
              rules={[{ required: true, message: '请填写单价' }]}
            >
              <InputNumber min={0.01} step={5} style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Form.Item
            label={renderFieldLabel('计费规则', BILLING_RULE_HELP)}
            name="billingRule"
          >
            <Select
              options={BILLING_RULE_OPTIONS}
              popupMatchSelectWidth={320}
            />
          </Form.Item>
          <Form.Item
            label={renderFieldLabel('抽成方式', COMMISSION_MODE_HELP)}
            name="commissionMode"
          >
            <Select
              options={COMMISSION_MODE_OPTIONS}
              popupMatchSelectWidth={320}
            />
          </Form.Item>
          <Form.Item
            label={renderFieldLabel('抽成数值', COMMISSION_VALUE_HELP)}
            name="commissionValue"
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={renderFieldLabel(
              '实际到手(选填)',
              '如果这单最终到手和系统计算结果不一致，可以直接填写实际收到的金额。',
            )}
            name="actualAmount"
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="结算状态" name="settlementStatus">
            <Select
              options={[
                { value: 'unsettled', label: '未结算' },
                { value: 'settled', label: '已结算' },
              ]}
            />
          </Form.Item>
          <div className="quick-calc-result compact-order-form-span-2">
            计算时长：
            {quickCalcSeconds > 0
              ? formatDuration(quickCalcSeconds)
              : '请选择开始和结束时间'}
          </div>
          {renderShortTiered15Notice({
            totalSeconds: quickCalcSeconds,
            billingRule: quickCalcBillingRule,
            billingSegments: quickCalcBillingSegments,
            actualAmount: quickCalcActualAmount,
            context: 'quick',
          })}
          <Typography.Text
            type="secondary"
            className="compact-order-form-span-2"
          >
            确认后将直接写入表格，老板/备注/金额等字段默认“未填写”，后续可编辑补全。
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title="订单详情"
        open={detailOpen}
        footer={null}
        width={760}
        onCancel={() => setDetailOpen(false)}
      >
        {detailOrder ? (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="开始时间" span={1}>
              {formatDateTime(detailOrder.startAt)}
            </Descriptions.Item>
            <Descriptions.Item label="结束时间" span={1}>
              {detailOrder.endAt ? formatDateTime(detailOrder.endAt) : '进行中'}
            </Descriptions.Item>
            <Descriptions.Item label="时长" span={1}>
              {formatDuration(getOrderDurationSeconds(detailOrder, nowMs))}
            </Descriptions.Item>
            <Descriptions.Item label="结算状态" span={1}>
              {isOrderSettled(detailOrder) ? '已结算' : '未结算'}
            </Descriptions.Item>
            <Descriptions.Item label="老板" span={1}>
              {detailOrder.boss || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="接单群" span={1}>
              {detailOrder.groupName || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="计费规则" span={1}>
              {getBillingRuleLabel(detailOrder.billingRule)}
            </Descriptions.Item>
            <Descriptions.Item label="抽成方式" span={1}>
              {getCommissionModeLabel(detailOrder.commissionMode)}
            </Descriptions.Item>
            <Descriptions.Item label="单价/把价" span={1}>
              {detailOrder.billingRule === 'perGame'
                ? `${Number(detailOrder.gamePrice || 0)} 元/把 × ${Number(
                    detailOrder.gameCount || 1,
                  )} 把`
                : `${Number(detailOrder.hourRate || 0).toFixed(2)} 元/小时`}
            </Descriptions.Item>
            <Descriptions.Item label="抽成数值" span={1}>
              {detailOrder.commissionMode === 'fixed'
                ? `${Number(detailOrder.commissionValue || 0).toFixed(2)} 元/小时`
                : `${Number(detailOrder.commissionValue || 0).toFixed(2)} %`}
            </Descriptions.Item>
            <Descriptions.Item label="结算金额" span={1}>
              {`¥ ${Number(
                getSettlementAmount(
                  detailOrder,
                  getOrderDurationSeconds(detailOrder, nowMs),
                ),
              ).toFixed(2)}`}
            </Descriptions.Item>
            <Descriptions.Item label="到手金额" span={1}>
              {`¥ ${Number(calcNetAmount(detailOrder, nowMs)).toFixed(2)}`}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              {detailOrder.note || '--'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </section>
  )
}

export default OverviewPage
