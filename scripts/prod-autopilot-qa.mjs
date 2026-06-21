#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

function loadPlaywright() {
  try {
    const requireFromCwd = createRequire(path.join(process.cwd(), 'package.json'))
    return requireFromCwd('playwright')
  } catch (error) {
    const message = error?.code === 'MODULE_NOT_FOUND'
      ? 'Playwright is not installed in the current working directory. Run this from web/ after pnpm install, or install web dependencies first.'
      : `Could not load Playwright from ${process.cwd()}: ${error?.message || error}`
    throw new Error(message)
  }
}

const { chromium } = loadPlaywright()

const BASE_URL = (process.env.BASE_URL || 'https://mentormind.cloud').replace(/\/$/, '')
const RUN_ID = `prod-autopilot-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`
const OUT_DIR = path.resolve(process.cwd(), process.env.OUT_DIR || `.browser-sessions/prod-autopilot-qa/${RUN_ID}`)
const PRESSURE_CONCURRENCY = Number(process.env.PRESSURE_CONCURRENCY || 8)
const PRESSURE_REQUESTS = Number(process.env.PRESSURE_REQUESTS || 80)
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 90000)
const RUN_PERSONA_QA = process.env.RUN_PERSONA_QA !== 'false'
const PERSONA_LIMIT = Number(process.env.PERSONA_LIMIT || 4)
const QA_INVITE_CODE = process.env.QA_INVITE_CODE || ''
const QA_USERNAME_PROVIDED = Boolean(process.env.QA_USERNAME)
const QA_PASSWORD_PROVIDED = Boolean(process.env.QA_PASSWORD)
const QA_USERNAME = process.env.QA_USERNAME || `qa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
const QA_PASSWORD = process.env.QA_PASSWORD || `qa_${Math.random().toString(36).slice(2, 10)}`
const QA_IMAGE_FIXTURE = process.env.QA_IMAGE_FIXTURE || ''
const QA_AUDIO_FIXTURE = process.env.QA_AUDIO_FIXTURE || ''
const QA_PDF_FIXTURE = process.env.QA_PDF_FIXTURE || ''
const QA_TEXT_FIXTURE = process.env.QA_TEXT_FIXTURE || ''
const QA_IMAGE_FIXTURES = splitEnvList(process.env.QA_IMAGE_FIXTURES || QA_IMAGE_FIXTURE)
const QA_AUDIO_FIXTURES = splitEnvList(process.env.QA_AUDIO_FIXTURES || QA_AUDIO_FIXTURE)
const QA_PDF_FIXTURES = splitEnvList(process.env.QA_PDF_FIXTURES || QA_PDF_FIXTURE)
const QA_TEXT_FIXTURES = splitEnvList(process.env.QA_TEXT_FIXTURES || QA_TEXT_FIXTURE)
const RUN_DEEP_WORKFLOW_QA = process.env.RUN_DEEP_WORKFLOW_QA !== 'false'
const RUN_SEMINAR_QA = process.env.RUN_SEMINAR_QA !== 'false'
const RUN_BOARD_QA = process.env.RUN_BOARD_QA !== 'false'
const RUN_VISUAL_QA = process.env.RUN_VISUAL_QA !== 'false'
const RUN_ADMIN_QA = process.env.RUN_ADMIN_QA === 'true'
const QA_RUN_UPLOAD_UI = process.env.QA_RUN_UPLOAD_UI !== 'false'
const QA_POST_FINDINGS = process.env.QA_POST_FINDINGS !== 'false'
const QA_POST_DIAGNOSTICS = process.env.QA_POST_DIAGNOSTICS === 'true'

const findings = []
const events = []
let authSession = null

function nowIso() {
  return new Date().toISOString()
}

function sanitizeName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'artifact'
}

function stableFindingKey({ title, surface, page, expected }) {
  const seed = [
    surface || 'global',
    page || '/',
    title || '',
    expected || '',
  ].join('\n')
  return createHash('sha1').update(seed).digest('hex').slice(0, 12)
}

function boundedJson(value, maxLength = 5000) {
  let text = ''
  try {
    text = JSON.stringify(value ?? {}, null, 2)
  } catch {
    text = String(value)
  }
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`
}

