import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  ColorPicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
  Upload,
  message,
} from 'antd'
import { UploadOutlined } from '@ant-design/icons'
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
  chooseDataStorageDirectory,
  getDataStorageConfig,
  savePricingConfig,
} from '../../utils/orderStorage'
import {
  BILLING_RULE_OPTIONS,
  COMMISSION_MODE_OPTIONS,
  DEFAULT_PRICING_CONFIG,
} from '../../utils/pricing'
import authorFeedbackQr from '../../../build/kxy_erweima.jpg'
import './AppSettingsPage.css'

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

function AppSettingsPage() {
  const current = loadBranding()
  const currentTheme = loadTheme()
  const [appName, setAppName] = useState(current.appName)
  const [appLogo, setAppLogo] = useState(current.appLogo)
  const [themeMode, setThemeMode] = useState(currentTheme.mode)
  const [themeColors, setThemeColors] = useState(currentTheme.colors)
  const [primaryColor, setPrimaryColor] = useState(
    currentTheme.colors?.[currentTheme.mode] || currentTheme.primaryColor,
  )
  const [dataDir, setDataDir] = useState('读取中...')
  const [dataDirSupported, setDataDirSupported] = useState(false)
  const [billingRule, setBillingRule] = useState(
    DEFAULT_PRICING_CONFIG.billingRule,
  )
  const [commissionMode, setCommissionMode] = useState(
    DEFAULT_PRICING_CONFIG.commissionMode,
  )
  const [commissionValue, setCommissionValue] = useState(
    DEFAULT_PRICING_CONFIG.commissionValue,
  )
  const [saving, setSaving] = useState(false)

  const loadDataDirConfig = async () => {
    const config = await getDataStorageConfig()
    setDataDir(config.dataDir || '未设置')
    setDataDirSupported(Boolean(config.supported))
    setBillingRule(config.billingRule || DEFAULT_PRICING_CONFIG.billingRule)
    setCommissionMode(
      config.commissionMode || DEFAULT_PRICING_CONFIG.commissionMode,
    )
    setCommissionValue(
      Number(config.commissionValue || DEFAULT_PRICING_CONFIG.commissionValue),
    )
  }

  useEffect(() => {
    loadDataDirConfig()
  }, [])

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
      })
      saveTheme({
        mode: themeMode,
        primaryColor,
        colors: {
          ...themeColors,
          [themeMode]: primaryColor,
        },
      })
      await syncBrandingToDesktopApp(nextBranding)
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
    const nextBranding = saveBranding(defaultBranding)
    await savePricingConfig(DEFAULT_PRICING_CONFIG)
    saveTheme(defaultTheme)
    await syncBrandingToDesktopApp(nextBranding)
    message.success('已恢复默认配置与主题')
  }

  const handleChooseDataDir = async () => {
    const result = await chooseDataStorageDirectory()
    if (!result.supported) {
      message.info('当前环境不支持目录选择，已使用本地存储')
      return
    }

    if (result.canceled) {
      return
    }

    setDataDir(result.dataDir || '未设置')
    message.success('数据保存目录已更新')
  }

  return (
    <section className="app-settings-page">
      <div className="settings-hero">
        <div>
          <h2>软件设置</h2>
        </div>
        <div className="settings-hero-badges">
          <span>{`当前主题 ${themeMode === 'girl' ? '少女模式' : themeMode === 'dark' ? '暗色模式' : '亮色模式'}`}</span>
          <span>{`主色 ${primaryColor}`}</span>
          <span>
            {dataDirSupported ? '支持自定义数据目录' : '当前为本地存储模式'}
          </span>
        </div>
      </div>

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
              <Form.Item label="软件名称" required>
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

              <Form.Item label="主题主色" className="settings-color-item">
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

              <Form.Item label="默认计费规则">
                <Select
                  value={billingRule}
                  onChange={setBillingRule}
                  options={BILLING_RULE_OPTIONS}
                />
              </Form.Item>

              <Form.Item label="默认抽成方式">
                <Select
                  value={commissionMode}
                  onChange={setCommissionMode}
                  options={COMMISSION_MODE_OPTIONS}
                />
              </Form.Item>

              <Form.Item label="默认抽成数值" className="settings-pricing-item">
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <InputNumber
                    min={0}
                    step={commissionMode === 'fixed' ? 1 : 5}
                    value={commissionValue}
                    onChange={(value) => setCommissionValue(Number(value || 0))}
                    style={{ width: '100%' }}
                    addonAfter={commissionMode === 'fixed' ? '元/小时' : '%'}
                    placeholder={
                      commissionMode === 'fixed'
                        ? '请输入每小时抽成金额'
                        : '请输入抽成比例'
                    }
                  />
                  <Typography.Text type="secondary">
                    {commissionMode === 'fixed'
                      ? '新订单会按每小时固定金额扣抽成。'
                      : '新订单会按结算金额比例扣抽成。'}
                  </Typography.Text>
                </Space>
              </Form.Item>

              <div className="settings-action-row">
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
          className="app-settings-card app-settings-side-card app-feedback-card"
          bordered={false}
        >
          <div className="feedback-head">
            <div>
              <Typography.Title level={5}>联系作者</Typography.Title>
              <Typography.Paragraph type="secondary">
                如果你有功能需求、使用建议，或者觉得这款软件对你有帮助，可以添加作者微信反馈交流，也欢迎扫码打赏支持继续更新。
              </Typography.Paragraph>
            </div>
          </div>

          <div className="feedback-qr-wrap">
            <img
              src={authorFeedbackQr}
              alt="作者微信二维码"
              className="feedback-qr-image"
            />
          </div>

          <Typography.Text type="secondary" className="feedback-note">
            扫码后可直接联系作者。
          </Typography.Text>
        </Card>
      </div>
    </section>
  )
}

export default AppSettingsPage
