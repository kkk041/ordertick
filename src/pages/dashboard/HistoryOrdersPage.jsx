import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileExcelOutlined,
  ReloadOutlined,
  RollbackOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import {
  loadOrdersData,
  saveOrdersData,
  getPricingConfig,
  loadReportTemplate,
  loadReportFields,
  generateReportText,
} from '../../utils/orderStorage'
import {
  applyPricingTemplate,
  BILLING_RULE_OPTIONS,
  COMMISSION_MODE_OPTIONS,
  getBillingRuleLabel,
  getPricingTemplateById,
  getUnbilledThresholdMinutes,
  getUnsettledAgeDays,
  getCommissionAmount,
  getNetAmount,
  getSettlementAmount,
  hasManualActualAmount,
  isOrderSettled,
  normalizeBillingRule,
  normalizeCommissionMode,
  normalizeSettlementStatus,
  shouldOrderTriggerUnsettledReminder,
  DEFAULT_PRICING_CONFIG,
} from '../../utils/pricing'
import './HistoryOrdersPage.css'

/** 保存 workbook：Electron 走 IPC 弹保存对话框，浏览器走 DOM 下载 */
async function saveWorkbook(workbook, defaultName) {
  const buf = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  if (window.appData?.saveFile) {
    const result = await window.appData.saveFile({
      defaultName,
      buffer: Array.from(new Uint8Array(buf)),
    })
    return !result.canceled
  }
  // 浏览器兜底
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(safeSeconds / 3600)
  const m = Math.floor((safeSeconds % 3600) / 60)
  const s = safeSeconds % 60
  return `${h}小时 ${m}分钟 ${s}秒`
}

function getOrderDurationSeconds(order) {
  const startMs = new Date(order.startAt).getTime()
  const endMs = order.endAt ? new Date(order.endAt).getTime() : Date.now()
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return 0
  }
  return Math.max(0, Math.floor((endMs - startMs) / 1000))
}

function formatTableMoneyInteger(value) {
  return Math.round(Number(value || 0))
}

function parseExcelDate(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      const dt = new Date(
        parsed.y,
        (parsed.m || 1) - 1,
        parsed.d || 1,
        parsed.H || 0,
        parsed.M || 0,
        Math.floor(parsed.S || 0),
      )
      return Number.isNaN(dt.getTime()) ? '' : dt.toISOString()
    }
  }

  const asDate = new Date(String(value))
  if (Number.isNaN(asDate.getTime())) {
    return ''
  }
  return asDate.toISOString()
}

function normalizeImportedOrder(
  row,
  idx,
  pricingConfig = DEFAULT_PRICING_CONFIG,
) {
  const startAt = parseExcelDate(row.startAt ?? row['开始时间'])
  const endAt = parseExcelDate(row.endAt ?? row['结束时间'])
  if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) {
    return null
  }

  const hourRateRaw = row.hourRate ?? row['单价(元/小时)'] ?? row['单价']
  const actualRaw = row.actualAmount ?? row['实际到手'] ?? row['实际金额']
  const noteRaw = row.note ?? row['备注']
  const bossRaw = row.boss ?? row['老板']
  const groupRaw = row.groupName ?? row['接单群']
  const settlementRaw = row.settlementStatus ?? row['结算状态']

  const hourRate = Number(hourRateRaw || 0)
  const actualAmount =
    actualRaw === '' || actualRaw === null || actualRaw === undefined
      ? null
      : Number(actualRaw)

  const template = getPricingTemplateById(
    pricingConfig,
    pricingConfig.pricingTemplateId,
    pricingConfig,
  )
  const withTemplate = applyPricingTemplate({}, template)
  const settlementStatusText = String(settlementRaw || '').trim()
  const settlementStatus =
    settlementStatusText === '已结算' || settlementStatusText === '已结'
      ? 'settled'
      : settlementStatusText === '未结算' || settlementStatusText === '未结'
        ? 'unsettled'
        : 'unsettled'

  return {
    id: `import-${Date.now()}-${idx}`,
    startAt,
    endAt,
    boss: String(bossRaw || '').trim(),
    groupName: String(groupRaw || '').trim(),
    note: String(noteRaw || '').trim() || '未填写',
    pricingTemplateId: withTemplate.pricingTemplateId,
    billingRule: withTemplate.billingRule,
    billingSegments: withTemplate.billingSegments,
    commissionMode: withTemplate.commissionMode,
    commissionValue: withTemplate.commissionValue,
    hourRate: Number.isFinite(hourRate) ? hourRate : 0,
    actualAmount:
      actualAmount === null || Number.isFinite(actualAmount)
        ? actualAmount
        : null,
    settlementStatus,
    settledAt: settlementStatus === 'settled' ? new Date().toISOString() : null,
    status: 'done',
  }
}