function splitEnvList(value) {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function authTokenFromResponse(res, data) {
  if (typeof data?.token === 'string' && data.token) return data.token
  const setCookie = res.headers.get('set-cookie') || ''
  const match = setCookie.match(/(?:^|,\s*)mm_token=([^;,\s]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function collectZhUiTextLeaks(route, text) {
  const leaks = []
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (route === '/lessons' || route === '/study-plan') {
    const rawMetadata = lines.filter((line) => /^(math|ap|ready)$/i.test(line))
    if (rawMetadata.length) {
      leaks.push({
        kind: 'raw_metadata',
        values: [...new Set(rawMetadata)],
      })
    }
  }
  if (route === '/admin/feedback') {
    const rawAccessText = []
    if (/Sign in required/i.test(text)) rawAccessText.push('Sign in required')
    if (/admin only/i.test(text)) rawAccessText.push('admin only')
    if (rawAccessText.length) {
      leaks.push({
        kind: 'raw_access_denial',
        values: rawAccessText,
      })
    }
  }
  return leaks
}

function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return Math.round(sorted[idx])
}

function compactTelemetryValue(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.length > 900 ? `${value.slice(0, 900)}...[truncated ${value.length - 900} chars]` : value
  if (depth >= 4) {
    const text = JSON.stringify(value)
    return text.length > 900 ? `${text.slice(0, 900)}...[truncated]` : text
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, 8).map((item) => compactTelemetryValue(item, depth + 1))
    if (value.length > 8) items.push(`[truncated ${value.length - 8} items]`)
    return items
  }
  if (typeof value === 'object') {
    const compact = {}
    const entries = Object.entries(value).slice(0, 28)
    for (const [key, nested] of entries) {
      compact[key.slice(0, 80)] = compactTelemetryValue(nested, depth + 1)
    }
    const remaining = Object.keys(value).length - entries.length
    if (remaining > 0) compact.__truncated_keys = remaining
    return compact
  }
  return String(value).slice(0, 900)
}

async function postTelemetry(eventType, page, payload, latencyMs = null) {
  const isFinding = eventType === 'feedback_moment'
  if (isFinding && !QA_POST_FINDINGS) {
    events.push({ type: 'telemetry_skipped', eventType, page, reason: 'QA_POST_FINDINGS=false' })
    return true
  }
  if (!isFinding && !QA_POST_DIAGNOSTICS) {
    events.push({ type: 'telemetry_skipped', eventType, page, reason: 'QA_POST_DIAGNOSTICS=false' })
    return true
  }

  const body = {
    session_id: RUN_ID,
    event_type: eventType,
    page,
    url: `${BASE_URL}${page}`,
    latency_ms: latencyMs,
    payload: {
      source: 'prod_autopilot_qa',
      run_id: RUN_ID,
      ...compactTelemetryValue(payload),
    },
  }
  try {
    const res = await fetch(`${BASE_URL}/api/backend/telemetry/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    events.push({ type: 'telemetry_post', eventType, page, status: res.status, text: text.slice(0, 300) })
    return res.ok
  } catch (error) {
    events.push({ type: 'telemetry_post_failed', eventType, page, error: String(error) })
    return false
  }
}

async function ensureAuthSession() {
  if (authSession) return authSession
  const canLoginExistingAccount = QA_USERNAME_PROVIDED && QA_PASSWORD_PROVIDED
  if (!QA_INVITE_CODE && !canLoginExistingAccount) {
    events.push({ type: 'auth_skipped', reason: 'QA_INVITE_CODE or QA_USERNAME/QA_PASSWORD not provided' })
    return null
  }
  const authBody = {
    username: QA_USERNAME,
    password: QA_PASSWORD,
    language: 'zh',
  }
  if (QA_INVITE_CODE) authBody.invite_code = QA_INVITE_CODE
  let res = await fetch(`${BASE_URL}/api/backend/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authBody),
  })
  let data = await res.json().catch(() => ({}))
  let token = authTokenFromResponse(res, data)
  if (QA_INVITE_CODE && res.status === 409) {
    res = await fetch(`${BASE_URL}/api/backend/auth/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: QA_USERNAME, password: QA_PASSWORD, language: 'zh' }),
    })
    data = await res.json().catch(() => ({}))
    token = authTokenFromResponse(res, data)
  }
  if (!res.ok || !token) {
    await addFinding({
      title: 'Could not create/login production QA account',
      severity: 'blocked',
      surface: 'auth',
      page: '/auth',
      expected: QA_INVITE_CODE
        ? 'QA harness should be able to create or reuse a disposable account through invite auth.'
        : 'QA harness should be able to login with the provided QA_USERNAME and QA_PASSWORD.',
      evidence: { status: res.status, data, username: QA_USERNAME },
      report: true,
    })
    return null
  }
  authSession = {
    token,
    user: {
      id: data.user?.id || '',
      username: data.user?.username || QA_USERNAME,
      email: `${data.user?.username || QA_USERNAME}@mentormind.local`,
      firstName: data.user?.username || QA_USERNAME,
      fullName: data.user?.username || QA_USERNAME,
    },
  }
  events.push({ type: 'auth_ready', username: authSession.user.username, userId: authSession.user.id })
  await postTelemetry('interaction', '/auth', {
    schema: 'mentormind.prod_autopilot_auth_ready.v1',
    username: authSession.user.username,
    user_id: authSession.user.id,
  })
  return authSession
}

async function addFinding({ title, severity = 'wrong', surface = 'global', page = '/', expected = '', evidence = {}, report = true }) {
  const bugKey = stableFindingKey({ title, surface, page, expected })
  const reportId = `qa-${bugKey}`
  const finding = {
    id: `BUG-${String(findings.length + 1).padStart(3, '0')}`,
    report_id: reportId,
    bug_key: bugKey,
    title,
    severity,
    surface,
    page,
    expected,
    evidence,
    created_at: nowIso(),
  }
  findings.push(finding)
  if (report) {
    await postTelemetry('feedback_moment', page, {
      schema: 'mentormind.prod_autopilot_bug.v1',
      feedback_kind: 'bug',
      surface,
      interaction_id: `${RUN_ID}:${finding.id}`,
      report_id: reportId,
      severity,
      user_note: title,
      expected_behavior: expected,
      context: {
        run_id: RUN_ID,
        bug_key: bugKey,
        report_id: reportId,
        evidence,
        route: page,
        base_url: BASE_URL,
      },
    })
  }
  return finding
}

function findingIssueMarkdown(finding) {
  const labels = [
    `severity:${finding.severity}`,
    `surface:${finding.surface}`,
    'source:prod-autopilot-qa',
  ]
  return [
    `# ${finding.title}`,
    ``,
    `## Summary`,
    `- Report ID: ${finding.report_id}`,
    `- Bug key: ${finding.bug_key}`,
    `- Run ID: ${RUN_ID}`,
    `- Severity: ${finding.severity}`,
    `- Surface: ${finding.surface}`,
    `- Page: ${finding.page}`,
    `- Created: ${finding.created_at}`,
    `- Labels: ${labels.join(', ')}`,
    ``,
    `## Expected behavior`,
    finding.expected || 'n/a',
    ``,
    `## Evidence`,
    `\`\`\`json`,
    boundedJson(finding.evidence),
    `\`\`\``,
    ``,
    `## Reproduction`,
    `Run the production QA harness and inspect the report artifacts for \`${finding.id}\`:`,
    `\`\`\`bash`,
    `cd web`,
    `BASE_URL=${BASE_URL} QA_USERNAME=<username> QA_PASSWORD=<password> pnpm run qa:prod`,
    `\`\`\``,
    ``,
  ].join('\n')
}

function hasAuthSession() {
  return Boolean(authSession?.token)
}

function isExpectedUnauthedProbe(msg) {
  const text = msg.text()
  const location = msg.location()
  return msg.type() === 'error'
    && /status of 401/i.test(text)
    && /\/api\/backend\/users\/me(?:\?|$)/.test(location?.url || '')
    && !hasAuthSession()
}

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, `${sanitizeName(name)}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function createObservedPage(browser, viewport) {
  const context = await browser.newContext({
    viewport: viewport.size,
    locale: viewport.locale || 'zh-CN',
    userAgent: viewport.userAgent,
  })
  if (authSession?.token) {
    await context.addCookies([{
      name: 'mm_token',
      value: authSession.token,
      url: BASE_URL,
      sameSite: 'Lax',
      secure: BASE_URL.startsWith('https://'),
      httpOnly: false,
    }])
    await context.addInitScript(({ token, user }) => {
      try {
        window.localStorage.setItem('mm_token', token)
        window.localStorage.setItem('mm_user', JSON.stringify(user))
      } catch {}
    }, { token: authSession.token, user: authSession.user })
  }
  const page = await context.newPage()
  const observed = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    serverErrors: [],
  }
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      if (isExpectedUnauthedProbe(msg)) {
        return
      }
      observed.consoleErrors.push({ text: msg.text().slice(0, 1000), location: msg.location() })
    }
  })
  page.on('pageerror', (error) => {
    observed.pageErrors.push(String(error).slice(0, 1000))
  })
  page.on('requestfailed', (request) => {
    observed.failedRequests.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText,
    })
  })
  page.on('response', (response) => {
    const status = response.status()
    if (status >= 500) {
      observed.serverErrors.push({
        status,
        url: response.url(),
      })
    }
  })
  return { context, page, observed }
}

async function checkPage(browser, route, viewport) {
  const { context, page, observed } = await createObservedPage(browser, viewport)
  const started = performance.now()
  let status = null
  let finalUrl = null
  let shot = null
  try {
    const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 45000 })
    status = res?.status() ?? null
    finalUrl = page.url()
    await page.waitForTimeout(700)
    shot = await screenshot(page, `${viewport.name}-${route === '/' ? 'home' : route}`)
    const metrics = await page.evaluate(() => ({
      title: document.title,
      bodyTextLength: document.body?.innerText?.trim().length || 0,
      h1: document.querySelector('h1')?.textContent?.trim() || '',
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      buttons: [...document.querySelectorAll('button')].slice(0, 20).map((b) => b.textContent?.trim()).filter(Boolean),
      inputs: [...document.querySelectorAll('input')].slice(0, 12).map((input) => ({
        type: input.getAttribute('type') || '',
        placeholder: input.getAttribute('placeholder') || '',
        autocomplete: input.getAttribute('autocomplete') || '',
        name: input.getAttribute('name') || '',
      })),
    }))
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const zhUiTextLeaks = collectZhUiTextLeaks(route, bodyText)
    const latency = Math.round(performance.now() - started)
    events.push({ type: 'page_check', route, viewport: viewport.name, status, latency, finalUrl, metrics, observed, screenshot: shot })
    await postTelemetry('interaction', route, {
      schema: 'mentormind.prod_autopilot_page_check.v1',
      viewport: viewport.name,
      status,
      latency,
      metrics,
      observed_counts: {
        consoleErrors: observed.consoleErrors.length,
        pageErrors: observed.pageErrors.length,
        failedRequests: observed.failedRequests.length,
        serverErrors: observed.serverErrors.length,
      },
    }, latency)
    if (!status || status >= 500) {
      await addFinding({
        title: `${route} returned server error in ${viewport.name}`,
        severity: 'blocked',
        surface: 'routing',
        page: route,
        expected: 'Every primary page should load without 5xx errors.',
        evidence: { status, finalUrl, viewport: viewport.name, screenshot: shot, observed },
      })
    }
    const isRedirectedHome = route !== '/' && /[?&]redirect=/.test(finalUrl || '')
    if (isRedirectedHome) {
      await addFinding({
        title: `${route} redirected to home instead of opening product flow in ${viewport.name}`,
        severity: 'blocked',
        surface: 'auth',
        page: route,
        expected: 'Authenticated QA sessions should be able to open protected product routes directly.',
        evidence: { status, finalUrl, viewport: viewport.name, metrics, screenshot: shot },
      })
    }
    if (route !== '/' && metrics.bodyTextLength < 80) {
      await addFinding({
        title: `${route} looked nearly blank in ${viewport.name}`,
        severity: 'visual',
        surface: 'visual',
        page: route,
        expected: 'Primary pages should render meaningful visible content.',
        evidence: { status, finalUrl, viewport: viewport.name, metrics, screenshot: shot },
      })
    }
    if (route === '/' && !hasAuthSession() && viewport.name === 'iphone') {
      const inputText = JSON.stringify(metrics.inputs || []).toLowerCase()
      const hasUsername = /username|用户名/.test(inputText)
      const hasPassword = (metrics.inputs || []).some((input) => (
        input.type === 'password' || /password|密码/.test(`${input.placeholder} ${input.autocomplete}`.toLowerCase())
      ))
      const hasInvite = /invite|邀请码/.test(inputText)
      if (!(hasUsername && hasPassword && hasInvite)) {
        await addFinding({
          title: 'Production home page does not expose direct tester login fields on mobile',
          severity: 'blocked',
          surface: 'auth',
          page: '/',
          expected: 'The public home page should show username, password, and invite-code fields so testers can start without hunting for login.',
          evidence: { status, finalUrl, viewport: viewport.name, metrics, screenshot: shot },
        })
      }
    }
    if (metrics.scrollWidth > metrics.clientWidth + 8) {
      await addFinding({
        title: `${route} has horizontal overflow in ${viewport.name}`,
        severity: 'visual',
        surface: 'responsive',
        page: route,
        expected: 'Mobile/tablet layouts should not require horizontal scrolling.',
        evidence: { status, finalUrl, viewport: viewport.name, metrics, screenshot: shot },
      })
    }
    if (observed.serverErrors.length) {
      await addFinding({
        title: `${route} triggered ${observed.serverErrors.length} 5xx subrequest(s) in ${viewport.name}`,
        severity: 'wrong',
        surface: 'network',
        page: route,
        expected: 'Primary page subrequests should not return 5xx.',
        evidence: { status, finalUrl, viewport: viewport.name, serverErrors: observed.serverErrors, screenshot: shot },
      })
    }
    for (const leak of zhUiTextLeaks) {
      await addFinding({
        title: `${route} leaks untranslated UI text in zh locale (${viewport.name})`,
        severity: 'wrong',
        surface: 'i18n',
        page: route,
        expected: 'Chinese UI should show localized user-facing labels, not raw enum values or backend access messages.',
        evidence: {
          status,
          finalUrl,
          viewport: viewport.name,
          leak,
          bodySnippet: bodyText.slice(0, 1800),
          screenshot: shot,
        },
      })
    }
  } catch (error) {
    await addFinding({
      title: `${route} failed to load in ${viewport.name}`,
      severity: 'blocked',
      surface: 'routing',
      page: route,
      expected: 'Primary pages should load within the timeout.',
      evidence: { error: String(error), status, finalUrl, viewport: viewport.name, screenshot: shot },
    })
  } finally {
    await context.close()
  }
}

async function findTextbox(page) {
  const candidates = [
    () => page.getByRole('textbox').first(),
    () => page.locator('textarea').first(),
    () => page.locator('input[type="text"]').first(),
  ]
  for (const get of candidates) {
    const locator = get()
    if (await locator.count().catch(() => 0)) {
      if (await locator.first().isVisible().catch(() => false)) return locator.first()
    }
  }
  return null
}

async function clickFirstVisible(page, locators) {
  for (const locator of locators) {
    if (await locator.count().catch(() => 0)) {
      const first = locator.first()
      if (await first.isVisible().catch(() => false)) {
        await first.click()
        return true
      }
    }
  }
  return false
}

async function fileExists(filePath) {
  if (!filePath) return false
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

async function submitAskQuestion(page, prompt) {
  const textBox = await findTextbox(page)
  if (!textBox) return false
  await textBox.fill(prompt)
  return await clickFirstVisible(page, [
    page.getByRole('button', { name: /^(问 Mina|Ask Mina)$/i }),
    page.locator('button').filter({ hasText: /^(问 Mina|Ask Mina)$/i }),
    page.locator('button[type="submit"]'),
  ])
}

async function waitForAskAnswer(page) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText
      return /下一步|继续讨论|Next|Continue the Discussion|轮到你|Your Turn|写下你的答案|Write Your Attempt/i.test(text)
        || /上传失败|Upload failed|Failed to answer|网络错误|Network error/i.test(text)
    },
    { timeout: AI_TIMEOUT_MS },
  ).catch(() => null)
  await page.waitForTimeout(900)
  return await page.locator('body').innerText()
}

async function setStudyDays(page, desiredDays) {
  const dayLabels = {
    mon: ['Mon', '周一'],
    tue: ['Tue', '周二'],
    wed: ['Wed', '周三'],
    thu: ['Thu', '周四'],
    fri: ['Fri', '周五'],
    sat: ['Sat', '周六'],
    sun: ['Sun', '周日'],
  }
  const current = new Set()
  const desired = new Set(desiredDays)
  for (const [value, labels] of Object.entries(dayLabels)) {
    const shouldBeActive = desired.has(value)
    const isActive = current.has(value)
    if (shouldBeActive !== isActive) {
      await clickFirstVisible(page, labels.map((label) => (
        page.locator('button').filter({ hasText: new RegExp(`^${label}$`) })
      )))
      if (shouldBeActive) current.add(value)
      else current.delete(value)
      await page.waitForTimeout(80)
    }
  }
}

function localizedStudyPlanValue(value) {
  const labels = {
    'New to this': '零基础',
    'Need quick wins': '需要先有成就感',
    'Some foundation': '有一点基础',
    Intermediate: '中等基础',
    'Reviewing after school': '学校学过，主要复习',
    'Aiming high': '冲高分',
    'Not confident': '没把握',
    Somewhat: '有点把握',
    'Mostly steady': '比较稳',
    'Very confident': '很熟练',
  }
  return labels[value] || value
}

async function selectFirstStudyPlanOption(selectLocator, value) {
  const localized = localizedStudyPlanValue(value)
  const candidates = [
    { value },
    { value: localized },
    { label: value },
    { label: localized },
  ]
  let lastError = null
  for (const candidate of candidates) {
    try {
      await selectLocator.selectOption(candidate)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error(`Could not select ${value}`)
}

async function fillStudyPlanPersona(page, persona) {
  await selectFirstStudyPlanOption(page.locator('select').nth(0), persona.foundation)
  await page.locator('input').nth(0).fill(persona.examTimeline)
  await page.locator('input').nth(1).fill(persona.targetScore)
  await page.locator('input').nth(2).fill(String(persona.weeklyHours))
  await page.locator('input').nth(3).fill(String(persona.prepMonths))
  await page.locator('input').nth(4).fill(String(persona.hoursPerSession))
  await setStudyDays(page, persona.studyDays)
  await page.locator('textarea').fill(persona.notes)
  if (persona.baseline?.length) {
    for (const [index, value] of persona.baseline.entries()) {
      await selectFirstStudyPlanOption(page.locator('select').nth(index + 1), value)
    }
  } else {
    await page.locator('button').filter({ hasText: /Skip for now|先跳过/i }).click()
  }
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text))
}

const STUDY_PLAN_PERSONAS = [
  {
    id: 'extra_smart',
    label: 'Extra-smart ambitious learner',
    foundation: 'Aiming high',
    examTimeline: 'May 2026',
    targetScore: 'AP 5 with margin',
    weeklyHours: 10,
    prepMonths: 4,
    hoursPerSession: 2,
    studyDays: ['mon', 'wed', 'fri', 'sun'],
    baseline: ['Very confident', 'Very confident', 'Mostly steady', 'Mostly steady', 'Somewhat'],
    notes: 'I already know most AP Calculus BC concepts. I want a fast, high-challenge plan focused on power series, Taylor error bounds, polar/parametric applications, and timed mixed FRQs. Avoid slow remedial lectures.',
    expectedPatterns: [/accelerat|advanced|challenge|hard|timed|FRQ|series|Taylor|polar|parametric/i],
  },
  {
    id: 'smart',
    label: 'Smart steady learner',
    foundation: 'Reviewing after school',
    examTimeline: 'May 2026',
    targetScore: 'AP 5',
    weeklyHours: 7,
    prepMonths: 4,
    hoursPerSession: 1.5,
    studyDays: ['mon', 'wed', 'fri'],
    baseline: ['Mostly steady', 'Mostly steady', 'Mostly steady', 'Somewhat', 'Somewhat'],
    notes: 'I did well in AP Calculus AB and am learning BC now. I need a balanced plan: short concept refresh, examples, then enough practice to make BC topics stable.',
    expectedPatterns: [/balanced|practice|mixed|review|AP 5|BC|checkpoint|weekly/i],
  },
  {
    id: 'medium',
    label: 'Medium learner who needs structure',
    foundation: 'Some foundation',
    examTimeline: 'in 5 months',
    targetScore: 'AP 4',
    weeklyHours: 5,
    prepMonths: 5,
    hoursPerSession: 1,
    studyDays: ['tue', 'thu', 'sat'],
    baseline: ['Somewhat', 'Somewhat', 'Somewhat', 'Not confident', 'Not confident'],
    notes: 'I understand basic derivatives and integrals when examples are similar, but multi-step applications confuse me. I need clear examples, checkpoints, and practice that ramps up slowly.',
    expectedPatterns: [/scaffold|step|example|checkpoint|ramp|foundation|multi-step|practice/i],
  },
  {
    id: 'slow_unmotivated',
    label: 'Slow or unmotivated learner',
    foundation: 'Need quick wins',
    examTimeline: 'in 3 months',
    targetScore: 'just pass / 3+',
    weeklyHours: 2,
    prepMonths: 3,
    hoursPerSession: 0.5,
    studyDays: ['sat', 'sun'],
    baseline: [],
    notes: 'I get bored quickly and do not want a long pretest. I often avoid homework when I feel stupid. Give me tiny wins, short missions, visual intuition, and only one small next action at a time.',
    expectedPatterns: [/quick win|tiny|short|mission|confidence|low-pressure|visual|one small|foundation|avoid/i],
  },
]

async function testStudyPlanPersonas(browser) {
  if (!hasAuthSession()) {
    events.push({ type: 'persona_study_plan', status: 'not_run', reason: 'auth_not_available' })
    return
  }
  const personas = STUDY_PLAN_PERSONAS.slice(0, Math.max(0, PERSONA_LIMIT))
  for (const persona of personas) {
    const { context, page, observed } = await createObservedPage(browser, { name: `persona-${persona.id}`, size: { width: 1365, height: 900 } })
    const started = performance.now()
    let shot = null
    try {
      await page.goto(`${BASE_URL}/study-plan`, { waitUntil: 'networkidle', timeout: 45000 })
      if (!await clickFirstVisible(page, [
        page.getByRole('button', { name: /AP \(Advanced Placement\)|AP \(美国大学预修\)/ }),
        page.locator('button').filter({ hasText: /AP \(Advanced Placement\)|AP \(美国大学预修\)/ }),
      ])) throw new Error('Could not select AP framework')
      await page.waitForTimeout(300)
      if (!await clickFirstVisible(page, [
        page.getByRole('button', { name: /Mathematics|数学/ }),
        page.locator('button').filter({ hasText: /Mathematics|数学/ }),
      ])) throw new Error('Could not select Mathematics subject')
      await page.waitForTimeout(300)
      if (!await clickFirstVisible(page, [
        page.getByRole('button', { name: /AP Calculus BC/ }),
        page.locator('button').filter({ hasText: /AP Calculus BC/ }),
      ])) throw new Error('Could not select AP Calculus BC')
      await page.waitForTimeout(500)
      await fillStudyPlanPersona(page, persona)
      const canBuild = !(await page.locator('button').filter({ hasText: /Let Mina build|让 Mina 生成/i }).isDisabled())
      if (!canBuild) {
        await addFinding({
          title: `Study-plan persona cannot start plan generation: ${persona.id}`,
          severity: 'blocked',
          surface: 'study-plan',
          page: '/study-plan',
          expected: 'A learner who provides foundation, timeline, and weekly hours should be able to continue without a required long pretest.',
          evidence: { persona, screenshot: await screenshot(page, `persona-${persona.id}-disabled`) },
        })
        continue
      }
      await page.locator('button').filter({ hasText: /Let Mina build|让 Mina 生成/i }).click()
      await page.waitForFunction(() => /Confirm the plan with Mina|和 Mina 确认计划/i.test(document.body.innerText), { timeout: 30000 })
      await page.locator('button').filter({ hasText: /^Send$|^发送$/ }).click()
      await page.waitForFunction(
        () => /Proposed Study Plan|拟定学习计划|Looks good, let's go|看起来不错，开始学习/i.test(document.body.innerText)
          || /网络错误|Failed to get|Network error|没有生成完成|not generated/i.test(document.body.innerText),
        { timeout: AI_TIMEOUT_MS },
      ).catch(() => null)
      await page.waitForTimeout(1200)
      const latency = Math.round(performance.now() - started)
      const body = await page.locator('body').innerText()
      shot = await screenshot(page, `persona-${persona.id}-study-plan`)
      const reachedPlanReview = /Proposed Study Plan|拟定学习计划|Looks good, let's go|看起来不错，开始学习/i.test(body)
      const personaMatched = hasAny(body, persona.expectedPatterns)
      const usedFallback = /deterministic|fallback|学习计划没有生成完成|not generated|没有生成完成/i.test(body)
      const selectedDayLabels = persona.studyDays.map((day) => ({ mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }[day]))
      const scheduleMentioned = selectedDayLabels.every((label) => new RegExp(label, 'i').test(body))
      events.push({
        type: 'persona_study_plan',
        persona: persona.id,
        latency,
        reachedPlanReview,
        personaMatched,
        scheduleMentioned,
        usedFallback,
        observed,
        screenshot: shot,
        bodySnippet: body.slice(-4000),
      })
      await postTelemetry('interaction', '/study-plan', {
        schema: 'mentormind.prod_autopilot_persona_study_plan.v1',
        persona_id: persona.id,
        persona_label: persona.label,
        latency,
        reached_plan_review: reachedPlanReview,
        persona_matched: personaMatched,
        schedule_mentioned: scheduleMentioned,
        used_fallback: usedFallback,
        observed_counts: {
          consoleErrors: observed.consoleErrors.length,
          failedRequests: observed.failedRequests.length,
          serverErrors: observed.serverErrors.length,
        },
      }, latency)
      if (!reachedPlanReview) {
        await addFinding({
          title: `Study-plan persona did not reach review plan: ${persona.id}`,
          severity: 'blocked',
          surface: 'study-plan',
          page: '/study-plan',
          expected: 'A complete persona intake should generate a reviewable plan or one clear follow-up question within the timeout.',
          evidence: { persona: persona.id, latency, bodySnippet: body.slice(-3000), screenshot: shot, observed },
        })
      }
      if (usedFallback) {
        await addFinding({
          title: `Study-plan persona produced fallback text: ${persona.id}`,
          severity: 'wrong',
          surface: 'study-plan',
          page: '/study-plan',
          expected: 'If AI generation is unavailable, the flow should fail clearly; it should not present deterministic/fallback output as a plan.',
          evidence: { persona: persona.id, latency, bodySnippet: body.slice(-3000), screenshot: shot },
        })
      }
      if (reachedPlanReview && !personaMatched) {
        await addFinding({
          title: `Study-plan plan lacks persona adaptation: ${persona.id}`,
          severity: 'quality',
          surface: 'study-plan',
          page: '/study-plan',
          expected: `The generated plan should visibly adapt to ${persona.label}.`,
          evidence: { persona: persona.id, expectedPatterns: persona.expectedPatterns.map(String), bodySnippet: body.slice(-3000), screenshot: shot },
        })
      }
      if (reachedPlanReview && !scheduleMentioned) {
        await addFinding({
          title: `Study-plan plan does not preserve selected study days: ${persona.id}`,
          severity: 'wrong',
          surface: 'study-plan',
          page: '/study-plan',
          expected: `The generated plan should reflect selected days: ${selectedDayLabels.join(', ')}.`,
          evidence: { persona: persona.id, selectedDayLabels, bodySnippet: body.slice(-3000), screenshot: shot },
        })
      }
      if (observed.serverErrors.length || observed.failedRequests.some((r) => !/telemetry/.test(r.url))) {
        await addFinding({
          title: `Study-plan persona triggered network failures: ${persona.id}`,
          severity: 'wrong',
          surface: 'study-plan',
          page: '/study-plan',
          expected: 'Persona study-plan generation should complete without failed non-telemetry requests.',
          evidence: { persona: persona.id, observed, screenshot: shot },
        })
      }
    } catch (error) {
      await addFinding({
        title: `Study-plan persona workflow crashed: ${persona.id}`,
        severity: 'blocked',
        surface: 'study-plan',
        page: '/study-plan',
        expected: 'Persona study-plan generation should complete through the real browser flow.',
        evidence: { persona, error: String(error), observed, screenshot: shot || await screenshot(page, `persona-${persona.id}-crash`) },
      })
    } finally {
      await context.close()
    }
  }
}

async function testQuickQuestion(browser) {
  if (!hasAuthSession()) {
    events.push({ type: 'quick_question_discussion', status: 'not_run', reason: 'auth_not_available' })
    return
  }
  const { context, page, observed } = await createObservedPage(browser, { name: 'desktop', size: { width: 1365, height: 900 } })
  try {
    await page.goto(`${BASE_URL}/ask`, { waitUntil: 'networkidle', timeout: 45000 })
    const textBox = await findTextbox(page)
    if (!textBox) {
      await addFinding({
        title: '/ask has no visible text entry box',
        severity: 'blocked',
        surface: 'ask',
        page: '/ask',
        expected: 'Quick question should always expose a visible way to type context or a question.',
        evidence: { observed, screenshot: await screenshot(page, 'ask-no-textbox') },
      })
      return
    }
    const prompt = '这篇文章的主旨是什么？材料：H.W. Brands讨论美国商业史，企业家精神，自由市场，政府角色，民主和平等与资本主义不平等之间的张力。请不要直接写成考点答案，先帮我讨论这个观点。'
    await textBox.fill(prompt)
    const clicked = await clickFirstVisible(page, [
      page.getByRole('button', { name: /^(问 Mina|Ask Mina)$/i }),
      page.locator('button').filter({ hasText: /^(问 Mina|Ask Mina)$/i }),
      page.locator('button[type="submit"]'),
    ])
    if (!clicked) {
      await addFinding({
        title: '/ask has no visible submit button after typing',
        severity: 'blocked',
        surface: 'ask',
        page: '/ask',
        expected: 'Quick question should have a clear submit action.',
        evidence: { screenshot: await screenshot(page, 'ask-no-submit') },
      })
      return
    }
    const started = performance.now()
    await page.waitForFunction(
      () => {
        const text = document.body.innerText
        return /轮到你|Your Turn|反方|Counterpoint|追问|Probe|讨论|Discussion|整理成短答|Draft/i.test(text)
      },
      { timeout: AI_TIMEOUT_MS },
    ).catch(() => null)
    const latency = Math.round(performance.now() - started)
    const body = await page.locator('body').innerText()
    const shot = await screenshot(page, 'ask-discussion-result')
    events.push({ type: 'quick_question_discussion', status: 'passed', latency, bodySnippet: body.slice(-3000), observed, screenshot: shot })
    await postTelemetry('interaction', '/ask', {
      schema: 'mentormind.prod_autopilot_quick_question.v1',
      mode: 'discussion_probe',
      latency,
      saw_discussion_affordance: /轮到你|Your Turn|反方|Counterpoint|追问|Probe|讨论|Discussion|整理成短答|Draft/i.test(body),
      observed_counts: {
        consoleErrors: observed.consoleErrors.length,
        failedRequests: observed.failedRequests.length,
        serverErrors: observed.serverErrors.length,
      },
    }, latency)
    if (/学习计划没有生成完成|deterministic|fallback/i.test(body)) {
      await addFinding({
        title: '/ask discussion produced fallback/stale planning text',
        severity: 'wrong',
        surface: 'ask',
        page: '/ask',
        expected: 'Discussion questions should produce a discussion response and learner interaction loop, not study-plan fallback text.',
        evidence: { latency, bodySnippet: body.slice(-2500), screenshot: shot },
      })
    }
    if (!/轮到你|Your Turn|反方|Counterpoint|追问|Probe|整理成短答|Draft/i.test(body)) {
      await addFinding({
        title: '/ask discussion answer lacks a visible learner response loop',
        severity: 'confusing',
        surface: 'ask',
        page: '/ask',
        expected: 'Broad discussion questions should invite the learner to respond, probe, request a counterpoint, or draft an answer.',
        evidence: { latency, bodySnippet: body.slice(-3000), screenshot: shot },
      })
    }
    if (observed.serverErrors.length || observed.failedRequests.some((r) => !/telemetry/.test(r.url))) {
      await addFinding({
        title: '/ask discussion triggered network failures',
        severity: 'wrong',
        surface: 'ask',
        page: '/ask',
        expected: 'Quick question should complete without failed non-telemetry requests.',
        evidence: { latency, observed, screenshot: shot },
      })
    }
  } catch (error) {
    await addFinding({
      title: '/ask discussion workflow crashed or timed out',
      severity: 'blocked',
      surface: 'ask',
      page: '/ask',
      expected: 'A broad discussion quick question should complete within the timeout.',
      evidence: { error: String(error), observed, screenshot: await screenshot(page, 'ask-discussion-crash') },
    })
  } finally {
    await context.close()
  }
}

async function testQuickQuestionUploadForms(browser) {
  if (!hasAuthSession()) {
    events.push({ type: 'quick_question_upload', status: 'not_run', reason: 'auth_not_available' })
    return
  }

  const generatedTextFixture = path.join(OUT_DIR, 'quick-question-text-fixture.txt')
  await fs.writeFile(
    generatedTextFixture,
    [
      'H.W. Brands frames American business history as a recurring tension.',
      'Political democracy promises equality, while capitalism often rewards inequality, risk, and entrepreneurial advantage.',
      'A strong discussion answer should connect enterprise, government, technology, and democratic ideals.',
    ].join('\n'),
  )

  const textFixtures = QA_TEXT_FIXTURES.length ? QA_TEXT_FIXTURES : [generatedTextFixture]
  const mediaFixtures = [
    ...QA_IMAGE_FIXTURES.map((fixture) => ({ fixture, fileType: 'image' })),
    ...QA_PDF_FIXTURES.map((fixture) => ({ fixture, fileType: 'pdf' })),
  ]
  const uploadCases = [
    ...textFixtures.map((fixture, index) => ({
      id: `text_context_${index + 1}`,
      label: `Text context upload ${index + 1}`,
      fileType: 'text',
      fixture,
      inputSelector: 'input[type="file"][accept=".txt,.md,.csv,.json,text/*"]',
      prompt: '根据上传的文字材料，先给我一个讨论式主旨，再问我一个追问问题。',
      expectedPatterns: [/讨论|主旨|张力|追问|Your Turn|轮到你|evidence|材料|观点|summary/i],
    })),
    ...(mediaFixtures.length ? mediaFixtures : [{ fixture: '', fileType: 'image' }]).map((media, index) => ({
      id: `${media.fileType}_context_${index + 1}`,
      label: `${media.fileType === 'pdf' ? 'PDF' : 'Image'} context upload ${index + 1}`,
      fileType: media.fileType,
      fixture: media.fixture,
      inputSelector: 'input[type="file"][accept="image/*,.pdf"]',
      prompt: media.fileType === 'pdf'
        ? '请根据我上传的 PDF，概括材料的核心内容，并给我一个讨论式追问。'
        : '请根据我上传的题目图片，解释这道题的关键思路，并给我一个可以回答的小检查问题。',
      expectedPatterns: media.fileType === 'pdf'
        ? [/PDF|document|材料|核心|主旨|讨论|追问|dummy|summary/i]
        : [/关键|思路|检查|积分|坐标|theta|半径|question|check/i],
    })),
    ...(QA_AUDIO_FIXTURES.length ? QA_AUDIO_FIXTURES : ['']).map((fixture, index) => ({
      id: `audio_context_${index + 1}`,
      label: `Audio context upload ${index + 1}`,
      fileType: 'audio',
      fixture,
      inputSelector: 'input[type="file"][accept="audio/*"]',
      prompt: '根据上传音频，总结这段内容的核心观点，然后用讨论方式问我一个问题。',
      expectedPatterns: [/核心|观点|讨论|追问|Your Turn|轮到你|speech|business|market|idea/i],
    })),
  ]

  for (const item of uploadCases) {
    const fixtureAvailable = await fileExists(item.fixture)
    if (!fixtureAvailable) {
      events.push({
        type: 'quick_question_upload',
        case_id: item.id,
        label: item.label,
        file_type: item.fileType,
        fixture_path: item.fixture || null,
        status: 'not_run',
        reason: 'fixture_not_provided_or_missing',
      })
      continue
    }

    const { context, page, observed } = await createObservedPage(browser, { name: `upload-${item.id}`, size: { width: 1365, height: 900 } })
    const started = performance.now()
    let shot = null
    try {
      await page.goto(`${BASE_URL}/ask`, { waitUntil: 'networkidle', timeout: 45000 })
      const fileName = path.basename(item.fixture)
      await page.locator(item.inputSelector).setInputFiles(item.fixture)
      await page.waitForFunction(
        ({ fileName: expectedFileName }) => {
          const text = document.body.innerText
          return text.includes(expectedFileName)
            || /上传失败|Upload failed|无法读取|unsupported|timeout|超时|Request Entity Too Large|413/i.test(text)
        },
        { fileName },
        { timeout: AI_TIMEOUT_MS },
      ).catch(() => null)
      await page.waitForTimeout(800)
      const afterUpload = await page.locator('body').innerText()
      const uploadSucceeded = afterUpload.includes(fileName) && !/上传失败|Upload failed|无法读取|unsupported|timeout|超时|Request Entity Too Large|413/i.test(afterUpload)
      const controlledRejection = !uploadSucceeded
        && item.fileType === 'audio'
        && /上传失败|Upload failed/i.test(afterUpload)
        && /音频太长|too long|quick questions|快速提问|裁剪|trim|too large|文件太大/i.test(afterUpload)
      let answerSucceeded = false
      let personaMatched = false
      let body = afterUpload
      if (uploadSucceeded) {
        const submitted = await submitAskQuestion(page, item.prompt)
        if (submitted) {
          body = await waitForAskAnswer(page)
          answerSucceeded = /下一步|继续讨论|Next|Continue the Discussion|轮到你|Your Turn|写下你的答案|Write Your Attempt/i.test(body)
          personaMatched = hasAny(body, item.expectedPatterns) || hasAny(body, [
            /Discussion Focus|Follow-Up Question|Mina's follow-up|Evidence from the passage|讨论焦点|追问问题/i,
          ])
        }
      }
      const latency = Math.round(performance.now() - started)
      shot = await screenshot(page, `ask-upload-${item.id}`)
      const rawGatewayHtml = /<html[\s\S]*nginx|Request Entity Too Large|Gateway Timeout/i.test(body)
      events.push({
        type: 'quick_question_upload',
        case_id: item.id,
        label: item.label,
        file_type: item.fileType,
        fixture_path: item.fixture,
        status: uploadSucceeded && answerSucceeded ? 'passed' : controlledRejection ? 'controlled_rejection' : 'failed',
        upload_succeeded: uploadSucceeded,
        answer_succeeded: answerSucceeded,
        controlled_rejection: controlledRejection,
        expected_content_matched: personaMatched,
        raw_gateway_html: rawGatewayHtml,
        latency,
        observed,
        screenshot: shot,
        bodySnippet: body.slice(-3000),
      })
      await postTelemetry('interaction', '/ask', {
        schema: 'mentormind.prod_autopilot_quick_upload.v1',
        case_id: item.id,
        file_type: item.fileType,
        fixture_name: path.basename(item.fixture),
        upload_succeeded: uploadSucceeded,
        answer_succeeded: answerSucceeded,
        controlled_rejection: controlledRejection,
        expected_content_matched: personaMatched,
        raw_gateway_html: rawGatewayHtml,
        latency,
        observed_counts: {
          consoleErrors: observed.consoleErrors.length,
          failedRequests: observed.failedRequests.length,
          serverErrors: observed.serverErrors.length,
        },
      }, latency)
      if (!uploadSucceeded && !controlledRejection) {
        await addFinding({
          title: `/ask ${item.label} did not load usable context`,
          severity: rawGatewayHtml ? 'blocked' : 'wrong',
          surface: 'ask-upload',
          page: '/ask',
          expected: 'User-uploaded context should either load into the quick-question form or show a controlled, specific error.',
          evidence: { case_id: item.id, fixture: item.fixture, latency, rawGatewayHtml, bodySnippet: body.slice(-1800), screenshot: shot, observed },
        })
      } else if (!answerSucceeded && !controlledRejection) {
        await addFinding({
          title: `/ask ${item.label} could not produce a follow-up answer`,
          severity: 'blocked',
          surface: 'ask-upload',
          page: '/ask',
          expected: 'After upload context is loaded, Mina should answer and expose an interactive next step.',
          evidence: { case_id: item.id, fixture: item.fixture, latency, bodySnippet: body.slice(-1800), screenshot: shot, observed },
        })
      } else if (!personaMatched && !controlledRejection) {
        await addFinding({
          title: `/ask ${item.label} answer did not reflect uploaded context`,
          severity: 'quality',
          surface: 'ask-upload',
          page: '/ask',
          expected: 'The answer should visibly use the uploaded context instead of giving a generic response.',
          evidence: { case_id: item.id, fixture: item.fixture, expectedPatterns: item.expectedPatterns.map(String), bodySnippet: body.slice(-1800), screenshot: shot },
        })
      }
    } catch (error) {
      await addFinding({
        title: `/ask ${item.label} workflow crashed`,
        severity: 'blocked',
        surface: 'ask-upload',
        page: '/ask',
        expected: 'Upload-context quick question should complete through the real browser flow.',
        evidence: { case_id: item.id, fixture: item.fixture, error: String(error), observed, screenshot: shot || await screenshot(page, `ask-upload-${item.id}-crash`) },
      })
    } finally {
      await context.close()
    }
  }
}

async function testStudyPlanRouting(browser) {
  if (!hasAuthSession()) {
    events.push({ type: 'study_plan_routing', status: 'not_run', reason: 'auth_not_available' })
    return
  }
  const { context, page, observed } = await createObservedPage(browser, { name: 'desktop', size: { width: 1365, height: 900 } })
  try {
    await page.goto(`${BASE_URL}/study-plan`, { waitUntil: 'networkidle', timeout: 45000 })
    const shotBefore = await screenshot(page, 'study-plan-before-click')
    const clicked = await clickFirstVisible(page, [
      page.getByRole('button', { name: /生成学习计划|Build.*plan|Create.*plan/i }),
      page.locator('button').filter({ hasText: /生成学习计划|Build|Create/i }),
      page.locator('text=生成学习计划').first(),
    ])
    await page.waitForTimeout(1200)
    const url = page.url()
    const shotAfter = await screenshot(page, 'study-plan-after-click')
    events.push({ type: 'study_plan_routing', status: 'checked', clicked, url, observed, screenshot_before: shotBefore, screenshot_after: shotAfter })
    if (clicked && /\/create(?:$|[/?#])/.test(url)) {
      await addFinding({
        title: 'Study-plan create entry still routes to /create',
        severity: 'wrong',
        surface: 'study-plan',
        page: '/study-plan',
        expected: 'The study-plan create entry should stay inside /study-plan flow, not old lesson/video creation.',
        evidence: { url, screenshot_before: shotBefore, screenshot_after: shotAfter },
      })
    }
    if (!clicked) {
      await addFinding({
        title: 'Could not find study-plan create entry',
        severity: 'confusing',
        surface: 'study-plan',
        page: '/study-plan',
        expected: 'Study plan should have a clear create-plan entry.',
        evidence: { url, observed, screenshot: shotBefore },
      })
    }
  } catch (error) {
    await addFinding({
      title: '/study-plan routing workflow failed',
      severity: 'blocked',
      surface: 'study-plan',
      page: '/study-plan',
      expected: 'Study-plan page should load and its primary entry should be clickable.',
      evidence: { error: String(error), observed, screenshot: await screenshot(page, 'study-plan-routing-error') },
    })
  } finally {
    await context.close()
  }
}

async function testWebSocket(browser) {
  const { context, page } = await createObservedPage(browser, { name: 'desktop', size: { width: 1024, height: 768 } })
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const result = await page.evaluate(async () => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/board/00000000-0000-0000-0000-000000000000?token=invalid-smoke-token`
      return await new Promise((resolve) => {
        const ws = new WebSocket(url)
        const timer = setTimeout(() => {
          try { ws.close() } catch {}
          resolve({ opened: false, timeout: true, url })
        }, 8000)
        ws.onopen = () => {
          clearTimeout(timer)
          try { ws.close() } catch {}
          resolve({ opened: true, url })
        }
        ws.onerror = () => {
          clearTimeout(timer)
          resolve({ opened: false, error: true, url })
        }
      })
    })
    events.push({ type: 'websocket_smoke', result })
    await postTelemetry('interaction', '/ws', {
      schema: 'mentormind.prod_autopilot_ws_smoke.v1',
      result,
    })
    if (!result.opened) {
      await addFinding({
        title: 'Production WebSocket upgrade failed from browser context',
        severity: 'blocked',
        surface: 'websocket',
        page: '/ws',
        expected: 'Board/seminar WebSocket paths should complete an upgrade and reach FastAPI.',
        evidence: result,
      })
    }
  } finally {
    await context.close()
  }
}

