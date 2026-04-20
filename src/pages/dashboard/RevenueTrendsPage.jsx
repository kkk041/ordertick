/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Col, Empty, Row, Space, Typography } from 'antd'
import { useLocation } from 'react-router-dom'
import AnimatedNumber from '../../components/common/AnimatedNumber'
import useAnimatedSeries from '../../hooks/useAnimatedSeries'
import { loadOrdersData } from '../../utils/orderStorage'
import { buildIncomeSummary, formatPercent } from '../../utils/dashboardMetrics'
import './RevenueTrendsPage.css'

function buildSparklineModel(rows, width = 360, height = 150) {
  if (!rows.length) {
    return {
      areaPoints: '',
      linePoints: '',
      bars: [],
      labels: [],
      points: [],
    }
  }

  const paddingX = 18
  const paddingTop = 16
  const paddingBottom = 28
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingTop - paddingBottom
  const maxValue = Math.max(...rows.map((item) => item.income), 1)

  const points = rows.map((item, index) => {
    const x = paddingX + (index / Math.max(rows.length - 1, 1)) * chartWidth
    const y = paddingTop + (1 - item.income / maxValue) * chartHeight
    return {
      ...item,
      x,
      y,
    }
  })

  const barWidth = Math.max(18, chartWidth / Math.max(rows.length * 1.7, 1))

  return {
    areaPoints: [
      `${paddingX},${paddingTop + chartHeight}`,
      ...points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`),
      `${paddingX + chartWidth},${paddingTop + chartHeight}`,
    ].join(' '),
    linePoints: points
      .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' '),
    points,
    bars: points.map((point) => ({
      ...point,
      barWidth,
      barHeight: Math.max(8, paddingTop + chartHeight - point.y),
    })),
    labels: points.map((point) => ({
      x: point.x,
      label: point.label,
    })),
  }
}

function RevenueFocusCard({
  title,
  subtitle,
  currentLabel,
  previousLabel,
  currentValue,
  previousValue,
  deltaText,
  chartRows,
  variant,
  chartMode = 'line',
  sectionRef,
}) {
  const chart = useMemo(() => buildSparklineModel(chartRows), [chartRows])

  return (
    <div ref={sectionRef}>
      <Card className={`revenue-focus-card is-${variant}`}>
        <div className="revenue-focus-head">
          <div>
            <h3>{title}</h3>
            <Typography.Text type="secondary">{subtitle}</Typography.Text>
          </div>
          <span className="revenue-focus-badge">{deltaText}</span>
        </div>

        <div className="revenue-focus-values">
          <div className="revenue-focus-value-block">
            <span>{currentLabel}</span>
            <strong>
              <AnimatedNumber value={currentValue} decimals={2} prefix="¥ " />
            </strong>
          </div>
          <div className="revenue-focus-value-block muted">
            <span>{previousLabel}</span>
            <strong>
              <AnimatedNumber value={previousValue} decimals={2} prefix="¥ " />
            </strong>
          </div>
        </div>

        <svg viewBox="0 0 360 150" className="revenue-sparkline" role="img">
          <defs>
            <linearGradient
              id={`revenue-area-${variant}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--theme-primary)"
                stopOpacity="0.26"
              />
              <stop
                offset="100%"
                stopColor="var(--theme-primary)"
                stopOpacity="0.04"
              />
            </linearGradient>
          </defs>

          {chartMode === 'bar' ? (
            chart.bars.map((bar) => (
              <g key={`${variant}-${bar.label}`}>
                <rect
                  x={bar.x - bar.barWidth / 2}
                  y={150 - 28 - bar.barHeight}
                  width={bar.barWidth}
                  height={bar.barHeight}
                  rx="8"
                  className="revenue-spark-bar"
                />
                <title>{`${bar.label} 收入 ¥${bar.income.toFixed(2)}`}</title>
              </g>
            ))
          ) : (
            <>
              <polygon
                points={chart.areaPoints}
                fill={`url(#revenue-area-${variant})`}
              />
              <polyline
                points={chart.linePoints}
                fill="none"
                className="revenue-spark-line"
              />
              {chart.points.map((point) => (
                <circle
                  key={`${variant}-${point.label}`}
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  className="revenue-spark-point"
                >
                  <title>{`${point.label} 收入 ¥${point.income.toFixed(2)}`}</title>
                </circle>
              ))}
            </>
          )}

          {chart.labels.map((label, index) => (
            <text
              key={`${variant}-label-${label.label}`}
              x={label.x}
              y="142"
              className="revenue-spark-label"
            >
              {index % 2 === 0 ? label.label : ''}
            </text>
          ))}
        </svg>
      </Card>
    </div>
  )
}

