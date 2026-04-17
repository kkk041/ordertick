import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  DownloadOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  FileExcelOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { loadOrdersData, saveOrdersData } from '../../utils/orderStorage'
import {
  getNetAmount,
  hasManualActualAmount,
  isTiered15BelowMinimum,
} from '../../utils/pricing'
import './HistoryOrdersPage.css'

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

  const handleExport = () => {
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
    XLSX.writeFile(workbook, `历史订单-${Date.now()}.xlsx`)
    message.success('历史订单已导出')
  }

  const handleDownloadTemplate = () => {
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
    XLSX.writeFile(workbook, '历史订单导入模板.xlsx')
    message.success('导入模板已下载')
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
      render: (value) => {
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
      width: 72,
      render: (_, row) => (
        <Popconfirm
          title="删除这条历史订单？"
          okText="删除"
          cancelText="取消"
          onConfirm={() => handleDeleteOrder(row.id)}
        >
          <Tooltip title="删除订单">
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
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
            <Upload
              accept=".xlsx,.xls,.csv"
              showUploadList={false}
              beforeUpload={handleImport}
            >
              <Button icon={<UploadOutlined />}>导入 Excel</Button>
            </Upload>
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
    </section>
  )
}

export default HistoryOrdersPage
