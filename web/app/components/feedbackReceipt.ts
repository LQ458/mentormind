export type FeedbackReceiptLang = 'zh' | 'en'

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function feedbackReceiptContextLines(
  context: Record<string, unknown>,
  lang: FeedbackReceiptLang,
): string[] {
  const lines: string[] = []
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

  return lines
}