async function testWeirdApiWorkflows() {
  const cases = [
    { name: 'nonexistent route', method: 'GET', url: `${BASE_URL}/definitely-not-a-real-route-${RUN_ID}` },
    { name: 'invalid telemetry payload', method: 'POST', url: `${BASE_URL}/api/backend/telemetry/event`, body: { event_type: 'not_allowed' } },
    { name: 'empty quick question payload', method: 'POST', url: `${BASE_URL}/api/backend/quick-question`, body: {} },
  ]
  for (const item of cases) {
    const started = performance.now()
    let status = null
    let text = ''
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.body ? { 'Content-Type': 'application/json' } : undefined,
        body: item.body ? JSON.stringify(item.body) : undefined,
      })
      status = res.status
      text = (await res.text()).slice(0, 1000)
    } catch (error) {
      text = String(error)
    }
    const latency = Math.round(performance.now() - started)
    events.push({ type: 'weird_api', name: item.name, status, latency, text })
    if (!status || status >= 500) {
      await addFinding({
        title: `Weird workflow produced server failure: ${item.name}`,
        severity: 'wrong',
        surface: 'api',
        page: new URL(item.url).pathname,
        expected: 'Malformed or nonexistent requests should return controlled 4xx responses, not crash or timeout.',
        evidence: { case: item.name, status, latency, text },
      })
    }
  }
}

