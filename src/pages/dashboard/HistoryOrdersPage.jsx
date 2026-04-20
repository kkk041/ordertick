import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  DatePicker,
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
  CopyOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileExcelOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import {
  loadOrdersData,
  saveOrdersData,
  loadReportTemplate,
  loadReportFields,
  generateReportText,
} from '../../utils/orderStorage'
import {
  BILLING_RULE_OPTIONS,
  COMMISSION_MODE_OPTIONS,
  getCommissionAmount,
  getNetAmount,
  getSettlementAmount,
  hasManualActualAmount,
  isTiered15BelowMinimum,
  normalizeBillingRule,
  normalizeCommissionMode,
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

function normalizeImportedOrder(row, idx) {
  const startAt = parseExcelDate(row.startAt ?? row['开始时间'])
  const endAt = parseExcelDate(row.endAt ?? row['结束时间'])
  if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) {
    return null
  }

  const hourRateRaw = row.hourRate ?? row['单价(元/小时)'] ?? row['单价']
  const actualRaw = row.actualAmount ?? row['实际到手'] ?? row['实际金额']
  const noteRaw = row.note ?? row['备注']
  const bossRaw = row.boss ?? row['老板']

  const hourRate = Number(hourRateRaw || 0)
  const actualAmount =
    actualRaw === '' || actualRaw === null || actualRaw === undefined
      ? null
      : Number(actualRaw)

  return {
    id: `import-${Date.now()}-${idx}`,
    startAt,
    endAt,
    boss: String(bossRaw || '').trim(),
    note: String(noteRaw || '').trim() || '未填写',
    hourRate: Number.isFinite(hourRate) ? hourRate : 0,
    actualAmount:
      actualAmount === null || Number.isFinite(actualAmount)
        ? actualAmount
        : null,
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
  const belowMinimum = isTiered15BelowMinimum(totalSeconds, order?.billingRule)
  const hasManualActual =
    actualAmount !== null && actualAmount !== undefined && actualAmount !== ''

  return {
    shouldGrayOut: belowMinimum && !hasManualActual,
  }
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
  const [importPreviewOpen, setImportPreviewOpen] = useState(false)
  const [importPreviewRows, setImportPreviewRows] = useState([])
  const [importInvalidCount, setImportInvalidCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importSourceName, setImportSourceName] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [editOpen, setEditOpen] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState('')
  const [editForm] = Form.useForm()
  const editBillingRule = Form.useWatch('billingRule', editForm)

  const refresh = async () => {
    setLoading(true)
    try {
      const payload = await loadOrdersData()
      const normalized = Array.isArray(payload.orders) ? payload.orders : []
      normalized.sort(
        (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
      )
      setOrders(normalized)
      setActiveOrder(payload.activeOrder || null)
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
    if (!key) {
      return orders
    }

    return orders.filter((item) => {
      const text = [
        item.id,
        item.boss,
        item.note,
        item.status,
        formatDateTime(item.startAt),
        formatDateTime(item.endAt),
      ]
        .join(' ')
        .toLowerCase()
      return text.includes(key)
    })
  }, [orders, keyword])

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
      备注: item.note || '未填写',
      单价: Number(item.hourRate || 0),
      实际到手:
        item.actualAmount === null || item.actualAmount === undefined
          ? ''
          : Number(item.actualAmount || 0),
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
        备注: '王者双排',
        单价: 40,
        实际到手: 90,
      },
    ]

    const noteRows = [
      { 字段: '开始时间', 说明: '必填，建议格式：YYYY-MM-DD HH:mm:ss' },
      { 字段: '结束时间', 说明: '必填，需晚于开始时间' },
      { 字段: '老板', 说明: '选填，空值会显示为未填写' },
      { 字段: '备注', 说明: '选填，空值会默认未填写' },
      { 字段: '单价', 说明: '选填，不填默认 0' },
      {
        字段: '实际到手',
        说明: '选填，可留空；如果填写，将按实际到手金额统计和展示',
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
        .map((row, idx) => normalizeImportedOrder(row, idx))
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
          .map((row, idx) => normalizeImportedOrder(row, idx))
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

  const openEditModal = (record) => {
    setEditingOrderId(record.id)
    editForm.setFieldsValue({
      startAtInput: toPickerValue(record.startAt),
      endAtInput: toPickerValue(record.endAt),
      hourRate: Number(record.hourRate || 0),
      billingRule: normalizeBillingRule(record.billingRule, 'tiered15'),
      commissionMode: normalizeCommissionMode(
        record.commissionMode,
        'percentage',
      ),
      commissionValue: Number(record.commissionValue || 0),
      boss: record.boss || '',
      note: record.note || '',
      actualAmount: normalizeOptionalActualAmount(record.actualAmount),
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

    const nextOrders = orders.map((item) => {
      if (item.id !== editingOrderId) return item
      return {
        ...item,
        startAt,
        endAt,
        boss: values.boss?.trim() || '',
        hourRate:
          editBillingRuleVal === 'perGame' ? 0 : Number(values.hourRate),
        billingRule: editBillingRuleVal,
        commissionMode: normalizeCommissionMode(
          values.commissionMode,
          'percentage',
        ),
        commissionValue: Math.max(0, Number(values.commissionValue || 0)),
        note: values.note?.trim() || '未备注',
        actualAmount: normalizeOptionalActualAmount(values.actualAmount),
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

    const totalSeconds = Math.max(
      0,
      Math.floor(
        (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000,
      ),
    )
    const shortState = getShortTiered15State({
      startAt,
      endAt,
      billingRule: values.billingRule,
      actualAmount: normalizeOptionalActualAmount(values.actualAmount),
    })

    if (shortState.shouldGrayOut) {
      message.warning(
        '这条订单未满15分钟，当前会按未计费记录显示；如果老板付款了，请手动填写实际到手金额。',
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
      title: '开始时间',
      dataIndex: 'startAt',
      key: 'startAt',
      width: 180,
      render: (value, row) => {
        const shortState = getShortTiered15State(row)
        const timeNode = (
          <span className="history-start-time-text">
            {formatDateTime(value)}
          </span>
        )

        if (!shortState.shouldGrayOut) {
          return timeNode
        }

        return (
          <Tooltip title="未满15分钟，当前按未计费记录保留。">
            <span className="history-status-leading-icon">
              <ExclamationCircleOutlined />
              {timeNode}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '结束时间',
      dataIndex: 'endAt',
      key: 'endAt',
      width: 180,
      render: (value) => formatDateTime(value),
    },
    {
      title: '时长',
      key: 'duration',
      width: 150,
      render: (_, row) => {
        const shortState = getShortTiered15State(row)
        const durationNode = (
          <span
            className={shortState.shouldGrayOut ? 'history-muted-text' : ''}
          >
            {formatDuration(getOrderDurationSeconds(row))}
          </span>
        )

        if (!shortState.shouldGrayOut) {
          return durationNode
        }

        return (
          <Tooltip title="15分钟制未满15分钟默认不计费；如果老板付款了，请手动填写实际到手金额。">
            {durationNode}
          </Tooltip>
        )
      },
    },
    {
      title: '状态',
      key: 'billingStatus',
      width: 88,
      render: (_, row) => {
        const shortState = getShortTiered15State(row)

        if (!shortState.shouldGrayOut) {
          return (
            <span className="history-order-status-pill is-normal">已计费</span>
          )
        }

        return (
          <Tooltip title="未满15分钟，默认不计费；如果老板付款了，请编辑或导入实际到手金额。">
            <span className="history-order-status-pill is-muted">未计费</span>
          </Tooltip>
        )
      },
    },
    {
      title: '老板',
      dataIndex: 'boss',
      key: 'boss',
      width: 120,
      render: (value) => (value && value.trim() ? value : '未填写'),
    },
    {
      title: '单价',
      dataIndex: 'hourRate',
      key: 'hourRate',
      width: 90,
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
      width: 110,
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
      ellipsis: true,
    },
  ]

  const columns = [
    ...baseColumns,
    {
      title: '操作',
      key: 'action',
      width: 130,
      render: (_, row) => (
        <Space size={0}>
          <Tooltip title="复制报单">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopyReport(row)}
            />
          </Tooltip>
          <Tooltip title="编辑订单">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(row)}
            />
          </Tooltip>
          <Popconfirm
            title="删除这条历史订单？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => handleDeleteOrder(row.id)}
          >
            <Tooltip title="删除订单">
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
              />
            </Tooltip>
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
            <span>{`总订单 ${orders.length} 条`}</span>
            <span>{`当前筛选 ${filteredOrders.length} 条`}</span>
            <span>
              {keyword ? `关键词：${keyword}` : '支持老板 / 备注 / 时间检索'}
            </span>
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
            <Typography.Text type="secondary">
              共 {filteredOrders.length} 条
            </Typography.Text>
          </Space>
        </Card>

        <Card size="small" className="history-table-card">
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
            scroll={{ x: 980 }}
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
            pagination={{ pageSize: 6, showSizeChanger: false }}
            scroll={{ x: 980 }}
          />
        </Space>
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
            <Select options={BILLING_RULE_OPTIONS} />
          </Form.Item>
          <Form.Item label="抽成方式" name="commissionMode">
            <Select options={COMMISSION_MODE_OPTIONS} />
          </Form.Item>
          <Form.Item label="抽成数值" name="commissionValue">
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="老板(选填)" name="boss">
            <Input maxLength={20} placeholder="例如：张总" />
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
