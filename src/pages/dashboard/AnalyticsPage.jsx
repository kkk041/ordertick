import { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useNavigate } from 'react-router-dom'
import AnimatedNumber from '../../components/common/AnimatedNumber'
import { loadTheme } from '../../config/theme'
import useAnimatedSeries from '../../hooks/useAnimatedSeries'
import { loadOrdersData } from '../../utils/orderStorage'
import {
  buildIncomeSummary,
  formatPercent,
  formatDuration,
} from '../../utils/dashboardMetrics'
import './AnalyticsPage.css'

function hexToRgb(hex) {
  const safe = String(hex || '#1677ff').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(safe)) {
    return { r: 22, g: 119, b: 255 }
  }

  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  const toHex = (value) =>
    Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function mixHex(baseHex, targetHex, ratio) {
  const base = hexToRgb(baseHex)
  const target = hexToRgb(targetHex)
  const safeRatio = Math.max(0, Math.min(1, ratio))

  return rgbToHex({
    r: Math.round(base.r + (target.r - base.r) * safeRatio),
    g: Math.round(base.g + (target.g - base.g) * safeRatio),
    b: Math.round(base.b + (target.b - base.b) * safeRatio),
  })
}

function buildBossPalette(theme) {
  const base = theme?.primaryColor || '#1677ff'

  if (theme?.mode === 'girl') {
    return [
      base,
      mixHex(base, '#ffffff', 0.24),
      '#ff8cbe',
      '#ffb2d1',
      '#d95b93',
      '#ffd6e8',
    ]
  }

  if (theme?.mode === 'dark') {
    return [
      base,
      mixHex(base, '#7dd3fc', 0.3),
      '#22c55e',
      '#f59e0b',
      '#ef4444',
      '#a78bfa',
    ]
  }

  return [
    base,
    mixHex(base, '#14b8a6', 0.4),
    '#52c41a',
    '#faad14',
    '#f5222d',
    '#722ed1',
  ]
}