async function testUploadEdges() {
  const authHeaders = authSession?.token ? { Authorization: `Bearer ${authSession.token}` } : {}
  const cases = [
    {
      name: 'unsupported image text file',
      path: '/api/backend/ingest/image',
      form: () => {
        const form = new FormData()
        form.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'not-image.txt')
        return form
      },
      expectedStatuses: [400, 401, 403, 415, 422],
    },
    {
      name: 'unsupported audio text file',
      path: '/api/backend/ingest/audio',
      form: () => {
        const form = new FormData()
        form.append('file', new Blob(['not audio'], { type: 'text/plain' }), 'not-audio.txt')
        return form
      },
      expectedStatuses: [400, 401, 403, 415, 422],
    },
    {
      name: 'missing image file multipart',
      path: '/api/backend/ingest/image',
      form: () => new FormData(),
      expectedStatuses: [400, 401, 403, 422],
    },
  ]

  for (const item of cases) {
    const started = performance.now()
    let status = null
    let text = ''
    try {
      const res = await fetch(`${BASE_URL}${item.path}`, {
        method: 'POST',
        headers: authHeaders,
        body: item.form(),
      })
      status = res.status
      text = (await res.text()).slice(0, 1400)
    } catch (error) {
      text = String(error)
    }
    const latency = Math.round(performance.now() - started)
    const rawGatewayHtml = /<html[\s\S]*nginx|Request Entity Too Large|Gateway Timeout/i.test(text)
    events.push({ type: 'upload_edge', name: item.name, path: item.path, status, latency, rawGatewayHtml, text })
    await postTelemetry('interaction', item.path, {
      schema: 'mentormind.prod_autopilot_upload_edge.v1',
      case_name: item.name,
      status,
      latency,
      raw_gateway_html: rawGatewayHtml,
      response_excerpt: text.slice(0, 400),
    }, latency)
    const controlledJsonError = Boolean(
      status && status >= 400 && status < 500 && !rawGatewayHtml && /"error"|"detail"|"code"/i.test(text),
    )
    if (!status || status >= 500 || rawGatewayHtml || (!item.expectedStatuses.includes(status) && !controlledJsonError)) {
      await addFinding({
        title: `Upload edge case returned an uncontrolled response: ${item.name}`,
        severity: rawGatewayHtml || status === 413 ? 'blocked' : 'wrong',
        surface: 'upload',
        page: item.path,
        expected: 'Unsupported or malformed uploads should return a controlled 4xx JSON response with clear user-facing error details.',
        evidence: { case: item.name, status, latency, rawGatewayHtml, text },
      })
    }
  }
}

