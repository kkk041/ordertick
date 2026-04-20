import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  ColorPicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import { DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import {
  defaultBranding,
  loadBranding,
  saveBranding,
} from '../../config/branding'
import {
  defaultTheme,
  getDefaultPrimaryByMode,
  loadTheme,
  saveTheme,
} from '../../config/theme'
import {
  getDataStorageConfig,
  savePricingConfig,
  loadTemplateRows,
  saveTemplateRows,
  AUTO_VARIABLES,
  DEFAULT_TEMPLATE_ROWS,
} from '../../utils/orderStorage'
import {
  BILLING_RULE_OPTIONS,
  COMMISSION_MODE_OPTIONS,
  DEFAULT_CUSTOM_BILLING_SEGMENTS,
  DEFAULT_PRICING_CONFIG,
  normalizeBillingSegments,
  normalizePricingConfig,
  normalizePricingTemplateId,
  normalizePricingTemplates,
  normalizeUnsettledReminderDays,
  normalizeUnsettledReminderMode,
  normalizeUnsettledReminderMinOrders,
} from '../../utils/pricing'
import { useLocation } from 'react-router-dom'
import './AppSettingsPage.css'

const { TextArea } = Input

function normalizeTemplateRowsForSnapshot(rows = []) {
  return (rows || []).map((row) => ({
    label: String(row.label || '').trim(),
    source: row.source === 'manual' ? 'manual' : 'auto',
    defaultValue: String(row.defaultValue || ''),
    required: Boolean(row.required),
  }))
}

function buildSettingsSnapshot(payload) {
  return {
    appName: String(payload.appName || '').trim(),
    appLogo: String(payload.appLogo || ''),
    themeMode: payload.themeMode,
    primaryColor: payload.primaryColor,
    themeColors: {
      ...(payload.themeColors || {}),
    },
    pricingConfig: {
      billingRule: payload.billingRule,
      commissionMode: payload.commissionMode,
      commissionValue: Math.max(0, Number(payload.commissionValue || 0)),
      pricingTemplateId: payload.pricingTemplateId,
      pricingTemplates: normalizePricingTemplates(payload.pricingTemplates),
      showDailyEncouragement: payload.showDailyEncouragement !== false,
      unsettledReminderEnabled: payload.unsettledReminderEnabled !== false,
      unsettledReminderDays: normalizeUnsettledReminderDays(
        payload.unsettledReminderDays,
      ),
      unsettledReminderMode: normalizeUnsettledReminderMode(
        payload.unsettledReminderMode,
      ),
      unsettledReminderMinOrders: normalizeUnsettledReminderMinOrders(
        payload.unsettledReminderMinOrders,
      ),
    },
    templateRows: normalizeTemplateRowsForSnapshot(payload.templateRows),
  }
}

function stringifySnapshot(snapshot) {
  return JSON.stringify(snapshot)
}

async function syncBrandingToDesktopApp(branding) {
  if (window.appControl?.applyBranding) {
    try {
      await window.appControl.applyBranding(branding)
    } catch {
      // Ignore desktop runtime sync errors; renderer branding is already updated.
    }
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function sanitizeTemplateLabel(value) {
  return String(value || '')
    .replaceAll('{', '')
    .replaceAll('}', '')
    .replaceAll('【', '')
    .replaceAll('】', '')
    .replaceAll('[', '')
    .replaceAll(']', '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 20)
}

function sanitizeTemplateValue(value) {
  return String(value || '').trim()
}

function isValidTemplateLabel(label) {
  if (!label) {
    return false
  }
  return /[\u4e00-\u9fa5A-Za-z0-9_-]/.test(label)
}

function parseTemplateTextRows(inputText, existingRows = []) {
  const lines = String(inputText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())

  const existingMap = new Map(
    (existingRows || []).map((row) => [
      String(row.label || '').trim(),
      {
        required: Boolean(row.required),
        defaultValue: String(row.defaultValue || ''),
      },
    ]),
  )

  const seen = new Set()
  const rows = []
  const ignored = []

  lines.forEach((line, index) => {
    if (!line) {
      return
    }

    const pair = line.match(/^([^:：]+)\s*[:：]\s*(.*)$/)
    if (!pair) {
      ignored.push(`第${index + 1}行缺少“：”分隔`)
      return
    }

    const label = sanitizeTemplateLabel(pair[1])
    if (!isValidTemplateLabel(label)) {
      ignored.push(`第${index + 1}行字段名无效`)
      return
    }

    if (seen.has(label)) {
      ignored.push(`字段“${label}”重复，后续已忽略`)
      return
    }

    const rawValue = String(pair[2] || '').trim()
    const isAuto = Boolean(AUTO_VARIABLES[label])
    const cleanedValue = sanitizeTemplateValue(
      rawValue
        .replace(/\{\{[^}]+\}\}/g, '')
        .replace(/【[^】]+】/g, '')
        .replace(/^[(（]?待填写[)）]?$/, ''),
    )

    const existed = existingMap.get(label)
    rows.push({
      label,
      source: isAuto ? 'auto' : 'manual',
      defaultValue: cleanedValue || existed?.defaultValue || '',
      required: existed?.required || false,
    })
    seen.add(label)
  })

  return {
    rows,
    ignored,
  }
}

function AppSettingsPage() {
  const pricingTemplateLocked = true
  const location = useLocation()
  const current = loadBranding()
  const currentTheme = loadTheme()
  const [appName, setAppName] = useState(current.appName)
  const [appLogo, setAppLogo] = useState(current.appLogo)
  const [themeMode, setThemeMode] = useState(currentTheme.mode)
  const [themeColors, setThemeColors] = useState(currentTheme.colors)
  const [primaryColor, setPrimaryColor] = useState(
    currentTheme.colors?.[currentTheme.mode] || currentTheme.primaryColor,
  )
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
  const [saving, setSaving] = useState(false)
  const [templateRows, setTemplateRows] = useState(() => loadTemplateRows())
  const [templatePasteText, setTemplatePasteText] = useState('')
  const [templateParseResult, setTemplateParseResult] = useState(null)
  const [reportTemplateFocused, setReportTemplateFocused] = useState(false)
  const [reportTemplateVisible, setReportTemplateVisible] = useState(false)
  const [savedSnapshotKey, setSavedSnapshotKey] = useState('')
  const [dirtyCheckReady, setDirtyCheckReady] = useState(false)
  const [segmentEditorOpen, setSegmentEditorOpen] = useState(false)
  const [segmentEditingTemplateId, setSegmentEditingTemplateId] = useState('')
  const [segmentRows, setSegmentRows] = useState(() =>
    normalizeBillingSegments(DEFAULT_CUSTOM_BILLING_SEGMENTS),
  )

  const loadDataDirConfig = useCallback(async () => {
    const config = normalizePricingConfig(await getDataStorageConfig())
    setBillingRule(config.billingRule || DEFAULT_PRICING_CONFIG.billingRule)
    setCommissionMode(
      config.commissionMode || DEFAULT_PRICING_CONFIG.commissionMode,
    )
    setCommissionValue(
      Number(config.commissionValue || DEFAULT_PRICING_CONFIG.commissionValue),
    )
    setPricingTemplates(
      config.pricingTemplates || DEFAULT_PRICING_CONFIG.pricingTemplates,
    )
    setPricingTemplateId(
      normalizePricingTemplateId(
        config.pricingTemplateId,
        config.pricingTemplates,
        DEFAULT_PRICING_CONFIG.pricingTemplateId,
      ),
    )
    setShowDailyEncouragement(config.showDailyEncouragement !== false)
    setUnsettledReminderEnabled(config.unsettledReminderEnabled !== false)
    setUnsettledReminderDays(
      normalizeUnsettledReminderDays(
        config.unsettledReminderDays,
        DEFAULT_PRICING_CONFIG.unsettledReminderDays,
      ),
    )
    setUnsettledReminderMode(
      normalizeUnsettledReminderMode(
        config.unsettledReminderMode,
        DEFAULT_PRICING_CONFIG.unsettledReminderMode,
      ),
    )
    setUnsettledReminderMinOrders(
      normalizeUnsettledReminderMinOrders(
        config.unsettledReminderMinOrders,
        DEFAULT_PRICING_CONFIG.unsettledReminderMinOrders,
      ),
    )

    const latestBranding = loadBranding()
    const latestTheme = loadTheme()

    const initialSnapshot = buildSettingsSnapshot({
      appName: latestBranding.appName,
      appLogo: latestBranding.appLogo,
      themeMode: latestTheme.mode,
      primaryColor:
        latestTheme.colors?.[latestTheme.mode] || latestTheme.primaryColor,
      themeColors: latestTheme.colors,
      billingRule: config.billingRule,
      commissionMode: config.commissionMode,
      commissionValue: Number(config.commissionValue || 0),
      pricingTemplateId: normalizePricingTemplateId(
        config.pricingTemplateId,
        config.pricingTemplates,
        DEFAULT_PRICING_CONFIG.pricingTemplateId,
      ),
      pricingTemplates: config.pricingTemplates,
      showDailyEncouragement: config.showDailyEncouragement,
      unsettledReminderEnabled: config.unsettledReminderEnabled,
      unsettledReminderDays: config.unsettledReminderDays,
      unsettledReminderMode: config.unsettledReminderMode,
      unsettledReminderMinOrders: config.unsettledReminderMinOrders,
      templateRows: loadTemplateRows(),
    })
    setSavedSnapshotKey(stringifySnapshot(initialSnapshot))
    setDirtyCheckReady(true)
  }, [])

  const currentSnapshotKey = useMemo(() => {
    return stringifySnapshot(
      buildSettingsSnapshot({
        appName,
        appLogo,
        themeMode,
        primaryColor,
        themeColors,
        billingRule,
        commissionMode,
        commissionValue,
        pricingTemplateId,
        pricingTemplates,
        showDailyEncouragement,
        unsettledReminderEnabled,
        unsettledReminderDays,
        unsettledReminderMode,
        unsettledReminderMinOrders,
        templateRows,
      }),
    )
  }, [
    appLogo,
    appName,
    billingRule,
    commissionMode,
    commissionValue,
    primaryColor,
    pricingTemplateId,
    pricingTemplates,
    showDailyEncouragement,
    themeColors,
    themeMode,
    templateRows,
    unsettledReminderDays,
    unsettledReminderEnabled,
    unsettledReminderMinOrders,
    unsettledReminderMode,
  ])

  const hasUnsavedChanges =
    dirtyCheckReady &&
    Boolean(savedSnapshotKey) &&
    savedSnapshotKey !== currentSnapshotKey

  useEffect(() => {
    window.__appSettingsDirty = hasUnsavedChanges
    window.dispatchEvent(
      new CustomEvent('app-settings-dirty-changed', {
        detail: { dirty: hasUnsavedChanges },
      }),
    )

    return () => {
      window.__appSettingsDirty = false
      window.dispatchEvent(
        new CustomEvent('app-settings-dirty-changed', {
          detail: { dirty: false },
        }),
      )
    }
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  const selectedTemplate = useMemo(() => {
    return (
      pricingTemplates.find((item) => item.id === pricingTemplateId) ||
      pricingTemplates[0] ||
      null
    )
  }, [pricingTemplateId, pricingTemplates])

  useEffect(() => {
    if (!selectedTemplate) {
      return
    }

    setBillingRule(selectedTemplate.billingRule)
    setCommissionMode(selectedTemplate.commissionMode)
    setCommissionValue(Number(selectedTemplate.commissionValue || 0))
  }, [selectedTemplate])

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const shouldFocusReport =
      searchParams.get('focus') === 'report-template' ||
      location.state?.slideFromRight

    if (!shouldFocusReport) {
      setReportTemplateFocused(false)
      return
    }

    setReportTemplateVisible(true)
    setReportTemplateFocused(true)

    const timer = window.setTimeout(() => {
      setReportTemplateFocused(false)
    }, 2600)

    return () => window.clearTimeout(timer)
  }, [location.search, location.state])

  useEffect(() => {
    loadDataDirConfig()
  }, [loadDataDirConfig])

  const openReportTemplatePanel = () => {
    setReportTemplateVisible(true)
    setReportTemplateFocused(true)
    window.setTimeout(() => {
      setReportTemplateFocused(false)
    }, 2000)
  }

  const handleUploadLogo = async (file) => {
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setAppLogo(dataUrl)
      message.success('Logo 已加载，点击保存后生效')
    } catch {
      message.error('读取图片失败，请重试')
    }

    return false
  }

  const handleSave = async () => {
    if (!appName.trim()) {
      message.warning('软件名称不能为空')
      return
    }

    setSaving(true)
    try {
      const nextBranding = saveBranding({
        appName: appName.trim(),
        appLogo,
      })
      await savePricingConfig({
        billingRule,
        commissionMode,
        commissionValue,
        pricingTemplateId,
        pricingTemplates: normalizePricingTemplates(pricingTemplates),
        showDailyEncouragement,
        unsettledReminderEnabled,
        unsettledReminderDays,
        unsettledReminderMode,
        unsettledReminderMinOrders,
      })
      saveTemplateRows(templateRows)
      saveTheme({
        mode: themeMode,
        primaryColor,
        colors: {
          ...themeColors,
          [themeMode]: primaryColor,
        },
      })
      await syncBrandingToDesktopApp(nextBranding)
      setSavedSnapshotKey(currentSnapshotKey)
      setDirtyCheckReady(true)
      message.success('软件配置与主题已保存')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setAppName(defaultBranding.appName)
    setAppLogo(defaultBranding.appLogo)
    setThemeMode(defaultTheme.mode)
    setThemeColors(defaultTheme.colors)
    setPrimaryColor(defaultTheme.colors[defaultTheme.mode])
    setBillingRule(DEFAULT_PRICING_CONFIG.billingRule)
    setCommissionMode(DEFAULT_PRICING_CONFIG.commissionMode)
    setCommissionValue(DEFAULT_PRICING_CONFIG.commissionValue)
    setPricingTemplateId(DEFAULT_PRICING_CONFIG.pricingTemplateId)
    setPricingTemplates(DEFAULT_PRICING_CONFIG.pricingTemplates)
    setShowDailyEncouragement(DEFAULT_PRICING_CONFIG.showDailyEncouragement)
    setUnsettledReminderEnabled(DEFAULT_PRICING_CONFIG.unsettledReminderEnabled)
    setUnsettledReminderDays(DEFAULT_PRICING_CONFIG.unsettledReminderDays)
    setUnsettledReminderMode(DEFAULT_PRICING_CONFIG.unsettledReminderMode)
    setUnsettledReminderMinOrders(
      DEFAULT_PRICING_CONFIG.unsettledReminderMinOrders,
    )
    setTemplateRows(DEFAULT_TEMPLATE_ROWS.map((r) => ({ ...r })))
    const nextBranding = saveBranding(defaultBranding)
    await savePricingConfig(DEFAULT_PRICING_CONFIG)
    saveTemplateRows(DEFAULT_TEMPLATE_ROWS)
    saveTheme(defaultTheme)
    await syncBrandingToDesktopApp(nextBranding)
    const resetSnapshot = buildSettingsSnapshot({
      appName: defaultBranding.appName,
      appLogo: defaultBranding.appLogo,
      themeMode: defaultTheme.mode,
      primaryColor: defaultTheme.colors[defaultTheme.mode],
      themeColors: defaultTheme.colors,
      billingRule: DEFAULT_PRICING_CONFIG.billingRule,
      commissionMode: DEFAULT_PRICING_CONFIG.commissionMode,
      commissionValue: DEFAULT_PRICING_CONFIG.commissionValue,
      pricingTemplateId: DEFAULT_PRICING_CONFIG.pricingTemplateId,
      pricingTemplates: DEFAULT_PRICING_CONFIG.pricingTemplates,
      showDailyEncouragement: DEFAULT_PRICING_CONFIG.showDailyEncouragement,
      unsettledReminderEnabled: DEFAULT_PRICING_CONFIG.unsettledReminderEnabled,
      unsettledReminderDays: DEFAULT_PRICING_CONFIG.unsettledReminderDays,
      unsettledReminderMode: DEFAULT_PRICING_CONFIG.unsettledReminderMode,
      unsettledReminderMinOrders:
        DEFAULT_PRICING_CONFIG.unsettledReminderMinOrders,
      templateRows: DEFAULT_TEMPLATE_ROWS,
    })
    setSavedSnapshotKey(stringifySnapshot(resetSnapshot))
    setDirtyCheckReady(true)
    message.success('已恢复默认配置与主题')
  }

  const handleTemplateFieldChange = (index, key, value) => {
    setPricingTemplates((prev) => {
      const next = [...prev]
      const current = next[index] || {}
      const nextPatch =
        key === 'billingRule' && value === 'customSegment'
          ? {
              [key]: value,
              billingSegments: normalizeBillingSegments(
                current.billingSegments,
                DEFAULT_CUSTOM_BILLING_SEGMENTS,
              ),
            }
          : {
              [key]: value,
            }
      next[index] = {
        ...current,
        ...nextPatch,
      }
      return normalizePricingTemplates(next)
    })
  }

  const addPricingTemplate = () => {
    const id = `tpl-custom-${Date.now()}`
    setPricingTemplates((prev) =>
      normalizePricingTemplates([
        ...prev,
        {
          id,
          name: `自定义模板${prev.filter((item) => !item.builtIn).length + 1}`,
          billingRule: 'minute',
          billingSegments: normalizeBillingSegments(
            DEFAULT_CUSTOM_BILLING_SEGMENTS,
          ),
          commissionMode: 'percentage',
          commissionValue: 10,
          builtIn: false,
        },
      ]),
    )
    setPricingTemplateId(id)
  }

  const removePricingTemplate = (targetId) => {
    const remain = pricingTemplates.filter((item) => item.id !== targetId)
    const normalized = normalizePricingTemplates(remain)
    const nextId = normalizePricingTemplateId(
      pricingTemplateId === targetId ? '' : pricingTemplateId,
      normalized,
      DEFAULT_PRICING_CONFIG.pricingTemplateId,
    )
    setPricingTemplates(normalized)
    setPricingTemplateId(nextId)
  }

  const handleApplyPastedTemplate = () => {
    if (!templatePasteText.trim()) {
      message.warning('请先粘贴文字模板内容')
      return
    }

    const { rows, ignored } = parseTemplateTextRows(
      templatePasteText,
      templateRows,
    )

    if (rows.length === 0) {
      setTemplateParseResult({
        importedLabels: [],
        ignored,
      })
      message.error('没有解析到可用字段，请检查模板格式')
      return
    }

    setTemplateRows(rows)
    setTemplateParseResult({
      importedLabels: rows.map((item) => item.label),
      ignored,
    })
    if (ignored.length > 0) {
      const preview = ignored.slice(0, 2).join('；')
      message.warning(
        `已应用 ${rows.length} 个字段，忽略 ${ignored.length} 条：${preview}`,
      )
      return
    }

    message.success(`模板解析成功，已导入 ${rows.length} 个字段`)
  }

  const openSegmentEditor = (templateId) => {
    if (pricingTemplateLocked) {
      return
    }
    const target = pricingTemplates.find((item) => item.id === templateId)
    if (!target) {
      return
    }
    setSegmentEditingTemplateId(templateId)
    setSegmentRows(
      normalizeBillingSegments(
        target.billingSegments,
        DEFAULT_CUSTOM_BILLING_SEGMENTS,
      ),
    )
    setSegmentEditorOpen(true)
  }

  const updateSegmentRow = (rowIndex, patch) => {
    setSegmentRows((prev) => {
      const next = [...prev]
      next[rowIndex] = {
        ...next[rowIndex],
        ...patch,
      }
      return next
    })
  }

  const addSegmentRow = () => {
    setSegmentRows((prev) => {
      const normalized = normalizeBillingSegments(
        prev,
        DEFAULT_CUSTOM_BILLING_SEGMENTS,
      )
      const last = normalized[normalized.length - 1]
      const nextMin = Math.max(
        0,
        Number(last?.maxMinutes || last?.minMinutes || 0) + 1,
      )
      return [
        ...normalized,
        {
          id: `seg-${Date.now()}`,
          minMinutes: nextMin,
          maxMinutes: nextMin + 15,
          billableHours: 0,
        },
      ]
    })
  }

  const removeSegmentRow = (rowIndex) => {
    setSegmentRows((prev) => prev.filter((_, index) => index !== rowIndex))
  }

  const saveSegmentEditor = () => {
    if (!segmentEditingTemplateId) {
      setSegmentEditorOpen(false)
      return
    }

    const normalized = normalizeBillingSegments(
      segmentRows,
      DEFAULT_CUSTOM_BILLING_SEGMENTS,
    )

    if (!normalized.length) {
      message.warning('至少需要保留一条分段规则')
      return
    }

    const hasOverlap = normalized.some((item, index) => {
      if (index === 0) {
        return false
      }
      const prev = normalized[index - 1]
      if (prev.maxMinutes === null) {
        return true
      }
      return item.minMinutes <= prev.maxMinutes
    })

    if (hasOverlap) {
      message.error('分段区间有重叠，请调整后再保存')
      return
    }

    setPricingTemplates((prev) =>
      normalizePricingTemplates(
        prev.map((item) =>
          item.id === segmentEditingTemplateId
            ? {
                ...item,
                billingSegments: normalized,
              }
            : item,
        ),
      ),
    )
    setSegmentEditorOpen(false)
    message.success('分段规则已更新')
  }

  return (
    <section className="app-settings-page">
      <div className="app-settings-grid">
        <Card
          className="app-settings-card app-settings-main-card"
          bordered={false}
        >
          <div className="settings-branding-layout">
            <div className="settings-logo-column">
              <div className="logo-preview-wrap">
                <img src={appLogo} alt="软件 Logo" className="logo-preview" />
              </div>
              <Upload
                accept="image/*"
                maxCount={1}
                showUploadList={false}
                beforeUpload={handleUploadLogo}
              >
                <Button icon={<UploadOutlined />}>上传 Logo</Button>
              </Upload>
            </div>

            <Form layout="vertical" className="settings-form-grid">
              <Form.Item
                label="软件名称"
                required
                className="settings-form-span-2"
              >
                <Input
                  value={appName}
                  maxLength={30}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="请输入软件名称"
                />
              </Form.Item>

              <Form.Item label="主题模式">
                <Select
                  value={themeMode}
                  onChange={(value) => {
                    setThemeMode(value)
                    setPrimaryColor(
                      themeColors?.[value] || getDefaultPrimaryByMode(value),
                    )
                  }}
                  options={[
                    { value: 'light', label: '亮色模式' },
                    { value: 'dark', label: '暗色模式' },
                    { value: 'girl', label: '少女模式' },
                  ]}
                />
              </Form.Item>

              <Form.Item
                label="主题主色"
                className="settings-color-item settings-form-span-2"
              >
                <Space align="center" size={12} wrap>
                  <ColorPicker
                    value={primaryColor}
                    showText
                    onChangeComplete={(value) => {
                      const nextColor = value.toHexString()
                      setPrimaryColor(nextColor)
                      setThemeColors((prev) => ({
                        ...prev,
                        [themeMode]: nextColor,
                      }))
                    }}
                  />
                  <Typography.Text type="secondary">
                    按钮高亮、图表主线和焦点色会跟着更新。
                  </Typography.Text>
                </Space>
              </Form.Item>

              <Form.Item label="显示今日打气">
                <Switch
                  checked={showDailyEncouragement}
                  onChange={setShowDailyEncouragement}
                  checkedChildren="显示"
                  unCheckedChildren="隐藏"
                />
              </Form.Item>

              <Form.Item label="未结算提醒开关">
                <Switch
                  checked={unsettledReminderEnabled}
                  onChange={setUnsettledReminderEnabled}
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                />
              </Form.Item>

              <Form.Item label="提醒天数">
                <Select
                  value={unsettledReminderDays}
                  onChange={(value) =>
                    setUnsettledReminderDays(
                      normalizeUnsettledReminderDays(value),
                    )
                  }
                  options={[
                    { value: 1, label: '1天' },
                    { value: 2, label: '2天' },
                    { value: 3, label: '3天' },
                  ]}
                  disabled={!unsettledReminderEnabled}
                  popupMatchSelectWidth={320}
                />
              </Form.Item>

              <Form.Item label="提醒时间口径" className="settings-form-span-2">
                <Select
                  value={unsettledReminderMode}
                  onChange={(value) =>
                    setUnsettledReminderMode(
                      normalizeUnsettledReminderMode(value),
                    )
                  }
                  options={[
                    {
                      value: 'naturalDay',
                      label: '按自然日（推荐）',
                    },
                    {
                      value: 'elapsed24h',
                      label: '按满24小时',
                    },
                  ]}
                  disabled={!unsettledReminderEnabled}
                  popupMatchSelectWidth={320}
                />
              </Form.Item>

              <Form.Item label="最少未结单数才提醒">
                <InputNumber
                  min={1}
                  max={99}
                  value={unsettledReminderMinOrders}
                  onChange={(value) =>
                    setUnsettledReminderMinOrders(
                      normalizeUnsettledReminderMinOrders(value),
                    )
                  }
                  disabled={!unsettledReminderEnabled}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item className="settings-report-toggle-item">
                <Button
                  type="primary"
                  className="settings-open-report-btn"
                  onClick={openReportTemplatePanel}
                >
                  配置报单模板
                </Button>
              </Form.Item>

              <div className="settings-action-row settings-form-span-2">
                <Button type="primary" loading={saving} onClick={handleSave}>
                  保存配置
                </Button>
                <Button onClick={handleReset}>恢复默认</Button>
              </div>
            </Form>
          </div>
        </Card>

        {/*
        <Card
          className="app-settings-card app-settings-side-card app-settings-storage-card"
          bordered={false}
        >
          <Typography.Title level={5}>数据存储</Typography.Title>
          <Typography.Paragraph type="secondary">
            订单数据默认保存在本地，可切换到你指定的目录。
          </Typography.Paragraph>
          <div className="settings-data-stack">
            <Typography.Text copyable>{dataDir}</Typography.Text>
            <Button onClick={handleChooseDataDir} disabled={!dataDirSupported}>
              选择数据保存路径
            </Button>
            {!dataDirSupported && (
              <Typography.Text type="secondary">
                当前环境不支持目录选择，将使用默认本地存储。
              </Typography.Text>
            )}
          </div>
        </Card>
        */}

        <Card
          className="app-settings-card app-settings-side-card app-settings-pricing-card"
          bordered={false}
        >
          <div className="settings-side-head">
            <Typography.Title level={5}>计费模板（暂时关闭）</Typography.Title>
            <Typography.Paragraph type="secondary">
              这一块先临时封闭，当前版本请直接在接单页或补录页里选三种计费模式来用：分钟制、15分钟制、按把计费。
            </Typography.Paragraph>
            <Typography.Text type="warning">
              你现在看到的是只读内容，后续恢复开发后再开放编辑。
            </Typography.Text>
          </div>

          <div className="template-rows-list">
            {pricingTemplates.map((tpl, idx) => (
              <div key={tpl.id} className="template-row-item">
                <span className="template-row-index">{idx + 1}</span>
                <Input
                  value={tpl.name}
                  size="small"
                  style={{ width: 150 }}
                  disabled={pricingTemplateLocked}
                  onChange={(e) =>
                    handleTemplateFieldChange(idx, 'name', e.target.value)
                  }
                  placeholder="模板名"
                />
                <Select
                  size="small"
                  value={tpl.billingRule}
                  options={BILLING_RULE_OPTIONS}
                  disabled={pricingTemplateLocked}
                  onChange={(value) =>
                    handleTemplateFieldChange(idx, 'billingRule', value)
                  }
                  style={{ width: 138 }}
                  popupMatchSelectWidth={260}
                />
                {tpl.billingRule === 'customSegment' ? (
                  <Button
                    size="small"
                    disabled={pricingTemplateLocked}
                    onClick={() => openSegmentEditor(tpl.id)}
                  >
                    分段规则
                  </Button>
                ) : null}
                <Select
                  size="small"
                  value={tpl.commissionMode}
                  options={COMMISSION_MODE_OPTIONS}
                  disabled={pricingTemplateLocked}
                  onChange={(value) =>
                    handleTemplateFieldChange(idx, 'commissionMode', value)
                  }
                  style={{ width: 138 }}
                  popupMatchSelectWidth={260}
                />
                <InputNumber
                  size="small"
                  min={0}
                  step={tpl.commissionMode === 'fixed' ? 1 : 5}
                  value={tpl.commissionValue}
                  disabled={pricingTemplateLocked}
                  onChange={(value) =>
                    handleTemplateFieldChange(
                      idx,
                      'commissionValue',
                      Number(value || 0),
                    )
                  }
                  style={{ width: 104 }}
                  addonAfter={tpl.commissionMode === 'fixed' ? '元/时' : '%'}
                />
                <Button
                  type={pricingTemplateId === tpl.id ? 'primary' : 'default'}
                  size="small"
                  disabled={pricingTemplateLocked}
                  onClick={() => setPricingTemplateId(tpl.id)}
                >
                  设为默认
                </Button>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  disabled={
                    pricingTemplateLocked ||
                    tpl.builtIn ||
                    pricingTemplates.length <= 1
                  }
                  onClick={() => removePricingTemplate(tpl.id)}
                />
              </div>
            ))}
          </div>

          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            disabled={pricingTemplateLocked}
            onClick={addPricingTemplate}
            style={{ marginTop: 8 }}
          >
            新增计费模板
          </Button>
        </Card>
      </div>

      <Drawer
        title="报单模板配置"
        placement="right"
        width={640}
        open={reportTemplateVisible}
        onClose={() => {
          setReportTemplateVisible(false)
          setReportTemplateFocused(false)
        }}
        maskClosable
        className="settings-report-drawer"
      >
        <div
          className={`settings-report-drawer-body ${
            reportTemplateFocused ? 'is-focus-pulse' : ''
          }`}
        >
          <div className="settings-side-head">
            <Typography.Title level={5}>报单模板</Typography.Title>
            <Typography.Paragraph type="secondary">
              在这里设置你报单要填的内容，带「自动」标记的会帮你自动填好，不用手打。你也可以给每项设个兜底值，万一自动没拿到就用它顶上。
            </Typography.Paragraph>
          </div>

          <div className="template-paste-section">
            <Typography.Text strong>粘贴文字模板</Typography.Text>
            <TextArea
              rows={5}
              value={templatePasteText}
              onChange={(e) => setTemplatePasteText(e.target.value)}
              placeholder={
                '示例：\n老板：{{老板}}\n接单群：{{接单群}}\n备注：(待填写)\n结算状态：未结算'
              }
            />
            <Space size={8} wrap>
              <Button type="primary" onClick={handleApplyPastedTemplate}>
                过滤并应用字段
              </Button>
              <Button
                onClick={() => {
                  setTemplatePasteText('')
                  setTemplateParseResult(null)
                }}
              >
                清空粘贴区
              </Button>
              <Typography.Text type="secondary">
                会自动过滤空行、无效字段名、重复字段，并保留可识别文本字段。
              </Typography.Text>
            </Space>

            {templateParseResult ? (
              <div className="template-parse-result">
                <Typography.Text strong>
                  字段核对结果：识别 {templateParseResult.importedLabels.length}
                  项，忽略 {templateParseResult.ignored.length} 项
                </Typography.Text>
                {templateParseResult.importedLabels.length > 0 ? (
                  <div className="template-parse-tags">
                    {templateParseResult.importedLabels.map((label) => (
                      <Tag key={label} color="blue">
                        {label}
                      </Tag>
                    ))}
                  </div>
                ) : null}
                {templateParseResult.ignored.length > 0 ? (
                  <div className="template-parse-ignored">
                    {templateParseResult.ignored.map((item, index) => (
                      <Typography.Text type="warning" key={`${item}-${index}`}>
                        {item}
                      </Typography.Text>
                    ))}
                  </div>
                ) : (
                  <Typography.Text type="success">
                    未发现异常字段，全部已通过核对。
                  </Typography.Text>
                )}
              </div>
            ) : null}
          </div>

          <div className="template-rows-list">
            {templateRows.map((row, idx) => (
              <div key={idx} className="template-row-item">
                <span className="template-row-index">{idx + 1}</span>
                <Input
                  value={row.label}
                  onChange={(e) => {
                    const next = [...templateRows]
                    next[idx] = { ...next[idx], label: e.target.value }
                    setTemplateRows(next)
                  }}
                  placeholder="填什么"
                  style={{ width: 90 }}
                  size="small"
                />
                {AUTO_VARIABLES[row.label] ? (
                  <Tag color="blue" style={{ margin: 0, flexShrink: 0 }}>
                    自动
                  </Tag>
                ) : (
                  <Tag style={{ margin: 0, flexShrink: 0 }}>手填</Tag>
                )}
                <Input
                  value={row.defaultValue}
                  onChange={(e) => {
                    const next = [...templateRows]
                    next[idx] = { ...next[idx], defaultValue: e.target.value }
                    setTemplateRows(next)
                  }}
                  placeholder={
                    AUTO_VARIABLES[row.label]
                      ? '自动没拿到时用这个顶上'
                      : '默认填这个'
                  }
                  size="small"
                  style={{ flex: 1, minWidth: 60 }}
                />
                <Tooltip title={row.required ? '必填' : '选填'}>
                  <Switch
                    checked={row.required}
                    onChange={(checked) => {
                      const next = [...templateRows]
                      next[idx] = { ...next[idx], required: checked }
                      setTemplateRows(next)
                    }}
                    checkedChildren="必填"
                    unCheckedChildren="选填"
                    size="small"
                  />
                </Tooltip>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    setTemplateRows((prev) => prev.filter((_, i) => i !== idx))
                  }}
                />
              </div>
            ))}
          </div>

          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => {
              setTemplateRows((prev) => [
                ...prev,
                {
                  label: '',
                  source: 'auto',
                  defaultValue: '',
                  required: false,
                },
              ])
            }}
            style={{ marginTop: 8 }}
          >
            加一项
          </Button>

          <div className="template-preview-section">
            <Typography.Text
              strong
              style={{ display: 'block', marginBottom: 4 }}
            >
              报单长这样
            </Typography.Text>
            <pre className="template-preview-box">
              {templateRows
                .map(
                  (r) =>
                    `${r.label}：${AUTO_VARIABLES[r.label] ? `【${AUTO_VARIABLES[r.label]}】` : r.defaultValue || '(待填写)'}`,
                )
                .join('\n')}
            </pre>
          </div>

          <Typography.Text
            type="secondary"
            style={{ display: 'block', marginTop: 8 }}
          >
            这些内容会自动帮你填好：{Object.keys(AUTO_VARIABLES).join('、')}
          </Typography.Text>
        </div>
      </Drawer>

      <Modal
        title="编辑分段计费规则"
        open={segmentEditorOpen}
        onCancel={() => setSegmentEditorOpen(false)}
        onOk={saveSegmentEditor}
        okText="保存分段规则"
        cancelText="取消"
        width={760}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 10 }}>
          示例：10-15分钟记0.25小时，16-30分钟记0.5小时。最后一段可将“最大分钟”留空表示不限上限。
        </Typography.Paragraph>
        <div className="template-rows-list" style={{ maxHeight: 360 }}>
          {segmentRows.map((item, index) => (
            <div className="template-row-item" key={item.id || index}>
              <span className="template-row-index">{index + 1}</span>
              <InputNumber
                size="small"
                min={0}
                value={item.minMinutes}
                onChange={(value) =>
                  updateSegmentRow(index, {
                    minMinutes: Math.max(0, Number(value || 0)),
                  })
                }
                style={{ width: 120 }}
                addonAfter="起始分钟"
              />
              <InputNumber
                size="small"
                min={0}
                value={item.maxMinutes}
                onChange={(value) =>
                  updateSegmentRow(index, {
                    maxMinutes:
                      value === null || value === undefined || value === ''
                        ? null
                        : Math.max(0, Number(value || 0)),
                  })
                }
                style={{ width: 120 }}
                placeholder="留空=不限"
                addonAfter="最大分钟"
              />
              <InputNumber
                size="small"
                min={0}
                step={0.05}
                value={item.billableHours}
                onChange={(value) =>
                  updateSegmentRow(index, {
                    billableHours: Math.max(0, Number(value || 0)),
                  })
                }
                style={{ width: 130 }}
                addonAfter="计费小时"
              />
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => removeSegmentRow(index)}
              />
            </div>
          ))}
        </div>
        <Button
          style={{ marginTop: 10 }}
          icon={<PlusOutlined />}
          onClick={addSegmentRow}
          block
          type="dashed"
        >
          新增分段
        </Button>
      </Modal>
    </section>
  )
}

export default AppSettingsPage