function buildTrendChartModel(rows, width = 640, height = 220) {
  if (!rows.length) {
    return {
      areaPoints: '',
      polylinePoints: '',
      plotPoints: [],
      yTicks: [],
      xAxisY: 0,
      yAxisX: 0,
    }
  }

  const paddingLeft = 56
  const paddingRight = 18
  const paddingTop = 16
  const paddingBottom = 28
  const chartW = width - paddingLeft - paddingRight
  const chartH = height - paddingTop - paddingBottom
  const maxIncome = Math.max(...rows.map((item) => item.income), 1)

  const plotPoints = rows.map((item, idx) => {
    const x = paddingLeft + (idx / Math.max(rows.length - 1, 1)) * chartW
    const y = paddingTop + (1 - item.income / maxIncome) * chartH
    return {
      x,
      y,
      label: item.label,
      income: item.income,
    }
  })

  const yTicks = Array.from({ length: 5 }).map((_, idx) => {
    const ratio = idx / 4
    const value = maxIncome * (1 - ratio)
    const y = paddingTop + ratio * chartH
    return {
      y,
      value,
    }
  })

  return {
    areaPoints: [
      `${paddingLeft},${paddingTop + chartH}`,
      ...plotPoints.map(
        (point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`,
      ),
      `${paddingLeft + chartW},${paddingTop + chartH}`,
    ].join(' '),
    polylinePoints: plotPoints
      .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' '),
    plotPoints,
    yTicks,
    xAxisY: paddingTop + chartH,
    yAxisX: paddingLeft,
  }
}

function buildBossDonutData(rows, palette) {
  const total = rows.reduce((sum, item) => sum + item.income, 0)
  if (total <= 0) {
    return {
      gradient: '#f0f0f0',
      legendRows: [],
      leadLabel: '暂无数据',
      leadIncome: 0,
    }
  }

  const topRows = rows.slice(0, 6)
  let offset = 0
  const parts = topRows.map((item, idx) => {
    const percent = (item.income / total) * 100
    const from = offset
    const to = offset + percent
    offset = to
    return {
      ...item,
      color: palette[idx % palette.length],
      percent,
      from,
      to,
    }
  })

  const gradient = parts
    .map(
      (item) => `${item.color} ${item.from.toFixed(2)}% ${item.to.toFixed(2)}%`,
    )
    .join(', ')

  return {
    gradient: `conic-gradient(${gradient})`,
    legendRows: parts,
    leadLabel: parts[0]?.boss || '暂无数据',
    leadIncome: parts[0]?.income || 0,
  }
}

function AnalyticsPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState(-1)
  const [appTheme, setAppTheme] = useState(() => loadTheme())

  useEffect(() => {
    const syncTheme = (event) => {
      if (event?.detail) {
        setAppTheme(event.detail)
        return
      }

      setAppTheme(loadTheme())
    }

    window.addEventListener('app-theme-updated', syncTheme)
    window.addEventListener('storage', syncTheme)

    return () => {
      window.removeEventListener('app-theme-updated', syncTheme)
      window.removeEventListener('storage', syncTheme)
    }
  }, [])

  useEffect(() => {
    let canceled = false

    const load = async () => {
      const payload = await loadOrdersData()
      if (!canceled) {
        setOrders(Array.isArray(payload.orders) ? payload.orders : [])
      }
    }

    load()
    const timer = window.setInterval(load, 30000)

    return () => {
      canceled = true
      window.clearInterval(timer)
    }
  }, [])

  const metrics = useMemo(() => {
    const summary = buildIncomeSummary(orders)
    return {
      ...summary,
      trendChart: buildTrendChartModel(summary.recentDailyIncome),
      donut: buildBossDonutData(summary.bossRows, buildBossPalette(appTheme)),
    }
  }, [orders, appTheme])

  const animatedDailyIncome = useAnimatedSeries(metrics.recentDailyIncome, {
    keyField: 'label',
    fields: ['income'],
    duration: 820,
  })
  const animatedBossRows = useAnimatedSeries(metrics.bossRows, {
    keyField: 'boss',
    fields: ['income'],
    duration: 820,
  })

  const animatedTrendChart = useMemo(
    () => buildTrendChartModel(animatedDailyIncome),
    [animatedDailyIncome],
  )
  const animatedDonut = useMemo(
    () => buildBossDonutData(animatedBossRows, buildBossPalette(appTheme)),
    [animatedBossRows, appTheme],
  )

  const openRevenueFocus = (focus) => {
    navigate(`/dashboard/revenue-trends?focus=${focus}`)
  }

  const handleMetricCardKeyDown = (event, focus) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openRevenueFocus(focus)
    }
  }

  const hoveredTrendPoint =
    hoveredTrendIndex >= 0 &&
    hoveredTrendIndex < animatedTrendChart.plotPoints.length
      ? animatedTrendChart.plotPoints[hoveredTrendIndex]
      : null

  const hoveredBubbleX = useMemo(() => {
    if (!hoveredTrendPoint) {
      return 0
    }

    const bubbleWidth = 132
    return Math.max(
      58,
      Math.min(640 - bubbleWidth - 8, hoveredTrendPoint.x - 64),
    )
  }, [hoveredTrendPoint])

  const bossColumns = [
    {
      title: '老板',
      dataIndex: 'boss',
      key: 'boss',
      ellipsis: true,
    },
    {
      title: '收入',
      dataIndex: 'income',
      key: 'income',
      width: 120,
      render: (value) => `¥ ${Number(value || 0).toFixed(2)}`,
    },
    {
      title: '占比',
      key: 'share',
      width: 170,
      render: (_, row) => {
        const percent = metrics.topIncome
          ? Math.round((row.income / metrics.topIncome) * 100)
          : 0
        return <Progress percent={percent} size="small" showInfo={false} />
      },
    },
  ]

  return (
    <section className="analytics-page">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div className="analytics-hero">
          <div>
            <h2>数据看板</h2>
            <Typography.Text type="secondary">
              用更直观的收入节奏、对比关系和老板贡献，帮你快速看出最近的单量质量。
            </Typography.Text>
          </div>
          <div className="analytics-hero-badges">
            <span>
              近14天累计{' '}
              <AnimatedNumber
                value={animatedDailyIncome.reduce(
                  (sum, item) => sum + item.income,
                  0,
                )}
                decimals={2}
                prefix="¥"
                duration={820}
              />
            </span>
            <span>
              今日订单{' '}
              <AnimatedNumber value={metrics.todayCount} suffix=" 单" />
            </span>
            <span>{`今日时长 ${formatDuration(metrics.todaySeconds)}`}</span>
          </div>
        </div>

        <Row gutter={[10, 10]}>
          <Col xs={24} sm={12} lg={6}>
            <Card
              size="small"
              className="analytics-metric-card analytics-metric-card-income"
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => openRevenueFocus('today')}
              onKeyDown={(event) => handleMetricCardKeyDown(event, 'today')}
            >
              <Statistic
                className="analytics-metric-stat"
                title="今日收入"
                value={metrics.todayIncome}
                formatter={(value) => (
                  <AnimatedNumber
                    value={Number(value || 0)}
                    decimals={2}
                    prefix="¥ "
                  />
                )}
              />
              <Tag
                className={`analytics-trend-tag ${
                  metrics.todayIncome >= metrics.yesterdayIncome
                    ? 'is-up'
                    : 'is-down'
                }`}
              >
                较昨日{' '}
                {formatPercent(metrics.todayIncome, metrics.yesterdayIncome)}
              </Tag>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              size="small"
              className="analytics-metric-card analytics-metric-card-week"
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => openRevenueFocus('week')}
              onKeyDown={(event) => handleMetricCardKeyDown(event, 'week')}
            >
              <Statistic
                className="analytics-metric-stat"
                title="本周收入"
                value={metrics.thisWeekIncome}
                formatter={(value) => (
                  <AnimatedNumber
                    value={Number(value || 0)}
                    decimals={2}
                    prefix="¥ "
                  />
                )}
              />
              <Tag
                className={`analytics-trend-tag ${
                  metrics.thisWeekIncome >= metrics.lastWeekIncome
                    ? 'is-up'
                    : 'is-down'
                }`}
              >
                较上周{' '}
                {formatPercent(metrics.thisWeekIncome, metrics.lastWeekIncome)}
              </Tag>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              size="small"
              className="analytics-metric-card analytics-metric-card-month"
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => openRevenueFocus('month')}
              onKeyDown={(event) => handleMetricCardKeyDown(event, 'month')}
            >
              <Statistic
                className="analytics-metric-stat"
                title="本月收入"
                value={metrics.thisMonthIncome}
                formatter={(value) => (
                  <AnimatedNumber
                    value={Number(value || 0)}
                    decimals={2}
                    prefix="¥ "
                  />
                )}
              />
              <Tag
                className={`analytics-trend-tag ${
                  metrics.thisMonthIncome >= metrics.lastMonthIncome
                    ? 'is-up'
                    : 'is-down'
                }`}
              >
                较上月{' '}
                {formatPercent(
                  metrics.thisMonthIncome,
                  metrics.lastMonthIncome,
                )}
              </Tag>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              size="small"
              className="analytics-metric-card analytics-metric-card-duration"
            >
              <Statistic
                className="analytics-metric-stat"
                title="今日时长"
                value={formatDuration(metrics.todaySeconds)}
              />
              <Typography.Text
                type="secondary"
                className="analytics-order-count"
              >
                今日订单 <AnimatedNumber value={metrics.todayCount} /> 单
              </Typography.Text>
            </Card>
          </Col>
        </Row>

        <Card title="老板收入排行" size="small" className="analytics-boss-card">
          {metrics.bossRows.length === 0 ? (
            <Empty description="暂无订单数据" />
          ) : (
            <Table
              rowKey="boss"
              size="small"
              pagination={{
                pageSize: 8,
                showSizeChanger: false,
                hideOnSinglePage: true,
              }}
              columns={bossColumns}
              dataSource={metrics.bossRows}
            />
          )}
        </Card>

        <Row gutter={[10, 10]}>
          <Col xs={24} lg={14}>
            <Card
              title="近14天收入趋势"
              size="small"
              className="analytics-chart-card"
            >
              {metrics.recentDailyIncome.length === 0 ? (
                <Empty description="暂无趋势数据" />
              ) : (
                <div
                  className="trend-wrap"
                  onMouseLeave={() => setHoveredTrendIndex(-1)}
                >
                  <div className="trend-hover-layer" aria-hidden="true">
                    {metrics.recentDailyIncome.map((item, idx) => (
                      <Tooltip
                        key={`hover-${item.label}-${idx}`}
                        title={`${item.label} 收入 ¥${item.income.toFixed(2)}`}
                      >
                        <span
                          className="trend-hover-cell"
                          onMouseEnter={() => setHoveredTrendIndex(idx)}
                        />
                      </Tooltip>
                    ))}
                  </div>
                  <svg
                    viewBox="0 0 640 220"
                    className="trend-svg"
                    role="img"
                    aria-label="近14天收入趋势图"
                  >
                    {animatedTrendChart.yTicks.map((tick, idx) => (
                      <g key={`y-tick-${idx}`}>
                        <line
                          x1={animatedTrendChart.yAxisX}
                          y1={tick.y}
                          x2="622"
                          y2={tick.y}
                          className="trend-grid-line"
                        />
                        <text x="52" y={tick.y + 4} className="trend-y-label">
                          {`¥${tick.value.toFixed(0)}`}
                        </text>
                      </g>
                    ))}
                    <line
                      x1={animatedTrendChart.yAxisX}
                      y1="16"
                      x2={animatedTrendChart.yAxisX}
                      y2={animatedTrendChart.xAxisY}
                      className="trend-axis-line"
                    />
                    <line
                      x1={animatedTrendChart.yAxisX}
                      y1={animatedTrendChart.xAxisY}
                      x2="622"
                      y2={animatedTrendChart.xAxisY}
                      className="trend-axis-line"
                    />
                    {hoveredTrendPoint && (
                      <line
                        x1={hoveredTrendPoint.x}
                        y1="16"
                        x2={hoveredTrendPoint.x}
                        y2={animatedTrendChart.xAxisY}
                        className="trend-crosshair"
                      />
                    )}
                    <defs>
                      <linearGradient
                        id="trendAreaFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--theme-primary)"
                          stopOpacity="0.28"
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--theme-primary)"
                          stopOpacity="0.02"
                        />
                      </linearGradient>
                      <linearGradient
                        id="trendLineStroke"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--theme-primary-soft)"
                        />
                        <stop offset="100%" stopColor="var(--theme-primary)" />
                      </linearGradient>
                    </defs>
                    <polygon
                      points={animatedTrendChart.areaPoints}
                      className="trend-area"
                      fill="url(#trendAreaFill)"
                    />
                    <polyline
                      points={animatedTrendChart.polylinePoints}
                      fill="none"
                      stroke="url(#trendLineStroke)"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="trend-polyline"
                    />
                    {animatedTrendChart.plotPoints.map((point, idx) => (
                      <g key={point.label}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="4"
                          fill="var(--theme-primary)"
                          className={`trend-point ${hoveredTrendIndex === idx ? 'trend-point-hovered' : ''}`}
                          style={{ animationDelay: `${idx * 0.08}s` }}
                        >
                          <title>{`${point.label} 收入 ¥${point.income.toFixed(2)}`}</title>
                        </circle>
                        <text
                          x={point.x}
                          y={animatedTrendChart.xAxisY + 16}
                          className="trend-x-label"
                        >
                          {idx % 2 === 0 ? point.label : ''}
                        </text>
                      </g>
                    ))}
                    {hoveredTrendPoint && (
                      <g className="trend-bubble">
                        <rect
                          x={hoveredBubbleX}
                          y="8"
                          width="132"
                          height="34"
                          rx="8"
                          ry="8"
                          className="trend-bubble-box"
                        />
                        <text
                          x={hoveredBubbleX + 8}
                          y="30"
                          className="trend-bubble-text"
                        >
                          {`${hoveredTrendPoint.label}  ¥${hoveredTrendPoint.income.toFixed(2)}`}
                        </text>
                      </g>
                    )}
                  </svg>
                </div>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card
              title="老板收入占比"
              size="small"
              className="analytics-chart-card"
            >
              {animatedDonut.legendRows.length === 0 ? (
                <Empty description="暂无占比数据" />
              ) : (
                <div className="donut-layout">
                  <Tooltip title="悬浮图例可查看每位老板的收入与占比">
                    <div
                      className="donut-chart"
                      style={{ background: animatedDonut.gradient }}
                    >
                      <div className="donut-center-label">
                        <span className="donut-center-kicker">TOP 老板</span>
                        <strong>{animatedDonut.leadLabel}</strong>
                        <span>
                          <AnimatedNumber
                            value={animatedDonut.leadIncome}
                            decimals={2}
                            prefix="¥"
                            duration={820}
                          />
                        </span>
                      </div>
                    </div>
                  </Tooltip>
                  <div className="donut-legend">
                    {animatedDonut.legendRows.map((item) => (
                      <Tooltip
                        key={item.boss}
                        title={`${item.boss}：¥${item.income.toFixed(2)}（${item.percent.toFixed(1)}%）`}
                      >
                        <div className="donut-legend-item">
                          <span
                            className="dot"
                            style={{ background: item.color }}
                          />
                          <span className="boss-name" title={item.boss}>
                            {item.boss}
                          </span>
                          <span className="boss-income">
                            <AnimatedNumber
                              value={item.income}
                              decimals={2}
                              prefix="¥"
                              duration={820}
                            />
                          </span>
                          <span className="boss-percent">{`${item.percent.toFixed(1)}%`}</span>
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </Space>
    </section>
  )
}

export default AnalyticsPage