function authHeaders(json = false) {
  const headers = {}
  if (authSession?.token) headers.Authorization = `Bearer ${authSession.token}`
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

function guessMime(filePath) {
  const ext = path.extname(filePath || '').toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.flac') return 'audio/flac'
  if (ext === '.ogg' || ext === '.oga') return 'audio/ogg'
  if (ext === '.m4a') return 'audio/x-m4a'
  if (ext === '.webm') return 'audio/webm'
  if (ext === '.txt' || ext === '.md') return 'text/plain'
  if (ext === '.json') return 'application/json'
  if (ext === '.csv') return 'text/csv'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

async function fetchJson(url, options = {}, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = performance.now()
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text.slice(0, 2000) }
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      text: text.slice(0, 2000),
      latency: Math.round(performance.now() - started),
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      text: String(error),
      latency: Math.round(performance.now() - started),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function appendFixtureFile(form, fieldName, filePath, filename = path.basename(filePath)) {
  const bytes = await fs.readFile(filePath)
  form.append(fieldName, new Blob([bytes], { type: guessMime(filePath) }), filename)
}

async function firstExisting(paths) {
  for (const item of paths) {
    if (await fileExists(item)) return item
  }
  return ''
}

async function testSeminarFullFlow(browser) {
  const session = await ensureAuthSession()
  const audioFixture = await firstExisting(QA_AUDIO_FIXTURES)
  const record = {
    type: 'seminar_full_flow',
    status: 'not_run',
    fixture_path: audioFixture || null,
    steps: {},
  }
  if (!session) {
    record.reason = 'auth_not_available'
    events.push(record)
    return
  }
  if (!audioFixture) {
    record.reason = 'audio_fixture_not_provided_or_missing'
    events.push(record)
    return
  }

  try {
    const create = await fetchJson(`${BASE_URL}/api/backend/seminar/rooms`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({
        title: `QA seminar ${RUN_ID}`,
        topic: 'Should business history be taught mainly through entrepreneur biographies or structural forces?',
        subject: 'history',
        framework: 'general',
        language: 'en',
        max_participants: 4,
      }),
    })
    record.steps.create = create
    const roomId = create.data?.room?.id
    if (!create.ok || !roomId) throw new Error(`create room failed: ${create.status}`)

    const { context, page } = await createObservedPage(browser, { name: 'seminar-ws', size: { width: 1024, height: 768 } })
    try {
      await page.goto(`${BASE_URL}/seminar`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      record.steps.websocket = await page.evaluate(async ({ roomId, token }) => {
        const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/seminar/${roomId}?token=${encodeURIComponent(token)}`
        return await new Promise((resolve) => {
          const ws = new WebSocket(url)
          const messages = []
          const timer = setTimeout(() => {
            try { ws.close() } catch {}
            resolve({ opened: false, timeout: true, messages, url })
          }, 9000)
          ws.onopen = () => {
            messages.push({ type: 'open' })
          }
          ws.onmessage = (event) => {
            messages.push(String(event.data).slice(0, 600))
            clearTimeout(timer)
            try { ws.close() } catch {}
            resolve({ opened: true, timeout: false, messages, url })
          }
          ws.onerror = () => {
            clearTimeout(timer)
            resolve({ opened: false, error: true, messages, url })
          }
        })
      }, { roomId, token: session.token })
    } finally {
      await context.close()
    }

    const join = await fetchJson(`${BASE_URL}/api/backend/seminar/rooms/${roomId}/join`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ display_name: 'Production QA Learner' }),
    })
    record.steps.join = join

    const textTurn = await fetchJson(`${BASE_URL}/api/backend/seminar/rooms/${roomId}/turn`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({
        display_name: 'Production QA Learner',
        message: 'I think biographies make abstract market forces easier to care about, but they may hide policy and labor conditions.',
        source: 'text',
      }),
    })
    record.steps.text_turn = textTurn

    const form = new FormData()
    await appendFixtureFile(form, 'file', audioFixture, path.basename(audioFixture))
    form.append('display_name', 'Production QA Learner')
    form.append('language', 'en')
    const audioTurn = await fetchJson(`${BASE_URL}/api/backend/seminar/rooms/${roomId}/audio-turn`, {
      method: 'POST',
      headers: authHeaders(false),
      body: form,
    }, Math.max(AI_TIMEOUT_MS, 120000))
    record.steps.audio_turn = audioTurn

    const finish = await fetchJson(`${BASE_URL}/api/backend/seminar/rooms/${roomId}/finish`, {
      method: 'POST',
      headers: authHeaders(false),
    }, Math.max(AI_TIMEOUT_MS, 120000))
    record.steps.finish = finish

    const interventionText = JSON.stringify([
      textTurn.data?.intervention,
      audioTurn.data?.intervention,
      finish.data?.room?.review,
    ]).slice(0, 4000)
    const joinSatisfied = Boolean(join.ok || (create.data?.participant_id && textTurn.ok && audioTurn.ok))
    const success = Boolean(
      joinSatisfied
      && textTurn.ok
      && audioTurn.ok
      && finish.ok
      && record.steps.websocket?.opened
      && /facilitator|question|Mina|Kai|logic|argument|score|review/i.test(interventionText)
    )
    record.status = success ? 'passed' : 'failed'
    record.room_id = roomId
    record.intervention_excerpt = interventionText
    record.join_satisfied = joinSatisfied
    events.push(record)
    await postTelemetry('interaction', '/seminar', {
      schema: 'mentormind.prod_autopilot_seminar_full_flow.v1',
      status: record.status,
      room_id: roomId,
      steps: record.steps,
      fixture_name: path.basename(audioFixture),
    })
    if (!success) {
      await addFinding({
        title: 'Seminar full room flow did not complete cleanly',
        severity: audioTurn.status === 504 || finish.status === 504 ? 'slow' : 'blocked',
        surface: 'seminar',
        page: '/seminar',
        expected: 'A seminar room should create, accept text and audio turns, produce AI facilitator/participant responses, and finish with review.',
        evidence: record,
      })
    }
  } catch (error) {
    record.status = 'failed'
    record.error = String(error)
    events.push(record)
    await addFinding({
      title: 'Seminar full room flow crashed in harness',
      severity: 'blocked',
      surface: 'seminar',
      page: '/seminar',
      expected: 'Full seminar workflow should be testable end to end.',
      evidence: record,
    })
  }
}

async function testBoardLessonAskWorkflow(browser) {
  const session = await ensureAuthSession()
  const record = {
    type: 'board_lesson_ask_ai',
    status: 'not_run',
    steps: {},
  }
  if (!session) {
    record.reason = 'auth_not_available'
    events.push(record)
    return
  }

  try {
    const planData = {
      subject: 'mathematics',
      framework: 'AP',
      course_name: 'AP Calculus BC',
      title: `QA Board Lesson ${RUN_ID}`,
      description: 'Disposable production QA plan for board lesson ask-AI flow.',
      estimated_hours: 1,
      diagnostic_context: { qa_run_id: RUN_ID },
      units: [
        {
          title: 'Limits and Continuity Check',
          description: 'A short board lesson on one-sided limits and continuity.',
          topics: ['one-sided limits', 'continuity', 'graph behavior'],
          learning_objectives: ['Explain why left and right limits must agree for a limit to exist.'],
          estimated_minutes: 30,
        },
      ],
    }
    const createPlan = await fetchJson(`${BASE_URL}/api/backend/study-plan/create`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ plan_data: planData, language: 'en', request_id: `board-${RUN_ID}` }),
    })
    record.steps.create_plan = createPlan
    const planId = createPlan.data?.plan_id
    if (!createPlan.ok || !planId) throw new Error(`create plan failed: ${createPlan.status}`)

    const getPlan = await fetchJson(`${BASE_URL}/api/backend/study-plan/${planId}`, {
      method: 'GET',
      headers: authHeaders(false),
    })
    record.steps.get_plan = getPlan
    const unitId = getPlan.data?.plan?.units?.[0]?.id
    if (!getPlan.ok || !unitId) throw new Error(`get plan/unit failed: ${getPlan.status}`)

    const createBoard = await fetchJson(`${BASE_URL}/api/backend/study-plan/${planId}/unit/${unitId}/board-lesson`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ language: 'en' }),
    })
    record.steps.create_board = createBoard
    const sessionId = createBoard.data?.session_id
    if (!createBoard.ok || !sessionId) throw new Error(`create board failed: ${createBoard.status}`)
    record.plan_id = planId
    record.unit_id = unitId
    record.session_id = sessionId

    const question = 'Can you explain why one-sided limits must match before continuity works?'
    const { context, page, observed } = await createObservedPage(browser, { name: 'board-ask', size: { width: 1365, height: 900 } })
    let shot = null
    try {
      await page.goto(`${BASE_URL}/board/${sessionId}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForFunction(() => /AI Board Lesson|AI 板书课|Ask the AI teacher|向 AI 老师|Board Lesson failed|Lesson session expired/i.test(document.body.innerText), { timeout: 90000 }).catch(() => null)
      const startupStatePolls = []
      let boardStarted = false
      let lastStartupState = null
      const startupStarted = performance.now()
      while (performance.now() - startupStarted < 90000) {
        const liveState = await fetchJson(`${BASE_URL}/api/backend/board/${sessionId}/state`, {
          method: 'GET',
          headers: authHeaders(false),
        })
        lastStartupState = liveState
        const liveSession = liveState.data?.session || liveState.data?.state || {}
        const elementCount = Array.isArray(liveSession.element_order)
          ? liveSession.element_order.length
          : Object.keys(liveSession.elements || {}).length
        startupStatePolls.push({
          status: liveState.status,
          session_status: liveSession.status || null,
          element_count: elementCount,
          chat_count: Array.isArray(liveSession.chat_history) ? liveSession.chat_history.length : 0,
        })
        if (elementCount > 0) {
          boardStarted = true
          record.steps.initial_state = liveState
          break
        }
        if (liveSession.status === 'error') {
          record.steps.initial_state = liveState
          break
        }
        await page.waitForTimeout(2000)
      }
      if (!record.steps.initial_state && lastStartupState) {
        record.steps.initial_state = lastStartupState
      }
      const beforeText = await page.locator('body').innerText().catch(() => '')
      let questionSent = false
      const statePolls = []
      if (boardStarted) {
        const box = page.locator('textarea').last()
        await box.fill(question)
        await page.getByRole('button', { name: /^(Send|发送)$/ }).click()
        questionSent = true
        await page.waitForFunction((expected) => document.body.innerText.includes(expected), question, { timeout: 15000 }).catch(() => null)
        const pollStarted = performance.now()
        while (performance.now() - pollStarted < 60000) {
          const liveState = await fetchJson(`${BASE_URL}/api/backend/board/${sessionId}/state`, {
            method: 'GET',
            headers: authHeaders(false),
          })
          const liveSession = liveState.data?.session || liveState.data?.state || {}
          statePolls.push({
            status: liveState.status,
            session_status: liveSession.status || null,
            element_count: Array.isArray(liveSession.element_order)
              ? liveSession.element_order.length
              : Object.keys(liveSession.elements || {}).length,
            chat_count: Array.isArray(liveSession.chat_history) ? liveSession.chat_history.length : 0,
          })
          const chatText = JSON.stringify(liveSession.chat_history || [])
          const hasBoardContent =
            (Array.isArray(liveSession.element_order) && liveSession.element_order.length > 0) ||
            Object.keys(liveSession.elements || {}).length > 0
          const hasPersistedQuestion = chatText.includes(question)
          if (hasBoardContent && hasPersistedQuestion) {
            record.steps.live_state = liveState
            break
          }
          await page.waitForTimeout(2000)
        }
      }
      const afterText = await page.locator('body').innerText().catch(() => '')
      shot = await screenshot(page, 'board-lesson-ask-ai')
      record.steps.browser = {
        status: 'completed',
        board_started: boardStarted,
        question_sent: questionSent,
        before_text_length: beforeText.length,
        after_text_length: afterText.length,
        user_message_visible: afterText.includes(question),
        ai_teacher_visible: boardStarted && /AI\s*TEACHER|AI Teacher|AI 老师/i.test(afterText),
        startup_state_polls: startupStatePolls,
        state_polls: statePolls,
        observed,
        screenshot: shot,
      }
    } finally {
      await context.close()
    }

    let state = null
    const finalStatePolls = []
    const finalPollStarted = performance.now()
    while (performance.now() - finalPollStarted < 30000) {
      state = await fetchJson(`${BASE_URL}/api/backend/board/${sessionId}/state`, {
        method: 'GET',
        headers: authHeaders(false),
      })
      const liveSession = state.data?.session || state.data?.state || {}
      const elementCount = Array.isArray(liveSession.element_order)
        ? liveSession.element_order.length
        : Object.keys(liveSession.elements || {}).length
      const chatText = JSON.stringify(liveSession.chat_history || [])
      finalStatePolls.push({
        status: state.status,
        session_status: liveSession.status || null,
        element_count: elementCount,
        chat_count: Array.isArray(liveSession.chat_history) ? liveSession.chat_history.length : 0,
      })
      if (elementCount > 0 && chatText.includes(question)) break
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    record.steps.state = state
    record.steps.final_state_polls = finalStatePolls
    const sessionState = state.data?.session || state.data?.state || {}
    const stateText = JSON.stringify(sessionState || {}).slice(0, 4000)
    const elementCount = Array.isArray(sessionState.element_order)
      ? sessionState.element_order.length
      : Object.keys(sessionState.elements || {}).length
    const chatHistory = Array.isArray(sessionState.chat_history) ? sessionState.chat_history : []
    const chatText = JSON.stringify(chatHistory)
    const hasPersistedQuestion = chatText.includes(question)
    const questionIndex = chatHistory.findIndex((msg) => msg?.role === 'user' && msg?.text === question)
    const assistantAfterQuestion = questionIndex >= 0 && chatHistory.slice(questionIndex + 1).some((msg) => msg?.role === 'assistant')
    record.steps.assistant_after_question = assistantAfterQuestion
    const success = Boolean(
      record.steps.browser?.board_started
      && record.steps.browser?.question_sent
      && record.steps.browser?.user_message_visible
      && record.steps.browser?.ai_teacher_visible
      && !record.steps.browser?.observed?.serverErrors?.length
      && (!state.status || state.status < 500)
      && elementCount > 0
      && hasPersistedQuestion
      && assistantAfterQuestion
      && /one-sided|limit|continuity|elements|chat|conversation|board/i.test(stateText)
    )
    record.status = success ? 'passed' : 'failed'
    events.push(record)
    await postTelemetry('interaction', '/board', {
      schema: 'mentormind.prod_autopilot_board_ask_ai.v1',
      status: record.status,
      plan_id: planId,
      unit_id: unitId,
      session_id: sessionId,
      steps: record.steps,
    })
    if (!success) {
      await addFinding({
        title: 'Board lesson ask-AI workflow did not complete cleanly',
        severity: record.steps.browser?.observed?.serverErrors?.length ? 'blocked' : 'wrong',
        surface: 'board',
        page: `/board/${sessionId}`,
        expected: 'A board lesson should open, accept a visible student question, and preserve/respond through the board session workflow.',
        evidence: record,
      })
    }
  } catch (error) {
    record.status = 'failed'
    record.error = String(error)
    events.push(record)
    await addFinding({
      title: 'Board lesson ask-AI workflow crashed in harness',
      severity: 'blocked',
      surface: 'board',
      page: '/board',
      expected: 'Board lesson ask-AI flow should be testable end to end.',
      evidence: record,
    })
  }
}

async function captureVisualManualReview(browser) {
  const targets = [
    { route: '/ask', viewport: { name: 'manual-desktop', size: { width: 1440, height: 900 } } },
    { route: '/ask', viewport: { name: 'manual-iphone', size: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } },
    { route: '/study-plan', viewport: { name: 'manual-ipad', size: { width: 820, height: 1180 } } },
    { route: '/seminar', viewport: { name: 'manual-desktop', size: { width: 1440, height: 900 } } },
  ]
  const screenshots = []
  for (const target of targets) {
    const { context, page, observed } = await createObservedPage(browser, target.viewport)
    try {
      await page.goto(`${BASE_URL}${target.route}`, { waitUntil: 'networkidle', timeout: 45000 })
      await page.waitForTimeout(900)
      const metrics = await page.evaluate(() => {
        const text = document.body?.innerText?.trim() || ''
        return {
          bodyTextLength: text.length,
          authGateHint: /进入 MentorMind|登录并开始|用户名|密码|Sign in|Log in|Login/i.test(text),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          h1: document.querySelector('h1')?.textContent?.trim() || '',
        }
      })
      const authGate = !hasAuthSession() && metrics.authGateHint
      const shot = await screenshot(page, `manual-review-${target.viewport.name}-${target.route}`)
      screenshots.push({
        route: target.route,
        viewport: target.viewport.name,
        status: authGate ? 'not_run' : 'checked',
        reason: authGate ? 'auth_not_available' : undefined,
        screenshot: shot,
        metrics,
        observed,
      })
    } catch (error) {
      screenshots.push({
        route: target.route,
        viewport: target.viewport.name,
        status: 'checked',
        error: String(error),
        metrics: null,
        observed,
      })
    } finally {
      await context.close()
    }
  }
  const checkedScreenshots = screenshots.filter((item) => item.status !== 'not_run')
  const success = screenshots.every((item) => (
    item.status === 'not_run'
    || (item.metrics
    && item.metrics.bodyTextLength >= 80
    && item.metrics.scrollWidth <= item.metrics.clientWidth + 8
    && !item.observed.serverErrors.length
    && !item.error)
  ))
  const status = checkedScreenshots.length === 0 ? 'not_run' : success ? 'passed' : 'failed'
  events.push({
    type: 'visual_manual_review',
    status,
    reason: status === 'not_run' ? 'auth_not_available' : undefined,
    screenshots,
    note: 'Screenshots captured for human visual inspection; success also checks visible content, no horizontal overflow, and no 5xx subrequests.',
  })
  if (status === 'failed') {
    await addFinding({
      title: 'Visual manual review capture found layout/network risk',
      severity: 'visual',
      surface: 'responsive',
      page: '/manual-review',
      expected: 'Primary flows should render meaningful content without horizontal overflow or 5xx subrequests across desktop/tablet/mobile.',
      evidence: { screenshots },
    })
  }
}

async function pressureTest() {
  const targets = [
    `${BASE_URL}/`,
    `${BASE_URL}/ask`,
    `${BASE_URL}/study-plan`,
    `${BASE_URL}/api/backend/status`,
  ]
  let idx = 0
  const results = []
  async function worker(workerId) {
    while (idx < PRESSURE_REQUESTS) {
      const current = idx++
      const url = targets[current % targets.length]
      const started = performance.now()
      let status = null
      let error = null
      try {
        const res = await fetch(url, { headers: { 'X-Prod-Autopilot-QA': RUN_ID } })
        status = res.status
        await res.arrayBuffer()
      } catch (err) {
        error = String(err)
      }
      results.push({
        workerId,
        url,
        status,
        error,
        latency: Math.round(performance.now() - started),
      })
    }
  }
  await Promise.all(Array.from({ length: PRESSURE_CONCURRENCY }, (_, i) => worker(i)))
  const failures = results.filter((r) => !r.status || r.status >= 500 || r.error)
  const latencies = results.filter((r) => r.status && r.status < 500).map((r) => r.latency)
  const summary = {
    request_count: results.length,
    concurrency: PRESSURE_CONCURRENCY,
    failures: failures.length,
    p50_ms: percentile(latencies, 50),
    p95_ms: percentile(latencies, 95),
    p99_ms: percentile(latencies, 99),
    max_ms: latencies.length ? Math.max(...latencies) : null,
    sample_failures: failures.slice(0, 10),
  }
  events.push({ type: 'pressure_test', summary, results })
  await postTelemetry('interaction', '/pressure-test', {
    schema: 'mentormind.prod_autopilot_pressure.v1',
    summary,
  }, summary.p95_ms)
  if (failures.length) {
    await addFinding({
      title: `Low-concurrency pressure test saw ${failures.length} failures`,
      severity: 'slow',
      surface: 'performance',
      page: '/pressure-test',
      expected: 'A small production smoke load should have zero 5xx/network failures.',
      evidence: summary,
    })
  }
  if (summary.p95_ms !== null && summary.p95_ms > 5000) {
    await addFinding({
      title: `Low-concurrency pressure p95 is high: ${summary.p95_ms}ms`,
      severity: 'slow',
      surface: 'performance',
      page: '/pressure-test',
      expected: 'Primary cached/status routes should remain comfortably below 5s p95 under a small smoke load.',
      evidence: summary,
    })
  }
}

async function writeReport() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const summary = buildRunSummary(events, findings)
  const json = {
    run_id: RUN_ID,
    base_url: BASE_URL,
    created_at: nowIso(),
    summary,
    findings,
    events,
  }
  await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(json, null, 2))
  const lines = [
    `# MentorMind Production Autopilot QA`,
    ``,
    `- Run: \`${RUN_ID}\``,
    `- Base URL: ${BASE_URL}`,
    `- Findings: ${findings.length}`,
    ``,
    `## Success Summary`,
    ``,
    `- Overall executed checks: ${summary.executed_checks}`,
    `- Overall successes: ${summary.successful_checks}`,
    `- Overall success rate: ${summary.success_rate_percent === null ? '' : `${summary.success_rate_percent}%`}`,
    `- Blank / not-run checks: ${summary.blank_checks}`,
    ``,
    `| Area | Executed | Success | Success rate | Blank / not run |`,
    `| --- | ---: | ---: | ---: | ---: |`,
    ...summary.areas.map((area) => `| ${area.area} | ${area.executed} | ${area.successes} | ${area.success_rate_percent === null ? '' : `${area.success_rate_percent}%`} | ${area.blank} |`),
    ``,
    `## Findings`,
    ``,
  ]
  if (!findings.length) {
    lines.push(`No blocking bugs found in this bounded run.`)
  } else {
    for (const finding of findings) {
      lines.push(`### ${finding.id}: ${finding.title}`)
      lines.push(`- Report ID: ${finding.report_id}`)
      lines.push(`- Bug key: ${finding.bug_key}`)
      lines.push(`- Severity: ${finding.severity}`)
      lines.push(`- Surface: ${finding.surface}`)
      lines.push(`- Page: ${finding.page}`)
      lines.push(`- Expected: ${finding.expected || 'n/a'}`)
      lines.push(`- Evidence: \`${boundedJson(finding.evidence, 1600).replace(/\n/g, ' ')}\``)
      lines.push(``)
    }
  }
  const pressure = events.find((event) => event.type === 'pressure_test')?.summary
  if (pressure) {
    lines.push(`## Pressure Summary`)
    lines.push(`- Requests: ${pressure.request_count}`)
    lines.push(`- Concurrency: ${pressure.concurrency}`)
    lines.push(`- Failures: ${pressure.failures}`)
    lines.push(`- p50/p95/p99: ${pressure.p50_ms}/${pressure.p95_ms}/${pressure.p99_ms} ms`)
  }
  const personaEvents = events.filter((event) => event.type === 'persona_study_plan')
  if (personaEvents.length) {
    lines.push(``)
    lines.push(`## Persona Study-Plan Summary`)
    for (const event of personaEvents) {
      if (event.status === 'not_run') {
        lines.push(`- not_run (${event.reason || 'unknown'})`)
      } else {
        lines.push(`- ${event.persona}: plan=${event.reachedPlanReview ? 'yes' : 'no'}, persona_match=${event.personaMatched ? 'yes' : 'no'}, schedule=${event.scheduleMentioned ? 'yes' : 'no'}, latency=${event.latency}ms`)
      }
    }
  }
  const uploadEvents = events.filter((event) => event.type === 'quick_question_upload')
  if (uploadEvents.length) {
    lines.push(``)
    lines.push(`## Quick Upload Summary`)
    for (const event of uploadEvents) {
      lines.push(`- ${event.case_id}: ${event.status || ''}${event.status === 'not_run' ? ` (${event.reason || ''})` : `, upload=${event.upload_succeeded ? 'yes' : 'no'}, answer=${event.answer_succeeded ? 'yes' : 'no'}, controlled_rejection=${event.controlled_rejection ? 'yes' : 'no'}, latency=${event.latency || ''}ms`}`)
    }
  }
  const seminar = events.find((event) => event.type === 'seminar_full_flow')
  if (seminar) {
    lines.push(``)
    lines.push(`## Seminar Full Flow`)
    lines.push(`- Status: ${seminar.status}`)
    lines.push(`- Room: ${seminar.room_id || ''}`)
    lines.push(`- Audio fixture: ${seminar.fixture_path || ''}`)
    lines.push(`- Steps: \`${JSON.stringify(Object.fromEntries(Object.entries(seminar.steps || {}).map(([key, value]) => [key, { status: value?.status, latency: value?.latency, ok: value?.ok, opened: value?.opened }]))).slice(0, 1200)}\``)
  }
  const board = events.find((event) => event.type === 'board_lesson_ask_ai')
  if (board) {
    lines.push(``)
    lines.push(`## Board Lesson Ask-AI`)
    lines.push(`- Status: ${board.status}`)
    lines.push(`- Session: ${board.session_id || ''}`)
    lines.push(`- Screenshot: ${board.steps?.browser?.screenshot || ''}`)
  }
  const visual = events.find((event) => event.type === 'visual_manual_review')
  if (visual) {
    lines.push(``)
    lines.push(`## Visual Manual Review Capture`)
    lines.push(`- Status: ${visual.status}`)
    for (const item of visual.screenshots || []) {
      lines.push(`- ${item.viewport} ${item.route}: ${item.screenshot}`)
    }
  }
  await fs.writeFile(path.join(OUT_DIR, 'report.md'), `${lines.join('\n')}\n`)
  const issueLines = [
    `# MentorMind Production Autopilot QA Issues`,
    ``,
    `Run: \`${RUN_ID}\``,
    `Base URL: ${BASE_URL}`,
    ``,
  ]
  if (!findings.length) {
    issueLines.push(`No issues generated for this run.`)
  } else {
    for (const finding of findings) {
      issueLines.push(findingIssueMarkdown(finding))
      issueLines.push(`---`)
      issueLines.push(``)
    }
  }
  await fs.writeFile(path.join(OUT_DIR, 'issues.md'), `${issueLines.join('\n')}\n`)
  return json
}

function rate(successes, executed) {
  if (!executed) return null
  return Math.round((successes / executed) * 10000) / 100
}

function buildRunSummary(allEvents, allFindings) {
  const findingKeys = new Set(allFindings.map((finding) => `${finding.surface}:${finding.page}:${finding.title}`))
  const areas = []
  function add(area, checks) {
    const executedChecks = checks.filter((check) => check.status !== 'not_run')
    const successes = executedChecks.filter((check) => check.success).length
    areas.push({
      area,
      executed: executedChecks.length,
      successes,
      success_rate_percent: rate(successes, executedChecks.length),
      blank: checks.length - executedChecks.length,
    })
  }

  add('page_viewports', allEvents.filter((event) => event.type === 'page_check').map((event) => ({
    success: Boolean(
      event.status
      && event.status < 500
      && (event.route === '/' || event.metrics?.bodyTextLength >= 80)
      && event.metrics?.scrollWidth <= event.metrics?.clientWidth + 8
      && !event.observed?.serverErrors?.length,
    ),
  })))
  add('quick_question_discussion_text', allEvents.filter((event) => event.type === 'quick_question_discussion').map((event) => ({
    status: event.status,
    success: /轮到你|Your Turn|反方|Counterpoint|追问|Probe|整理成短答|Draft/i.test(event.bodySnippet || '')
      && !/学习计划没有生成完成|deterministic|fallback/i.test(event.bodySnippet || ''),
  })))
  add('quick_question_upload_forms', allEvents.filter((event) => event.type === 'quick_question_upload').map((event) => ({
    status: event.status,
    success: event.status === 'passed' || event.status === 'controlled_rejection',
  })))
  add('study_plan_personas', allEvents.filter((event) => event.type === 'persona_study_plan').map((event) => ({
    status: event.status,
    success: Boolean(event.reachedPlanReview && event.personaMatched && event.scheduleMentioned && !event.usedFallback),
  })))
  add('study_plan_routing', allEvents.filter((event) => event.type === 'study_plan_routing').map((event) => ({
    status: event.status,
    success: Boolean(event.clicked && !/\/create(?:$|[/?#])/.test(event.url || '')),
  })))
  add('websocket', allEvents.filter((event) => event.type === 'websocket_smoke').map((event) => ({
    success: Boolean(event.result?.opened),
  })))
  add('weird_api', allEvents.filter((event) => event.type === 'weird_api').map((event) => ({
    success: Boolean(event.status && event.status < 500),
  })))
  add('upload_edge_api', allEvents.filter((event) => event.type === 'upload_edge').map((event) => ({
    success: Boolean(event.status && event.status < 500 && !event.rawGatewayHtml && [400, 401, 403, 422].includes(event.status)),
  })))
  add('pressure', allEvents.filter((event) => event.type === 'pressure_test').map((event) => ({
    success: Boolean(event.summary && event.summary.failures === 0 && (event.summary.p95_ms === null || event.summary.p95_ms <= 5000)),
  })))
  add('seminar_full_flow', allEvents.filter((event) => event.type === 'seminar_full_flow').map((event) => ({
    status: event.status,
    success: event.status === 'passed',
  })))
  add('board_lesson_ask_ai', allEvents.filter((event) => event.type === 'board_lesson_ask_ai').map((event) => ({
    status: event.status,
    success: event.status === 'passed',
  })))
  add('visual_manual_review', allEvents.filter((event) => event.type === 'visual_manual_review').map((event) => ({
    status: event.status,
    success: event.status === 'passed',
  })))

  const executed = areas.reduce((sum, area) => sum + area.executed, 0)
  const successes = areas.reduce((sum, area) => sum + area.successes, 0)
  return {
    executed_checks: executed,
    successful_checks: successes,
    success_rate_percent: rate(successes, executed),
    blank_checks: areas.reduce((sum, area) => sum + area.blank, 0),
    findings_count: allFindings.length,
    finding_keys_count: findingKeys.size,
    areas,
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  await postTelemetry('interaction', '/', {
    schema: 'mentormind.prod_autopilot_start.v1',
    run_id: RUN_ID,
    base_url: BASE_URL,
  })
  await ensureAuthSession()

  const browser = await chromium.launch({ headless: true })
  try {
    const viewports = [
      { name: 'desktop', size: { width: 1440, height: 900 } },
      { name: 'ipad', size: { width: 820, height: 1180 } },
      {
        name: 'iphone',
        size: { width: 390, height: 844 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    ]
    const routes = hasAuthSession()
      ? ['/', '/ask', '/study-plan', '/lessons', '/seminar', ...(RUN_ADMIN_QA ? ['/admin/feedback'] : [])]
      : ['/']
    for (const viewport of viewports) {
      for (const route of routes) {
        await checkPage(browser, route, viewport)
      }
    }
    await testWebSocket(browser)
    await testStudyPlanRouting(browser)
    await testQuickQuestion(browser)
    if (QA_RUN_UPLOAD_UI) {
      await testQuickQuestionUploadForms(browser)
    }
    if (RUN_PERSONA_QA) {
      await testStudyPlanPersonas(browser)
    }
    if (RUN_DEEP_WORKFLOW_QA) {
      if (RUN_SEMINAR_QA) {
        await testSeminarFullFlow(browser)
      }
      if (RUN_BOARD_QA) {
        await testBoardLessonAskWorkflow(browser)
      }
      if (RUN_VISUAL_QA) {
        await captureVisualManualReview(browser)
      }
    }
  } finally {
    await browser.close()
  }

  await testWeirdApiWorkflows()
  await testUploadEdges()
  await pressureTest()
  const report = await writeReport()
  console.log(JSON.stringify({
    run_id: RUN_ID,
    base_url: BASE_URL,
    out_dir: OUT_DIR,
    summary: report.summary,
    findings: report.findings.map((f) => ({ id: f.id, severity: f.severity, surface: f.surface, title: f.title })),
    pressure: events.find((event) => event.type === 'pressure_test')?.summary || null,
  }, null, 2))
}

main().catch(async (error) => {
  await addFinding({
    title: 'Production QA harness crashed',
    severity: 'blocked',
    surface: 'qa',
    page: '/',
    expected: 'The QA harness should complete and save artifacts.',
    evidence: { error: String(error), stack: error?.stack },
  }).catch(() => {})
  await writeReport().catch(() => {})
  console.error(error)
  process.exit(1)
})
