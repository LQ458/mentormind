export type FeedbackReceiptLang = 'zh' | 'en'

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringValue(value: unknown, max = 160): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export function feedbackReceiptContextLines(
  context: Record<string, unknown>,
  lang: FeedbackReceiptLang,
): string[] {
  const lines: string[] = []
  const route = stringValue(context.route, 160)
  const url = stringValue(context.url, 240)
  const capturedAt = stringValue(context.captured_at, 40)

  if (route) {
    lines.push(`${lang === 'zh' ? '页面路径' : 'Route'}: ${route}`)
  }
  if (url && url !== route) {
    lines.push(`${lang === 'zh' ? '页面 URL' : 'URL'}: ${url}`)
  }
  if (capturedAt) {
    lines.push(`${lang === 'zh' ? '记录时间' : 'Captured'}: ${capturedAt}`)
  }

  const build = objectValue(context.build)
  const sha = stringValue(build?.sha, 40)
  const tag = stringValue(build?.image_tag, 80)
  const buildText = [sha, tag].filter(Boolean).join(' / ')
  if (buildText) {
    lines.push(`${lang === 'zh' ? '版本' : 'Build'}: ${buildText}`)
  }

  const viewport = objectValue(context.viewport)
  const width = typeof viewport?.width === 'number' ? viewport.width : null
  const height = typeof viewport?.height === 'number' ? viewport.height : null
  if (width && height) {
    lines.push(`${lang === 'zh' ? '设备' : 'Device'}: ${width}x${height}`)
  }

  const browser = objectValue(context.browser)
  const family = typeof browser?.family === 'string' ? browser.family : ''
  const language = typeof browser?.language === 'string' ? browser.language : ''
  const mobile = typeof browser?.mobile === 'boolean'
    ? (browser.mobile ? 'mobile' : 'desktop')
    : ''
  const browserText = [family, mobile, language].filter(Boolean).join(' / ')
  if (browserText) {
    lines.push(`${lang === 'zh' ? '浏览器' : 'Browser'}: ${browserText}`)
  }

  const recentErrors = Array.isArray(context.recent_errors) ? context.recent_errors.length : 0
  if (recentErrors > 0) {
    lines.push(`${lang === 'zh' ? '最近错误数' : 'Recent errors'}: ${recentErrors}`)
  }

  return lines
}
