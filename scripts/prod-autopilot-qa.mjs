#!/usr/bin/env node

import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const BASE_URL = (process.env.BASE_URL || 'https://mentormind.cloud').replace(/\/$/, '')
const RUN_ID = `prod-autopilot-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`
const OUT_DIR = path.resolve(process.cwd(), process.env.OUT_DIR || `.browser-sessions/prod-autopilot-qa/${RUN_ID}`)
const PRESSURE_CONCURRENCY = Number(process.env.PRESSURE_CONCURRENCY || 8)
const PRESSURE_REQUESTS = Number(process.env.PRESSURE_REQUESTS || 80)
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 90000)
const RUN_PERSONA_QA = process.env.RUN_PERSONA_QA !== 'false'
const PERSONA_LIMIT = Number(process.env.PERSONA_LIMIT || 4)
const QA_INVITE_CODE = process.env.QA_INVITE_CODE || ''
const QA_USERNAME = process.env.QA_USERNAME || `qa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
const QA_PASSWORD = process.env.QA_PASSWORD || `qa_${Math.random().toString(36).slice(2, 10)}`

const findings = []
const events = []
let authSession = null

function nowIso() {
  return new Date().toISOString()
}

function sanitizeName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'artifact'
}

function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return Math.round(sorted[idx])
}

async function postTelemetry(eventType, page, payload, latencyMs = null) {
  const body = {
    session_id: RUN_ID,
    event_type: eventType,
    page,
    url: `${BASE_URL}${page}`,
    latency_ms: latencyMs,
    payload: {
      source: 'prod_autopilot_qa',
      run_id: RUN_ID,
      ...payload,
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
  if (!QA_INVITE_CODE) {
    events.push({ type: 'auth_skipped', reason: 'QA_INVITE_CODE not provided' })
    return null
  }
  const registerBody = {
    invite_code: QA_INVITE_CODE,
    username: QA_USERNAME,
    password: QA_PASSWORD,
    language: 'zh',
  }
  let res = await fetch(`${BASE_URL}/api/backend/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerBody),
  })
  let data = await res.json().catch(() => ({}))
  if (res.status === 409) {
    res = await fetch(`${BASE_URL}/api/backend/auth/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: QA_USERNAME, password: QA_PASSWORD, language: 'zh' }),
    })
    data = await res.json().catch(() => ({}))
  }
  if (!res.ok || !data?.token) {
    await addFinding({
      title: 'Could not create/login production QA account',
      severity: 'blocked',
      surface: 'auth',
      page: '/auth',
      expected: 'QA harness should be able to create or reuse a disposable account through invite auth.',
      evidence: { status: res.status, data, username: QA_USERNAME },
      report: true,
    })
    return null
  }
  authSession = {
    token: data.token,
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
  const finding = {
    id: `BUG-${String(findings.length + 1).padStart(3, '0')}`,
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
      interaction_id: finding.id,
      severity,
      user_note: title,
      expected_behavior: expected,
      context: {
        run_id: RUN_ID,
        evidence,
        route: page,
        base_url: BASE_URL,
      },
    })
  }
  return finding
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
    }))
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

async function setStudyDays(page, desiredDays) {
  const dayLabels = {
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
  }
  const current = new Set(['mon', 'wed', 'fri'])
  const desired = new Set(desiredDays)
  for (const [value, label] of Object.entries(dayLabels)) {
    const shouldBeActive = desired.has(value)
    const isActive = current.has(value)
    if (shouldBeActive !== isActive) {
      await page.locator('button').filter({ hasText: new RegExp(`^${label}$`) }).click()
      if (shouldBeActive) current.add(value)
      else current.delete(value)
      await page.waitForTimeout(80)
    }
  }
}

async function fillStudyPlanPersona(page, persona) {
  await page.locator('select').nth(0).selectOption(persona.foundation)
  await page.locator('input').nth(0).fill(persona.examTimeline)
  await page.locator('input').nth(1).fill(persona.targetScore)
  await page.locator('input').nth(2).fill(String(persona.weeklyHours))
  await page.locator('input').nth(3).fill(String(persona.prepMonths))
  await page.locator('input').nth(4).fill(String(persona.hoursPerSession))
  await setStudyDays(page, persona.studyDays)
  await page.locator('textarea').fill(persona.notes)
  if (persona.baseline?.length) {
    for (const [index, value] of persona.baseline.entries()) {
      await page.locator('select').nth(index + 1).selectOption(value)
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
  const personas = STUDY_PLAN_PERSONAS.slice(0, Math.max(0, PERSONA_LIMIT))
  for (const persona of personas) {
    const { context, page, observed } = await createObservedPage(browser, { name: `persona-${persona.id}`, size: { width: 1365, height: 900 } })
    const started = performance.now()
    let shot = null
    try {
      await page.goto(`${BASE_URL}/study-plan`, { waitUntil: 'networkidle', timeout: 45000 })
      await page.locator('button').filter({ hasText: /AP \(Advanced Placement\)/ }).click()
      await page.waitForTimeout(300)
      await page.locator('button').filter({ hasText: /^📐?\s*Mathematics|Mathematics$/ }).last().click()
      await page.waitForTimeout(300)
      await page.locator('button').filter({ hasText: /^AP Calculus BC$/ }).click()
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
    events.push({ type: 'quick_question_discussion', latency, bodySnippet: body.slice(-3000), observed, screenshot: shot })
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

async function testStudyPlanRouting(browser) {
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
    events.push({ type: 'study_plan_routing', clicked, url, observed, screenshot_before: shotBefore, screenshot_after: shotAfter })
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
      expectedStatuses: [400, 401, 403, 422],
    },
    {
      name: 'unsupported audio text file',
      path: '/api/backend/ingest/audio',
      form: () => {
        const form = new FormData()
        form.append('file', new Blob(['not audio'], { type: 'text/plain' }), 'not-audio.txt')
        return form
      },
      expectedStatuses: [400, 401, 403, 422],
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
    if (!status || status >= 500 || rawGatewayHtml || !item.expectedStatuses.includes(status)) {
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
  const json = {
    run_id: RUN_ID,
    base_url: BASE_URL,
    created_at: nowIso(),
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
    `## Findings`,
    ``,
  ]
  if (!findings.length) {
    lines.push(`No blocking bugs found in this bounded run.`)
  } else {
    for (const finding of findings) {
      lines.push(`### ${finding.id}: ${finding.title}`)
      lines.push(`- Severity: ${finding.severity}`)
      lines.push(`- Surface: ${finding.surface}`)
      lines.push(`- Page: ${finding.page}`)
      lines.push(`- Expected: ${finding.expected || 'n/a'}`)
      lines.push(`- Evidence: \`${JSON.stringify(finding.evidence).slice(0, 1600)}\``)
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
      lines.push(`- ${event.persona}: plan=${event.reachedPlanReview ? 'yes' : 'no'}, persona_match=${event.personaMatched ? 'yes' : 'no'}, schedule=${event.scheduleMentioned ? 'yes' : 'no'}, latency=${event.latency}ms`)
    }
  }
  await fs.writeFile(path.join(OUT_DIR, 'report.md'), `${lines.join('\n')}\n`)
  return json
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
    const routes = ['/', '/ask', '/study-plan', '/seminar']
    for (const viewport of viewports) {
      for (const route of routes) {
        await checkPage(browser, route, viewport)
      }
    }
    await testWebSocket(browser)
    await testStudyPlanRouting(browser)
    await testQuickQuestion(browser)
    if (RUN_PERSONA_QA) {
      await testStudyPlanPersonas(browser)
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
