import { Tag, Timeline, Typography } from 'antd'
import {
  RocketOutlined,
  BugOutlined,
  StarOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import './ChangelogPage.css'

const ICON_MAP = {
  feat: <StarOutlined style={{ color: '#1677ff' }} />,
  fix: <BugOutlined style={{ color: '#faad14' }} />,
  improve: <RocketOutlined style={{ color: '#52c41a' }} />,
  chore: <ToolOutlined style={{ color: '#999' }} />,
}

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
  return (
    <section className="changelog-page">
      <div className="changelog-header">
        <h2>更新日志</h2>
        <Typography.Text type="secondary">
          每次版本更新都会记录在这里，方便你了解新功能和改进。
        </Typography.Text>
      </div>

      <div className="changelog-timeline">
        <Timeline
          items={CHANGELOG.map((release) => ({
            dot: <RocketOutlined className="changelog-version-dot" />,
            children: (
              <div className="changelog-release">
                <div className="changelog-release-head">
                  <span className="changelog-version">{release.version}</span>
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
    </section>
  )
}

export default ChangelogPage