function formatOrderStatus(status) {
  if (status === 'running') {
    return '进行中'
  }
  if (status === 'done') {
    return '已完成'
  }
  return status || '已完成'
}

function getShortTiered15State(order) {
  const totalSeconds = getOrderDurationSeconds(order)
  const actualAmount = order?.actualAmount
  const thresholdMinutes = getUnbilledThresholdMinutes(
    order?.billingRule,
    order?.billingSegments,
  )
  const belowMinimum =
    thresholdMinutes > 0 &&
    Math.max(0, Number(totalSeconds || 0)) < thresholdMinutes * 60
  const hasManualActual =
    actualAmount !== null && actualAmount !== undefined && actualAmount !== ''

  return {
    thresholdMinutes,
    ruleLabel: getBillingRuleLabel(
      normalizeBillingRule(
        order?.billingRule,
        DEFAULT_PRICING_CONFIG.billingRule,
      ),
    ),
    shouldGrayOut: belowMinimum && !hasManualActual,
  }
}

function buildUnbilledHintText(state) {
  if (!state?.thresholdMinutes) {
    return '未达到计费阈值'
  }
  return `${state.ruleLabel}未满${state.thresholdMinutes}分钟`
}

function getDisplayedNetAmount(order) {
  return getNetAmount(order, getOrderDurationSeconds(order))
}

function toPickerValue(isoString) {
  if (!isoString) return null
  const d = dayjs(isoString)
  return d.isValid() ? d : null
}

function pickerToIso(dayjsValue) {
  if (!dayjsValue || !dayjsValue.isValid()) return ''
  return dayjsValue.toISOString()
}

function normalizeOptionalActualAmount(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null
}

