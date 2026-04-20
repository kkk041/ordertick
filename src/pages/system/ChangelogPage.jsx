import { useEffect, useRef } from 'react'
import { Tag, Timeline, Typography } from 'antd'
import { RocketOutlined } from '@ant-design/icons'
import authorFeedbackQr from '../../../build/kxy_erweima.jpg'
import './ChangelogPage.css'

const TAG_MAP = {
  feat: { color: 'blue', text: '新功能' },
  fix: { color: 'orange', text: '修复' },
  improve: { color: 'green', text: '优化' },
  chore: { color: 'default', text: '调整' },
}

/**
 * 更新日志数据，最新的放最前面。
 * 每条 item: { type: 'feat'|'fix'|'improve'|'chore', text: string }
 */
const CHANGELOG = [
  {
    version: 'v1.3.0',
    date: '2026-04-21',
    items: [
      {
        type: 'feat',
        text: '账单表格里现在可以直接点“已结/未结”切换，不用再进编辑页，点一下就能改状态。',
      },
      {
        type: 'feat',
        text: '历史页支持按“全部/仅已结/仅未结”筛选，催账时一眼就能把未结订单拎出来。',
      },
      {
        type: 'feat',
        text: '页面顶部增加了已结金额、未结金额、超期未结数量这些汇总信息，不用自己心算。',
      },
      {
        type: 'feat',
        text: '补录、快速补入、历史编辑都补上了“接单群”和“结算状态”，录单时信息更完整。',
      },
      {
        type: 'improve',
        text: '操作区图标都加回了文字提示（比如查看、复制、编辑、结算切换），新用户不再需要猜按钮含义。',
      },
      {
        type: 'fix',
        text: '修复了一个容易误触的细节：快速连点“已结/未结”时，不会再误弹“订单详情”。',
      },
      {
        type: 'improve',
        text: '订单行支持双击看详情，但在结算按钮和操作按钮区域里双击会自动拦住，避免手快误触。',
      },
      {
        type: 'improve',
        text: '“未计费提醒”改成跟计费方式走，不再只盯15分钟，提示文案会按你当前规则自动变化。',
      },
      {
        type: 'improve',
        text: '设置页加了“有改动未保存”提醒：切菜单、刷新页面、直接关闭时都会提醒你，防止白改。',
      },
      {
        type: 'improve',
        text: '总览和历史的状态标签、滚动条、弹窗布局做了细调，信息更集中，查看和点按更顺手。',
      },
      {
        type: 'chore',
        text: '计费模板功能先临时封闭，当前先回归三种常用模式（分钟制、15分钟制、按把计费），等后续再继续开放。',
      },
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026-04-18',
    items: [
      {
        type: 'feat',
        text: '报单模板来了！可以自己设置报单要填哪些东西，结算完一键复制，再也不用手打报单了',
      },
      { type: 'feat', text: '加了更新日志页面，每次改了什么一目了然' },
      { type: 'improve', text: '接单页面重新整理了一下，看起来更清爽' },
      { type: 'improve', text: '计费那些设置收到下面去了，常用操作更顺手' },
      { type: 'improve', text: '菜单名字改得更好懂了' },
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026-04-17',
    items: [
      { type: 'feat', text: '支持按把计费了，打一把结一把' },
      { type: 'feat', text: '历史账单也能按「按把计费」筛选了' },
      { type: 'improve', text: '暗色和少女模式更好看了' },
      { type: 'fix', text: '结算面板偶尔闪一下的问题修好了' },
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-04-15',
    items: [
      { type: 'feat', text: '接单计时 + 自动结算，核心功能上线' },
      { type: 'feat', text: '今日数据、收入走势、历史账单一应俱全' },
      { type: 'feat', text: '三套主题随便换（明亮 / 暗色 / 少女）' },
      { type: 'feat', text: '支持15分钟制计费' },
      { type: 'feat', text: '抽成可以按百分比或固定金额算' },
      { type: 'feat', text: '各种设置都能自己调（名称、主题色、计费默认值）' },
    ],
  },
]

function ChangelogPage() {
  const scrollBodyRef = useRef(null)

  useEffect(() => {
    if (scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = 0
    }
  }, [])

  return (
    <section className="changelog-page">
      <div className="changelog-header">
        <h2>更新日志</h2>
        <Typography.Text type="secondary">
          每次版本更新都会记录在这里，方便你了解新功能和改进。
        </Typography.Text>
      </div>

      <div className="changelog-body">
        <div className="changelog-main" ref={scrollBodyRef}>
          <div className="changelog-timeline">
            <Timeline
              items={CHANGELOG.map((release) => ({
                dot: <RocketOutlined className="changelog-version-dot" />,
                children: (
                  <div className="changelog-release">
                    <div className="changelog-release-head">
                      <span className="changelog-version">
                        {release.version}
                      </span>
                      <span className="changelog-date">{release.date}</span>
                    </div>
                    <ul className="changelog-items">
                      {release.items.map((item, i) => (
                        <li key={i} className="changelog-item">
                          <Tag
                            color={TAG_MAP[item.type]?.color}
                            className="changelog-tag"
                          >
                            {TAG_MAP[item.type]?.text}
                          </Tag>
                          <span>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              }))}
            />
          </div>
        </div>

        <aside className="changelog-side">
          <div className="changelog-contact-card">
            <div className="changelog-contact-head">
              <Typography.Title level={5}>联系作者</Typography.Title>
              <Typography.Paragraph type="secondary">
                如果你有功能需求、使用建议，或者觉得这款软件对你有帮助，欢迎添加作者微信反馈交流，也欢迎扫码支持继续更新。
              </Typography.Paragraph>
            </div>
            <div className="changelog-contact-qr-wrap">
              <img
                src={authorFeedbackQr}
                alt="作者微信二维码"
                className="changelog-contact-qr-image"
              />
            </div>
            <Typography.Text
              type="secondary"
              className="changelog-contact-note"
            >
              扫码后可直接联系作者。
            </Typography.Text>
          </div>
        </aside>
      </div>
    </section>
  )
}

export default ChangelogPage