function RevenueTrendsPage() {
  const location = useLocation()
  const [orders, setOrders] = useState([])
  const todayRef = useRef(null)
  const weekRef = useRef(null)
  const monthRef = useRef(null)

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

  const metrics = useMemo(() => buildIncomeSummary(orders), [orders])
  const animatedComparisonRows = useAnimatedSeries(metrics.comparisonRows, {
    keyField: 'key',
    fields: ['currentValue', 'previousValue'],
    duration: 820,
  })
  const animatedDailyIncome = useAnimatedSeries(metrics.recentDailyIncome, {
    keyField: 'label',
    fields: ['income'],
    duration: 820,
  })
  const animatedWeeklyIncome = useAnimatedSeries(metrics.recentWeeklyIncome, {
    keyField: 'label',
    fields: ['income'],
    duration: 820,
  })
  const animatedMonthlyIncome = useAnimatedSeries(metrics.recentMonthlyIncome, {
    keyField: 'label',
    fields: ['income'],
    duration: 820,
  })

  const comparisonMax = useMemo(() => {
    return Math.max(
      ...animatedComparisonRows.flatMap((item) => [
        item.currentValue,
        item.previousValue,
      ]),
      1,
    )
  }, [animatedComparisonRows])

  useEffect(() => {
    const search = new URLSearchParams(location.search)
    const focus = search.get('focus')
    const refMap = {
      today: todayRef,
      week: weekRef,
      month: monthRef,
    }

    if (focus && refMap[focus]?.current) {
      refMap[focus].current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }, [location.search])

  return (
    <section className="revenue-trends-page">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div className="revenue-hero">
          <div>
            <h2>收入趋势</h2>
            <Typography.Text type="secondary">
              这里重点看阶段对比和节奏变化，适合复盘最近收入有没有在抬升。
            </Typography.Text>
          </div>
          <div className="revenue-hero-badges">
            <span>
              今日{' '}
              <AnimatedNumber
                value={metrics.todayIncome}
                decimals={2}
                prefix="¥"
              />
            </span>
            <span>
              本周{' '}
              <AnimatedNumber
                value={metrics.thisWeekIncome}
                decimals={2}
                prefix="¥"
              />
            </span>
            <span>
              本月{' '}
              <AnimatedNumber
                value={metrics.thisMonthIncome}
                decimals={2}
                prefix="¥"
              />
            </span>
          </div>
        </div>

        <Card className="revenue-comparison-card">
          <div className="revenue-section-head">
            <div>
              <h3>阶段收入对照</h3>
              <Typography.Text type="secondary">
                当前周期和上一周期并排展示，适合判断增长是否稳定。
              </Typography.Text>
            </div>
          </div>

          {animatedComparisonRows.length === 0 ? (
            <Empty description="暂无收入数据" />
          ) : (
            <div className="revenue-comparison-grid">
              {animatedComparisonRows.map((item) => (
                <div key={item.key} className="revenue-comparison-row">
                  <div className="revenue-comparison-meta">
                    <strong>{item.label}</strong>
                    <span>
                      {formatPercent(item.currentValue, item.previousValue)}
                    </span>
                  </div>
                  <div className="revenue-comparison-bars">
                    <div className="revenue-comparison-bar-group">
                      <label>{item.currentLabel}</label>
                      <div className="revenue-comparison-track">
                        <div
                          className="revenue-comparison-bar current"
                          style={{
                            width: `${(item.currentValue / comparisonMax) * 100}%`,
                          }}
                        />
                      </div>
                      <span>
                        <AnimatedNumber
                          value={item.currentValue}
                          decimals={2}
                          prefix="¥"
                          duration={820}
                        />
                      </span>
                    </div>
                    <div className="revenue-comparison-bar-group">
                      <label>{item.previousLabel}</label>
                      <div className="revenue-comparison-track">
                        <div
                          className="revenue-comparison-bar previous"
                          style={{
                            width: `${(item.previousValue / comparisonMax) * 100}%`,
                          }}
                        />
                      </div>
                      <span>
                        <AnimatedNumber
                          value={item.previousValue}
                          decimals={2}
                          prefix="¥"
                          duration={820}
                        />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Row gutter={[12, 12]}>
          <Col xs={24} xl={8}>
            <RevenueFocusCard
              sectionRef={todayRef}
              title="今日收入"
              subtitle="结合最近14天的日收入波动，判断今天在近期里的位置。"
              currentLabel="今日"
              previousLabel="昨日"
              currentValue={metrics.todayIncome}
              previousValue={metrics.yesterdayIncome}
              deltaText={formatPercent(
                metrics.todayIncome,
                metrics.yesterdayIncome,
              )}
              chartRows={animatedDailyIncome}
              variant="today"
            />
          </Col>
          <Col xs={24} xl={8}>
            <RevenueFocusCard
              sectionRef={weekRef}
              title="本周收入"
              subtitle="用最近8周的柱状图看周度波峰，适合看接单稳定性。"
              currentLabel="本周"
              previousLabel="上周"
              currentValue={metrics.thisWeekIncome}
              previousValue={metrics.lastWeekIncome}
              deltaText={formatPercent(
                metrics.thisWeekIncome,
                metrics.lastWeekIncome,
              )}
              chartRows={animatedWeeklyIncome}
              variant="week"
              chartMode="bar"
            />
          </Col>
          <Col xs={24} xl={8}>
            <RevenueFocusCard
              sectionRef={monthRef}
              title="本月收入"
              subtitle="拉长到最近6个月，更容易看出淡旺季和长期增长曲线。"
              currentLabel="本月"
              previousLabel="上月"
              currentValue={metrics.thisMonthIncome}
              previousValue={metrics.lastMonthIncome}
              deltaText={formatPercent(
                metrics.thisMonthIncome,
                metrics.lastMonthIncome,
              )}
              chartRows={animatedMonthlyIncome}
              variant="month"
            />
          </Col>
        </Row>
      </Space>
    </section>
  )
}

export default RevenueTrendsPage