function HistoryOrdersPage() {
  const [orders, setOrders] = useState([])
  const [activeOrder, setActiveOrder] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [pricingConfig, setPricingConfig] = useState(DEFAULT_PRICING_CONFIG)
  const [settlementFilter, setSettlementFilter] = useState('all')
  const [importPreviewOpen, setImportPreviewOpen] = useState(false)
  const [importPreviewRows, setImportPreviewRows] = useState([])
  const [importInvalidCount, setImportInvalidCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importSourceName, setImportSourceName] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [editOpen, setEditOpen] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState(null)
  const [editForm] = Form.useForm()
  const editBillingRule = Form.useWatch('billingRule', editForm)

  const refresh = async () => {
    setLoading(true)
    try {
      const [payload, config] = await Promise.all([
        loadOrdersData(),
        getPricingConfig(),
      ])
      const normalized = Array.isArray(payload.orders) ? payload.orders : []
      normalized.sort(
        (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
      )
      setOrders(normalized)
      setActiveOrder(payload.activeOrder || null)
      setPricingConfig(config)
      setSelectedRowKeys([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const filteredOrders = useMemo(() => {
    const key = keyword.trim().toLowerCase()
    return orders.filter((item) => {
      if (settlementFilter === 'settled' && !isOrderSettled(item)) {
        return false
      }
      if (settlementFilter === 'unsettled' && isOrderSettled(item)) {
        return false
      }

      if (!key) {
        return true
      }

      const text = [
        item.id,
        item.boss,
        item.groupName,
        item.note,
        item.status,
        formatDateTime(item.startAt),
        formatDateTime(item.endAt),
      ]
        .join(' ')
        .toLowerCase()
      return text.includes(key)
    })
  }, [orders, keyword, settlementFilter])

  const settledAmount = useMemo(() => {
    return filteredOrders.reduce((sum, item) => {
      if (!isOrderSettled(item)) {
        return sum
      }
      return sum + Number(getDisplayedNetAmount(item) || 0)
    }, 0)
  }, [filteredOrders])

  const unsettledAmount = useMemo(() => {
    return filteredOrders.reduce((sum, item) => {
      if (isOrderSettled(item)) {
        return sum
      }
      return sum + Number(getDisplayedNetAmount(item) || 0)
    }, 0)
  }, [filteredOrders])

  const settledCount = useMemo(() => {
    return filteredOrders.filter((item) => isOrderSettled(item)).length
  }, [filteredOrders])

  const unsettledCount = useMemo(() => {
    return filteredOrders.filter((item) => !isOrderSettled(item)).length
  }, [filteredOrders])

  const overdueUnsettledOrders = useMemo(() => {
    return filteredOrders.filter((item) =>
      shouldOrderTriggerUnsettledReminder(item, pricingConfig),
    )
  }, [filteredOrders, pricingConfig])

  const handleExport = async () => {
    if (filteredOrders.length === 0) {
      message.warning('当前没有可导出的订单数据')
      return
    }

    const exportRows = filteredOrders.map((item) => ({
      开始时间: formatDateTime(item.startAt),
      结束时间: formatDateTime(item.endAt),
      时长: formatDuration(getOrderDurationSeconds(item)),
      老板: item.boss || '未填写',
      接单群: item.groupName || '未填写',
      备注: item.note || '未填写',
      单价: Number(item.hourRate || 0),
      实际到手:
        item.actualAmount === null || item.actualAmount === undefined
          ? ''
          : Number(item.actualAmount || 0),
      结算状态: isOrderSettled(item) ? '已结算' : '未结算',
      状态: formatOrderStatus(item.status),
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '历史订单')
    const saved = await saveWorkbook(workbook, `历史订单-${Date.now()}.xlsx`)
    if (saved) message.success('历史订单已导出')
  }

  const handleDownloadTemplate = async () => {
    const templateRows = [
      {
        开始时间: '2026-04-15 14:00:00',
        结束时间: '2026-04-15 16:30:00',
        老板: '张总',
        接单群: '电竞群A',
        备注: '王者双排',
        单价: 40,
        实际到手: 90,
        结算状态: '未结算',
      },
    ]

    const noteRows = [
      { 字段: '开始时间', 说明: '必填，建议格式：YYYY-MM-DD HH:mm:ss' },
      { 字段: '结束时间', 说明: '必填，需晚于开始时间' },
      { 字段: '老板', 说明: '选填，空值会显示为未填写' },
      { 字段: '接单群', 说明: '选填，可记录是哪个群接单' },
      { 字段: '备注', 说明: '选填，空值会默认未填写' },
      { 字段: '单价', 说明: '选填，不填默认 0' },
      {
        字段: '实际到手',
        说明: '选填，可留空；如果填写，将按实际到手金额统计和展示',
      },
      {
        字段: '结算状态',
        说明: '选填，支持“已结算/未结算”，不填默认未结算',
      },
    ]

    const workbook = XLSX.utils.book_new()
    const templateSheet = XLSX.utils.json_to_sheet(templateRows)
    const noteSheet = XLSX.utils.json_to_sheet(noteRows)

    XLSX.utils.book_append_sheet(workbook, templateSheet, '模板')
    XLSX.utils.book_append_sheet(workbook, noteSheet, '说明')
    const saved = await saveWorkbook(workbook, '历史订单导入模板.xlsx')
    if (saved) message.success('导入模板已下载')
  }

  const handleImport = async (file) => {
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
      const firstSheet = workbook.SheetNames[0]
      if (!firstSheet) {
        message.error('未找到可读取的工作表')
        return false
      }

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
        defval: '',
      })

      if (!Array.isArray(rows) || rows.length === 0) {
        message.warning('导入文件为空')
        return false
      }

      const imported = rows
        .map((row, idx) => normalizeImportedOrder(row, idx, pricingConfig))
        .filter(Boolean)
      const invalidCount = rows.length - imported.length

      if (imported.length === 0) {
        message.error('未识别到有效订单，请检查列名或时间格式')
        return false
      }

      setImportPreviewRows(imported)
      setImportInvalidCount(invalidCount)
      setImportSourceName(file.name || '导入文件')
      setImportPreviewOpen(true)
    } catch {
      message.error('导入失败，请检查 Excel 文件格式')
    }

    return false
  }

  const handleImportClick = async () => {
    if (window.appData?.openFile) {
      try {
        const result = await window.appData.openFile()
        if (result.canceled) return
        const buf = new Uint8Array(result.buffer)
        const workbook = XLSX.read(buf, { type: 'array', cellDates: true })
        const firstSheet = workbook.SheetNames[0]
        if (!firstSheet) {
          message.error('未找到可读取的工作表')
          return
        }
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
          defval: '',
        })
        if (!Array.isArray(rows) || rows.length === 0) {
          message.warning('导入文件为空')
          return
        }
        const imported = rows
          .map((row, idx) => normalizeImportedOrder(row, idx, pricingConfig))
          .filter(Boolean)
        const invalidCount = rows.length - imported.length
        if (imported.length === 0) {
          message.error('未识别到有效订单，请检查列名或时间格式')
          return
        }
        setImportPreviewRows(imported)
        setImportInvalidCount(invalidCount)
        setImportSourceName(result.fileName || '导入文件')
        setImportPreviewOpen(true)
      } catch {
        message.error('导入失败，请检查 Excel 文件格式')
      }
    }
  }

  const closeImportPreview = () => {
    if (importing) {
      return
    }
    setImportPreviewOpen(false)
    setImportPreviewRows([])
    setImportInvalidCount(0)
    setImportSourceName('')
  }

  const persistOrders = async (nextOrders, successMessage) => {
    await saveOrdersData({
      orders: nextOrders,
      activeOrder,
    })

    setOrders(nextOrders)
    if (successMessage) {
      message.success(successMessage)
    }
  }

  const handleDeleteOrder = async (orderId) => {
    const nextOrders = orders.filter((item) => item.id !== orderId)
    await persistOrders(nextOrders, '订单已删除')
    setSelectedRowKeys((prev) => prev.filter((item) => item !== orderId))
  }

  const handleToggleSettlement = async (orderId) => {
    const targetOrder = orders.find((item) => item.id === orderId)
    const wasSettled = isOrderSettled(targetOrder || {})
    const nextOrders = orders.map((item) => {
      if (item.id !== orderId) {
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
    })

    await persistOrders(
      nextOrders,
      wasSettled ? '订单已改为未结算' : '订单已标记为已结算',
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

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的订单')
      return
    }

    const selectedKeySet = new Set(selectedRowKeys)
    const nextOrders = orders.filter((item) => !selectedKeySet.has(item.id))
    await persistOrders(nextOrders, `已删除 ${selectedRowKeys.length} 条订单`)
    setSelectedRowKeys([])
  }

  const handleBatchSetSettlement = async (targetStatus) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要标记的订单')
      return
    }

    const selectedSet = new Set(selectedRowKeys)
    const nextOrders = orders.map((item) => {
      if (!selectedSet.has(item.id)) {
        return item
      }

      return {
        ...item,
        settlementStatus: targetStatus,
        settledAt:
          targetStatus === 'settled'
            ? item.settledAt || new Date().toISOString()
            : null,
      }
    })

    await persistOrders(
      nextOrders,
      targetStatus === 'settled'
        ? `已批量标记 ${selectedRowKeys.length} 条为已结算`
        : `已批量标记 ${selectedRowKeys.length} 条为未结算`,
    )
    setSelectedRowKeys([])
  }

  const openEditModal = (record) => {
    setEditingOrderId(record.id)
    editForm.setFieldsValue({
      startAtInput: toPickerValue(record.startAt),
      endAtInput: toPickerValue(record.endAt),
      pricingTemplateId:
        record.pricingTemplateId || pricingConfig.pricingTemplateId,
      hourRate: Number(record.hourRate || 0),
      billingRule: normalizeBillingRule(record.billingRule, 'tiered15'),
      commissionMode: normalizeCommissionMode(
        record.commissionMode,
        'percentage',
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
    setEditOpen(true)
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
      'tiered15',
    )

    if (editBillingRuleVal !== 'perGame') {
      const hourRate = Number(values.hourRate)
      if (!Number.isFinite(hourRate) || hourRate <= 0) {
        message.warning('请填写有效的单价')
        return
      }
    }

    const editTemplate = getPricingTemplateById(
      pricingConfig,
      values.pricingTemplateId,
      pricingConfig,
    )
    const editPricingSnapshot = applyPricingTemplate({}, editTemplate)

    const nextOrders = orders.map((item) => {
      if (item.id !== editingOrderId) return item

      const settlementStatus = normalizeSettlementStatus(
        values.settlementStatus,
        item.settlementStatus,
      )

      return {
        ...item,
        startAt,
        endAt,
        boss: values.boss?.trim() || '',
        groupName: values.groupName?.trim() || '',
        hourRate:
          editBillingRuleVal === 'perGame' ? 0 : Number(values.hourRate),
        pricingTemplateId:
          values.pricingTemplateId || editPricingSnapshot.pricingTemplateId,
        billingRule: editBillingRuleVal || editPricingSnapshot.billingRule,
        billingSegments:
          editBillingRuleVal === 'customSegment'
            ? editPricingSnapshot.billingSegments
            : [],
        commissionMode: normalizeCommissionMode(
          values.commissionMode || editPricingSnapshot.commissionMode,
          editPricingSnapshot.commissionMode,
        ),
        commissionValue: Math.max(
          0,
          Number(
            values.commissionValue ?? editPricingSnapshot.commissionValue ?? 0,
          ),
        ),
        note: values.note?.trim() || '未备注',
        actualAmount: normalizeOptionalActualAmount(values.actualAmount),
        settlementStatus,
        settledAt:
          settlementStatus === 'settled'
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
    })

    await persistOrders(nextOrders)
    setEditOpen(false)
    setEditingOrderId('')

    const shortState = getShortTiered15State({
      startAt,
      endAt,
      billingRule: editBillingRuleVal,
      billingSegments:
        editBillingRuleVal === 'customSegment'
          ? editPricingSnapshot.billingSegments
          : [],
      actualAmount: normalizeOptionalActualAmount(values.actualAmount),
    })

    if (shortState.shouldGrayOut) {
      message.warning(
        `这条订单${buildUnbilledHintText(shortState)}，当前会按未计费记录显示；如果老板付款了，请手动填写实际到手金额。`,
      )
      return
    }

    message.success('订单已更新')
  }

  const confirmImportPreview = async () => {
    if (importPreviewRows.length === 0) {
      closeImportPreview()
      return
    }

    setImporting(true)
    try {
      const merged = [...importPreviewRows, ...orders].sort(
        (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
      )

      await saveOrdersData({
        orders: merged,
        activeOrder,
      })

      setOrders(merged)
      message.success(`导入成功，新增 ${importPreviewRows.length} 条订单`)
      closeImportPreview()
    } catch {
      message.error('导入失败，请稍后重试')
    } finally {
      setImporting(false)
    }
  }

  const baseColumns = [
    {
      title: '状态',
      key: 'billingStatus',
      width: 88,
      responsive: ['sm'],
      render: (_, row) => {
        const shortState = getShortTiered15State(row)

        if (!shortState.shouldGrayOut) {
          return (
            <span className="history-order-status-pill is-normal">已计费</span>
          )
        }

        return (
          <Tooltip
            title={`${buildUnbilledHintText(shortState)}，默认不计费；如果老板付款了，请编辑或导入实际到手金额。`}
          >
            <span className="history-order-status-pill is-muted">未计费</span>
          </Tooltip>
        )
      },
    },
    {
      title: '结算',
      key: 'settlementStatus',
      width: 88,
      render: (_, row) => {
        const settled = isOrderSettled(row)
        return (
          <Tooltip
            title={
              settled
                ? `已结算${row.settledAt ? `：${formatDateTime(row.settledAt)}` : ''}`
                : `未结算，已等待 ${getUnsettledAgeDays(
                    row,
                    Date.now(),
                    pricingConfig.unsettledReminderMode,
                  )} 天`
            }
          >
            <span
              role="button"
              tabIndex={0}
              className={`history-order-status-pill history-settlement-clickable ${
                settled ? 'is-settled' : 'is-unsettled'
              }`}
              onClick={(event) => {
                event.stopPropagation()
                handleToggleSettlement(row.id)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleToggleSettlement(row.id)
                }
              }}
            >
              {settled ? '已结' : '未结'}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '老板',
      dataIndex: 'boss',
      key: 'boss',
      width: 96,
      render: (value) => (value && value.trim() ? value : '未填写'),
    },
    {
      title: '接单群',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 108,
      responsive: ['md'],
      render: (value) => (value && value.trim() ? value : '未填写'),
    },
    {
      title: '单价',
      dataIndex: 'hourRate',
      key: 'hourRate',
      width: 90,
      responsive: ['sm'],
      render: (value, row) => {
        if (row.billingRule === 'perGame') {
          const text = `${Number(row.gamePrice || 0)}×${row.gameCount || 0}把`
          return (
            <Tooltip title={text}>
              <span>{text}</span>
            </Tooltip>
          )
        }
        const amount = Number(value || 0)
        return (
          <Tooltip title={`¥ ${amount.toFixed(2)}`}>
            <span>{formatTableMoneyInteger(amount)}</span>
          </Tooltip>
        )
      },
    },
    {
      title: '实际到手',
      dataIndex: 'actualAmount',
      key: 'actualAmount',
      width: 92,
      render: (_, row) => {
        const amount = Number(getDisplayedNetAmount(row))
        const shortState = getShortTiered15State(row)
        const label = hasManualActualAmount(row) ? '实际到手' : '到手'

        return (
          <Tooltip title={`${label} ¥ ${amount.toFixed(2)}`}>
            <span
              className={shortState.shouldGrayOut ? 'history-muted-text' : ''}
            >
              {formatTableMoneyInteger(amount)}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      responsive: ['lg'],
      ellipsis: true,
    },
  ]

  const columns = [
    ...baseColumns,
    {
      title: '操作',
      key: 'action',
      width: 148,
      render: (_, row) => (
        <Space size={0}>
          <Tooltip title="查看详情" placement="top">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                openDetailModal(row)
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
              icon={<CopyOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                handleCopyReport(row)
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
              icon={<EditOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                openEditModal(row)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
            />
          </Tooltip>
          <Tooltip
            title={isOrderSettled(row) ? '改为未结算' : '标记为已结算'}
            placement="top"
          >
            <Button
              type="text"
              size="small"
              icon={
                isOrderSettled(row) ? (
                  <RollbackOutlined />
                ) : (
                  <CheckCircleOutlined />
                )
              }
              onClick={(event) => {
                event.stopPropagation()
                handleToggleSettlement(row.id)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
            />
          </Tooltip>
          <Popconfirm
            title="删除这条历史订单？"
            okText="删除"
            cancelText="取消"
            placement="topRight"
            onConfirm={() => handleDeleteOrder(row.id)}
          >
            <Button
              type="text"
              danger
              size="small"
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
    <section className="history-page">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div className="history-hero">
          <div>
            <h2>历史订单</h2>
            <Typography.Text type="secondary">
              读取数据路径中的全部订单，支持关键词查询与 Excel 导入导出。
            </Typography.Text>
          </div>
          <div className="history-hero-badges">
            <span className="history-hero-badge is-total">{`总订单 ${orders.length} 条`}</span>
            <span className="history-hero-badge is-filter">{`当前筛选 ${filteredOrders.length} 条`}</span>
            <span className="history-hero-badge is-settled">{`已结 ${settledCount} 条 · 到手 ¥${settledAmount.toFixed(2)}`}</span>
            <span className="history-hero-badge is-unsettled">{`未结 ${unsettledCount} 条 · 到手 ¥${unsettledAmount.toFixed(2)}`}</span>
            <span>
              {keyword ? `关键词：${keyword}` : '支持老板 / 备注 / 时间检索'}
            </span>
            {pricingConfig.unsettledReminderEnabled ? (
              <span className="history-hero-badge is-alert">{`超期未结 ${overdueUnsettledOrders.length} 笔`}</span>
            ) : null}
          </div>
        </div>

        <Card size="small" className="history-toolbar-card">
          <Space wrap className="history-toolbar">
            <Input.Search
              allowClear
              placeholder="搜索老板/备注/时间"
              style={{ width: 280 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Select
              value={settlementFilter}
              style={{ width: 140 }}
              onChange={setSettlementFilter}
              options={[
                { value: 'all', label: '全部结算状态' },
                { value: 'settled', label: '仅已结算' },
                { value: 'unsettled', label: '仅未结算' },
              ]}
              popupMatchSelectWidth={240}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={refresh}
              loading={loading}
            >
              刷新
            </Button>
            {window.appData?.openFile ? (
              <Button icon={<UploadOutlined />} onClick={handleImportClick}>
                导入 Excel
              </Button>
            ) : (
              <Upload
                accept=".xlsx,.xls,.csv"
                showUploadList={false}
                beforeUpload={handleImport}
              >
                <Button icon={<UploadOutlined />}>导入 Excel</Button>
              </Upload>
            )}
            <Button
              icon={<FileExcelOutlined />}
              onClick={handleDownloadTemplate}
            >
              下载导入模板
            </Button>
            <Button
              icon={<DownloadOutlined />}
              type="primary"
              onClick={handleExport}
            >
              导出 Excel
            </Button>
            <Popconfirm
              title={`删除选中的 ${selectedRowKeys.length} 条历史订单？`}
              okText="删除"
              cancelText="取消"
              onConfirm={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={selectedRowKeys.length === 0}
              >
                {selectedRowKeys.length > 0
                  ? `批量删除(${selectedRowKeys.length})`
                  : '批量删除'}
              </Button>
            </Popconfirm>
            <Button
              disabled={selectedRowKeys.length === 0}
              onClick={() => handleBatchSetSettlement('settled')}
            >
              {selectedRowKeys.length > 0
                ? `批量改已结(${selectedRowKeys.length})`
                : '批量改已结'}
            </Button>
            <Button
              disabled={selectedRowKeys.length === 0}
              onClick={() => handleBatchSetSettlement('unsettled')}
            >
              {selectedRowKeys.length > 0
                ? `批量改未结(${selectedRowKeys.length})`
                : '批量改未结'}
            </Button>
            <Typography.Text type="secondary">
              共 {filteredOrders.length} 条
            </Typography.Text>
          </Space>
        </Card>

        <Card size="small" className="history-table-card">
          {pricingConfig.unsettledReminderEnabled &&
          overdueUnsettledOrders.length >=
            Number(pricingConfig.unsettledReminderMinOrders || 1) ? (
            <div style={{ marginBottom: 10 }}>
              <Typography.Text type="warning">
                {`提醒：当前有 ${overdueUnsettledOrders.length} 条未结订单已超过 ${pricingConfig.unsettledReminderDays} 天（${
                  pricingConfig.unsettledReminderMode === 'elapsed24h'
                    ? '按24小时'
                    : '按自然日'
                }）`}
              </Typography.Text>
            </div>
          ) : null}
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            columns={columns}
            dataSource={filteredOrders}
            rowClassName={(row) =>
              getShortTiered15State(row).shouldGrayOut
                ? 'history-order-row-muted'
                : ''
            }
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            onRow={(record) => ({
              onDoubleClick: (event) => {
                const target = event.target
                if (
                  target instanceof HTMLElement &&
                  (target.closest('.history-settlement-clickable') ||
                    target.closest('.ant-btn') ||
                    target.closest('.ant-popover'))
                ) {
                  return
                }
                openDetailModal(record)
              },
            })}
            pagination={{
              pageSize: 12,
              showSizeChanger: false,
            }}
          />
        </Card>
      </Space>

      <Modal
        title="导入预览"
        open={importPreviewOpen}
        okText="确认导入"
        cancelText="取消"
        onCancel={closeImportPreview}
        onOk={confirmImportPreview}
        confirmLoading={importing}
        width={980}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Typography.Text>
            文件：{importSourceName || '导入文件'}
          </Typography.Text>
          <Typography.Text>
            可导入 {importPreviewRows.length} 条
            {importInvalidCount > 0
              ? `，已忽略 ${importInvalidCount} 条无效记录`
              : ''}
          </Typography.Text>
          <Table
            rowKey="id"
            size="small"
            columns={baseColumns}
            dataSource={importPreviewRows}
            rowClassName={(row) =>
              getShortTiered15State(row).shouldGrayOut
                ? 'history-order-row-muted'
                : ''
            }
            onRow={(record) => ({
              onDoubleClick: (event) => {
                const target = event.target
                if (
                  target instanceof HTMLElement &&
                  (target.closest('.history-settlement-clickable') ||
                    target.closest('.ant-btn') ||
                    target.closest('.ant-popover'))
                ) {
                  return
                }
                openDetailModal(record)
              },
            })}
            pagination={{ pageSize: 6, showSizeChanger: false }}
          />
        </Space>
      </Modal>

      <Modal
        title="订单详情"
        open={detailOpen}
        footer={null}
        onCancel={() => setDetailOpen(false)}
        width={760}
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
              {formatDuration(getOrderDurationSeconds(detailOrder))}
            </Descriptions.Item>
            <Descriptions.Item label="结算状态" span={1}>
              {isOrderSettled(detailOrder) ? '已结算' : '未结算'}
            </Descriptions.Item>
            <Descriptions.Item label="老板" span={1}>
              {detailOrder.boss || '未填写'}
            </Descriptions.Item>
            <Descriptions.Item label="接单群" span={1}>
              {detailOrder.groupName || '未填写'}
            </Descriptions.Item>
            <Descriptions.Item label="计费规则" span={1}>
              {normalizeBillingRule(detailOrder.billingRule, 'tiered15') ===
              'perGame'
                ? '按把计费'
                : normalizeBillingRule(detailOrder.billingRule, 'tiered15') ===
                    'minutes'
                  ? '分钟制'
                  : '15分钟制'}
            </Descriptions.Item>
            <Descriptions.Item label="抽成方式" span={1}>
              {normalizeCommissionMode(
                detailOrder.commissionMode,
                'percentage',
              ) === 'fixed'
                ? '按小时固定抽成'
                : '按比例抽成'}
            </Descriptions.Item>
            <Descriptions.Item label="单价/把价" span={1}>
              {normalizeBillingRule(detailOrder.billingRule, 'tiered15') ===
              'perGame'
                ? `${Number(detailOrder.gamePrice || 0)} 元/把 × ${Number(
                    detailOrder.gameCount || 1,
                  )} 把`
                : `${Number(detailOrder.hourRate || 0).toFixed(2)} 元/小时`}
            </Descriptions.Item>
            <Descriptions.Item label="抽成数值" span={1}>
              {normalizeCommissionMode(
                detailOrder.commissionMode,
                'percentage',
              ) === 'fixed'
                ? `${Number(detailOrder.commissionValue || 0).toFixed(2)} 元/小时`
                : `${Number(detailOrder.commissionValue || 0).toFixed(2)} %`}
            </Descriptions.Item>
            <Descriptions.Item label="结算金额" span={1}>
              {`¥ ${Number(
                getSettlementAmount(
                  detailOrder,
                  getOrderDurationSeconds(detailOrder),
                ),
              ).toFixed(2)}`}
            </Descriptions.Item>
            <Descriptions.Item label="到手金额" span={1}>
              {`¥ ${Number(getDisplayedNetAmount(detailOrder)).toFixed(2)}`}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              {detailOrder.note || '未填写'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>

      <Modal
        title="编辑订单"
        open={editOpen}
        okText="保存修改"
        cancelText="取消"
        width={720}
        onCancel={() => {
          setEditOpen(false)
          setEditingOrderId('')
        }}
        onOk={submitEditOrder}
      >
        <Form
          layout="vertical"
          form={editForm}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0 16px',
          }}
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
          <Form.Item label="计费规则" name="billingRule">
            <Select
              options={BILLING_RULE_OPTIONS}
              popupMatchSelectWidth={320}
            />
          </Form.Item>
          <Form.Item label="抽成方式" name="commissionMode">
            <Select
              options={COMMISSION_MODE_OPTIONS}
              popupMatchSelectWidth={320}
            />
          </Form.Item>
          <Form.Item label="抽成数值" name="commissionValue">
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="老板(选填)" name="boss">
            <Input maxLength={20} placeholder="例如：张总" />
          </Form.Item>
          <Form.Item label="接单群(选填)" name="groupName">
            <Input maxLength={30} placeholder="例如：某某接单群" />
          </Form.Item>
          <Form.Item label="结算状态" name="settlementStatus">
            <Select
              options={[
                { value: 'unsettled', label: '未结算' },
                { value: 'settled', label: '已结算' },
              ]}
            />
          </Form.Item>
          <Form.Item label="实际到手(选填)" name="actualAmount">
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="备注" name="note" style={{ gridColumn: '1 / -1' }}>
            <Input maxLength={40} />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  )
}

export default HistoryOrdersPage
