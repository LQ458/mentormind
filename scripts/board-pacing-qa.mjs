#!/usr/bin/env node

import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const RUN_LOCAL_BOARD_TEST = process.env.RUN_LOCAL_BOARD_TEST === 'true'
const BASE_URL = (process.env.BASE_URL || (RUN_LOCAL_BOARD_TEST ? 'http://localhost:3000' : 'https://mentormind.cloud')).replace(/\/$/, '')
const RUN_ID = `board-pacing-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`
const OUT_DIR = path.resolve(process.cwd(), process.env.OUT_DIR || `.browser-sessions/board-pacing-qa/${RUN_ID}`)
const SIMULATION_SOURCE = 'board_pacing_qa'
const QA_INVITE_CODE = process.env.QA_INVITE_CODE || ''
const QA_USERNAME = process.env.QA_USERNAME || `boardqa_sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
const QA_PASSWORD = process.env.QA_PASSWORD || `boardqa_${Math.random().toString(36).slice(2, 10)}`
const BOARD_TOPICS = splitEnvList(process.env.BOARD_TOPICS || [
  'AP Calculus BC: one-sided limits and continuity',
  'IB History: causes of the French Revolution',
  'A Level Physics: electric fields and potential',
].join('|'), '|')
const VIEWPORTS = [
  { name: 'desktop', size: { width: 1365, height: 900 } },
  { name: 'iphone', size: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
]
const MAX_LESSONS = Number(process.env.MAX_LESSONS || BOARD_TOPICS.length)
const LESSON_TIMEOUT_MS = Number(process.env.LESSON_TIMEOUT_MS || 180000)
const STATE_POLL_INTERVAL_MS = Number(process.env.STATE_POLL_INTERVAL_MS || 3000)
const STATE_STABLE_MS = Number(process.env.STATE_STABLE_MS || 24000)
const LOCAL_PACING_CHECK_MS = Number(process.env.LOCAL_PACING_CHECK_MS || 1200)

const events = []
const findings = []
let authSession = null

function splitEnvList(value, delimiter = ',') {
  if (!value) return []
  return value.split(delimiter).map((item) => item.trim()).filter(Boolean)
}

function sanitizeName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'artifact'
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldIgnoreRequestFailure(req) {
  const failure = req.failure()?.errorText || ''
  if (!/net::ERR_ABORTED/i.test(failure)) return false
  try {
    const url = new URL(req.url())
    const base = new URL(BASE_URL)
    return url.origin === base.origin && url.pathname.startsWith('/_next/static/')
  } catch {
    return false
  }
}

function recordFailedRequest(observed, req) {
  if (shouldIgnoreRequestFailure(req) || shouldIgnoreLocalFontRequestFailure(req)) return
  observed.failedRequests.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText || '' })
}

function shouldIgnoreLocalFontRequestFailure(req) {
  if (!RUN_LOCAL_BOARD_TEST) return false
  try {
    const url = new URL(req.url())
    return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  } catch {
    return false
  }
}

function shouldIgnoreServerError(url, status) {
  if (!RUN_LOCAL_BOARD_TEST) return false
  if (status !== 502) return false
  try {
    const parsed = new URL(url)
    const base = new URL(BASE_URL)
    return parsed.origin === base.origin && parsed.pathname === '/api/backend/telemetry/event'
  } catch {
    return false
  }
}

function recordServerError(observed, res) {
  const url = res.url()
  const status = res.status()
  if (status < 500) return
  if (shouldIgnoreServerError(url, status)) return
  observed.serverErrors.push({ url, status })
}

async function fetchJson(url, options = {}) {
  const started = performance.now()
  const res = await fetch(url, options)
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  return { ok: res.ok, status: res.status, data, text, headers: res.headers, latency_ms: Math.round(performance.now() - started) }
}

// The auth proxy moves the JWT into an httpOnly `mm_token` cookie and strips it
// from the JSON body, so register/login responses no longer carry `data.token`.
function extractCookieToken(res) {
  try {
    const raw = res.headers?.getSetCookie?.().join('; ') || res.headers?.get?.('set-cookie') || ''
    const m = raw.match(/mm_token=([^;]+)/)
    return m ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

async function ensureAuthSession() {
  if (authSession) return authSession
  if (!QA_INVITE_CODE) throw new Error('QA_INVITE_CODE is required')
  const registerBody = {
    invite_code: QA_INVITE_CODE,
    username: QA_USERNAME,
    password: QA_PASSWORD,
    language: 'zh',
  }
  let res = await fetchJson(`${BASE_URL}/api/backend/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerBody),
  })
  if (res.status === 409) {
    res = await fetchJson(`${BASE_URL}/api/backend/auth/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: QA_USERNAME, password: QA_PASSWORD, language: 'zh' }),
    })
  }
  const token = res.data?.token || extractCookieToken(res)
  if (!res.ok || !token) {
    throw new Error(`auth failed: ${res.status} ${res.text.slice(0, 300)}`)
  }
  authSession = {
    token,
    user: {
      id: res.data.user?.id || '',
      username: res.data.user?.username || QA_USERNAME,
      fullName: res.data.user?.username || QA_USERNAME,
    },
  }
  return authSession
}

function authHeaders(json = false) {
  const headers = { Authorization: `Bearer ${authSession.token}` }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

async function createBoardSession(topic, index) {
  const planData = {
    subject: topic.includes('History') ? 'history' : topic.includes('Physics') ? 'physics' : 'mathematics',
    framework: topic.includes('IB') ? 'IB' : topic.includes('A Level') ? 'A Level' : 'AP',
    course_name: topic.split(':')[0],
    title: `Board pacing QA ${index + 1}: ${topic}`,
    description: 'Disposable production QA plan for board pacing and display inspection.',
    estimated_hours: 1,
    diagnostic_context: {
      qa_run_id: RUN_ID,
      board_pacing: true,
      simulated: true,
      simulation_source: SIMULATION_SOURCE,
    },
    units: [{
      title: topic.split(':').slice(1).join(':').trim() || topic,
      description: 'Short lesson used to test board pacing, narration alignment, and visual state.',
      topics: [topic],
      learning_objectives: ['Explain the core idea clearly with examples and one check question.'],
      estimated_minutes: 20,
    }],
  }
  const created = await fetchJson(`${BASE_URL}/api/backend/study-plan/create`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ plan_data: planData, language: 'en', request_id: `board-pacing-${RUN_ID}-${index}` }),
  })
  if (!created.ok || !created.data?.plan_id) throw new Error(`create plan failed: ${created.status}`)
  const planId = created.data.plan_id
  const loaded = await fetchJson(`${BASE_URL}/api/backend/study-plan/${planId}`, {
    headers: authHeaders(false),
  })
  const unitId = loaded.data?.plan?.units?.[0]?.id
  if (!loaded.ok || !unitId) throw new Error(`load plan/unit failed: ${loaded.status}`)
  const board = await fetchJson(`${BASE_URL}/api/backend/study-plan/${planId}/unit/${unitId}/board-lesson`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ language: 'en' }),
  })
  if (!board.ok || !board.data?.session_id) throw new Error(`create board failed: ${board.status}`)
  return { planId, unitId, sessionId: board.data.session_id, create: created, board }
}

async function createObservedContext(browser, viewport) {
  const context = await browser.newContext({
    viewport: viewport.size,
    locale: 'en-US',
    userAgent: viewport.userAgent,
  })
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
  const page = await context.newPage()
  const observed = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    serverErrors: [],
    audioResponses: [],
    websocketFrames: [],
  }
  page.on('console', (msg) => {
    if (msg.type() === 'error') observed.consoleErrors.push({ text: msg.text().slice(0, 1000), location: msg.location() })
  })
  page.on('pageerror', (error) => observed.pageErrors.push(String(error).slice(0, 1000)))
  page.on('requestfailed', (req) => {
    recordFailedRequest(observed, req)
  })
  page.on('response', async (res) => {
    const url = res.url()
    recordServerError(observed, res)
    if (/board-audio|\/api\/backend\/media\/.*audio/i.test(url)) {
      observed.audioResponses.push({ url, status: res.status(), headers: await safeHeaders(res) })
    }
  })
  page.on('websocket', (ws) => {
    const wsStarted = performance.now()
    ws.on('framereceived', (frame) => {
      const text = typeof frame.payload === 'string' ? frame.payload : frame.payload?.toString?.() || ''
      if (!text.startsWith('{')) return
      try {
        const payload = JSON.parse(text)
        observed.websocketFrames.push({
          received_ms: Math.round(performance.now() - wsStarted),
          event_type: payload.event_type,
          element_id: payload.element_id || null,
          timestamp: payload.timestamp || null,
          data: compactEventData(payload.data || {}),
        })
      } catch {}
    })
  })
  return { context, page, observed }
}

async function safeHeaders(res) {
  try {
    const headers = await res.allHeaders()
    return {
      contentType: headers['content-type'] || '',
      contentLength: headers['content-length'] || '',
      acceptRanges: headers['accept-ranges'] || '',
    }
  } catch {
    return {}
  }
}

function compactEventData(data) {
  const out = {}
  for (const key of ['title', 'topic', 'element_type', 'content', 'narration', 'narration_text', 'audio_path', 'duration_ms', 'error']) {
    if (data[key] === undefined) continue
    const value = data[key]
    out[key] = typeof value === 'string' && value.length > 300 ? `${value.slice(0, 300)}...[${value.length}]` : value
  }
  return out
}

async function screenshot(page, label) {
  const file = path.join(OUT_DIR, `${sanitizeName(label)}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function waitForBoardSettled(sessionId, started) {
  const polls = []
  let latest = null
  let lastSignature = ''
  let stableSince = performance.now()
  let settled = false
  let lastPoll = null
  const deadline = performance.now() + Math.max(30000, LESSON_TIMEOUT_MS - 15000)

  while (performance.now() < deadline) {
    const now = performance.now()
    try {
      latest = await fetchJson(`${BASE_URL}/api/backend/board/${sessionId}/state`, {
        headers: authHeaders(false),
      })
    } catch (error) {
      polls.push({
        elapsed_ms: Math.round(now - started),
        error: String(error).slice(0, 300),
      })
      await sleep(STATE_POLL_INTERVAL_MS)
      continue
    }

    const snap = latest?.data?.session || latest?.data?.state || {}
    const elements = snap.elements || {}
    const elementCount = Object.keys(elements).length
    const audioQueue = Array.isArray(snap.audio_queue) ? snap.audio_queue : []
    const narrationLog = Array.isArray(snap.narration_log) ? snap.narration_log : []
    const narratedCount = Object.values(elements).filter((el) => String(el?.narration || '').trim()).length
    const status = String(snap.status || latest?.data?.status || '')
    const signature = [
      status,
      elementCount,
      audioQueue.length,
      narrationLog.length,
      snap.last_event_seq || '',
      snap.updated_at || '',
    ].join(':')
    const updatedNow = performance.now()
    if (signature !== lastSignature) {
      lastSignature = signature
      stableSince = updatedNow
    }
    const stableMs = updatedNow - stableSince
    lastPoll = {
      elapsed_ms: Math.round(updatedNow - started),
      status,
      element_count: elementCount,
      audio_queue_count: audioQueue.length,
      narration_count: narrationLog.length,
      narrated_count: narratedCount,
      stable_ms: Math.round(stableMs),
    }
    polls.push(lastPoll)

    if (/^(done|completed|complete|error)$/i.test(status)) {
      settled = true
      break
    }
    if (
      elementCount > 0 &&
      stableMs >= STATE_STABLE_MS &&
      audioQueue.length >= Math.min(narrationLog.length || narratedCount, narratedCount || narrationLog.length)
    ) {
      settled = true
      break
    }
    await sleep(STATE_POLL_INTERVAL_MS)
  }

  return { finalState: latest, statePolls: polls, settled, lastPoll }
}

async function analyzeLesson(record) {
  const frames = record.observed.websocketFrames
  const elements = frames.filter((f) => f.event_type === 'element_added')
  const audioReady = frames.filter((f) => f.event_type === 'audio_ready')
  const audioErrors = frames.filter((f) => f.event_type === 'audio_error')
  const elementOrder = elements.map((f) => f.element_id).filter(Boolean)
  const audioOrder = audioReady.map((f) => f.element_id).filter(Boolean)
  const firstAudioMs = audioReady[0]?.received_ms ?? null
  const elementsBeforeFirstAudio = firstAudioMs == null ? elements.length : elements.filter((f) => f.received_ms < firstAudioMs).length
  const elementIndex = new Map(elementOrder.map((id, index) => [id, index]))
  const audioIndexSequence = audioOrder.map((id) => elementIndex.get(id)).filter((v) => typeof v === 'number')
  const audioOutOfOrder = audioIndexSequence.some((value, index, arr) => index > 0 && value < arr[index - 1])
  const elementAudioLags = elements.map((element) => {
    const audio = audioReady.find((item) => item.element_id === element.element_id)
    return {
      element_id: element.element_id,
      element_type: element.data.element_type,
      element_ms: element.received_ms,
      audio_ms: audio?.received_ms ?? null,
      lag_ms: audio ? audio.received_ms - element.received_ms : null,
      narration_len: String(element.data.narration || '').length,
      content_len: String(element.data.content || '').length,
    }
  })
  const missingAudioForNarrated = elementAudioLags.filter((item) => item.narration_len > 0 && item.audio_ms == null)
  const maxLagMs = Math.max(0, ...elementAudioLags.map((item) => item.lag_ms || 0))
  const totalAudioDurationMs = audioReady.reduce((sum, item) => sum + (Number(item.data.duration_ms) || 0), 0)
  const generationSpanMs = elements.length > 1 ? elements[elements.length - 1].received_ms - elements[0].received_ms : 0
  const playbackBacklogMs = Math.max(0, totalAudioDurationMs - generationSpanMs)
  const finalState = record.finalState?.data?.session || {}
  const stateElements = finalState.elements || {}
  const stateStatus = String(finalState.status || '')
  const isSettled = Boolean(record.settled || /^(done|completed|complete|error)$/i.test(stateStatus))
  const displayMetrics = record.displayMetrics || {}
  const issues = []
  if (elementsBeforeFirstAudio > 2) {
    issues.push({
      type: 'pacing_ahead_of_speech',
      severity: 'high',
      message: `${elementsBeforeFirstAudio} board elements rendered before the first audio_ready event.`,
    })
  }
  if (audioOutOfOrder) {
    issues.push({
      type: 'audio_out_of_element_order',
      severity: 'high',
      message: `Audio readiness order (${audioIndexSequence.join(',')}) does not match element order.`,
    })
  }
  if (maxLagMs > 10000) {
    issues.push({
      type: 'slow_audio_lag',
      severity: 'medium',
      message: `Max element-to-audio lag was ${maxLagMs}ms.`,
    })
  }
  if (playbackBacklogMs > 15000) {
    issues.push({
      type: 'speech_playback_backlog',
      severity: 'medium',
      message: `Total audio duration (${totalAudioDurationMs}ms) exceeds board generation span (${generationSpanMs}ms) by ${playbackBacklogMs}ms.`,
    })
  }
  if (missingAudioForNarrated.length && isSettled) {
    issues.push({
      type: 'missing_audio_for_narration',
      severity: 'medium',
      message: `${missingAudioForNarrated.length} narrated element(s) had no audio_ready event.`,
    })
  }
  if (missingAudioForNarrated.length && !isSettled) {
    issues.push({
      type: 'lesson_not_settled',
      severity: 'inconclusive',
      message: `${missingAudioForNarrated.length} narrated element(s) were still waiting for audio when the run stopped.`,
    })
  }
  if (audioErrors.length) {
    issues.push({
      type: 'audio_error_event',
      severity: 'high',
      message: `${audioErrors.length} audio_error event(s) were emitted.`,
    })
  }
  if (displayMetrics.horizontalOverflow) {
    issues.push({
      type: 'horizontal_overflow',
      severity: 'visual',
      message: `scrollWidth ${displayMetrics.scrollWidth} > clientWidth ${displayMetrics.clientWidth}.`,
    })
  }
  if (displayMetrics.internalErrorTextVisible) {
    issues.push({
      type: 'internal_error_visible',
      severity: 'visual',
      message: `Internal error text was visible: ${displayMetrics.internalErrorExcerpt || 'no excerpt captured'}`,
    })
  }
  if (displayMetrics.rawMarkupVisible) {
    issues.push({
      type: 'raw_markup_visible',
      severity: 'visual',
      message: `Raw markup text was visible: ${displayMetrics.rawMarkupExcerpt || 'no excerpt captured'}`,
    })
  }
  if (displayMetrics.footerOverBoard) {
    issues.push({
      type: 'footer_overlaps_board',
      severity: 'visual',
      message: `Bottom controls overlap the board by ${displayMetrics.footerOverlapPx}px.`,
    })
  }
  if (record.observed.failedRequests.length || record.observed.serverErrors.length) {
    issues.push({
      type: 'network_display_error',
      severity: 'blocked',
      message: `${record.observed.failedRequests.length} failed requests and ${record.observed.serverErrors.length} server errors.`,
    })
  }
  if (!Object.keys(stateElements).length) {
    issues.push({ type: 'empty_board', severity: 'blocked', message: 'Final board state has zero elements.' })
  }
  record.analysis = {
    element_count: elements.length,
    audio_ready_count: audioReady.length,
    audio_error_count: audioErrors.length,
    elements_before_first_audio: elementsBeforeFirstAudio,
    first_audio_ms: firstAudioMs,
    max_audio_lag_ms: maxLagMs,
    total_audio_duration_ms: totalAudioDurationMs,
    generation_span_ms: generationSpanMs,
    playback_backlog_ms: playbackBacklogMs,
    audio_out_of_order: audioOutOfOrder,
    element_audio_lags: elementAudioLags,
    issues,
  }
  if (issues.length) {
    findings.push({
      topic: record.topic,
      viewport: record.viewport,
      session_id: record.sessionId,
      issues,
      screenshot: record.screenshot,
    })
  }
}

async function collectDisplayMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const bodyText = document.body?.innerText || ''
    const internalMatch = bodyText.match(/(?:Validation failed|parse failed|Unterminated string|Traceback|JSONDecodeError|Pydantic|tool 'invoke_|Exception:|Error:)/i)
    const rawMarkupMatch = bodyText.match(/<\/?(?:b|strong|i|em|br|p|ul|ol|li|span|div|code)[^>]*>/i)
    const boardRect = document.querySelector('.board-canvas')?.getBoundingClientRect()
    const footerRect = document.querySelector('footer')?.getBoundingClientRect()
    let footerOverlapPx = 0
    if (boardRect && footerRect) {
      const overlapX = Math.max(0, Math.min(boardRect.right, footerRect.right) - Math.max(boardRect.left, footerRect.left))
      const overlapY = Math.max(0, Math.min(boardRect.bottom, footerRect.bottom) - Math.max(boardRect.top, footerRect.top))
      if (overlapX > 20 && overlapY > 8) footerOverlapPx = Math.round(overlapY)
    }
    const candidates = [...document.querySelectorAll('main [class*="rounded"], main canvas, main [data-testid], aside [class*="rounded"]')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        const text = (el.textContent || '').trim()
        return { x: r.x, y: r.y, width: r.width, height: r.height, text: text.slice(0, 80), tag: el.tagName }
      })
      .filter((r) => r.width > 20 && r.height > 12)
    let overlappingCount = 0
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i]
        const b = candidates[j]
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
        const area = overlapX * overlapY
        const minArea = Math.min(a.width * a.height, b.width * b.height)
        if (minArea > 0 && area / minArea > 0.35) overlappingCount++
      }
    }
    return {
      bodyTextLength: document.body?.innerText?.trim().length || 0,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 8,
      overlappingCount,
      visibleCards: candidates.length,
      internalErrorTextVisible: Boolean(internalMatch),
      internalErrorExcerpt: internalMatch ? bodyText.slice(Math.max(0, internalMatch.index - 80), internalMatch.index + 220) : '',
      rawMarkupVisible: Boolean(rawMarkupMatch),
      rawMarkupExcerpt: rawMarkupMatch ? bodyText.slice(Math.max(0, rawMarkupMatch.index - 80), rawMarkupMatch.index + 220) : '',
      footerOverBoard: footerOverlapPx > 0,
      footerOverlapPx,
    }
  })
}

async function collectBoardTestMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const sectionIds = [...document.querySelectorAll('[data-element-id]')]
      .map((el) => el.getAttribute('data-element-id'))
      .filter(Boolean)
    const offenders = [...document.querySelectorAll('.board-canvas, .board-equation, .katex-display, pre, table, [data-element-id], header, footer')]
      .map((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return null
        if (rect.left >= -1 && rect.right <= window.innerWidth + 1) return null
        return {
          tag: el.tagName.toLowerCase(),
          className: String(el.getAttribute('class') || '').slice(0, 140),
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }
      })
      .filter(Boolean)
      .slice(0, 20)
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      renderedSections: sectionIds.length,
      sectionIds,
      offenders,
    }
  })
}

async function waitForBoardTestHydration(page) {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    }
    try {
      await page.waitForFunction(() => {
        return document.querySelector('[data-testid="board-test-root"]')?.getAttribute('data-hydrated') === 'true'
      }, null, { timeout: 10000 })
      return
    } catch (error) {
      lastError = error
      await page.waitForTimeout(750)
    }
  }
  throw lastError || new Error('board-test hydration did not complete')
}

async function runLocalBoardTest(browser, viewport) {
  const context = await browser.newContext({
    viewport: viewport.size,
    locale: viewport.locale || 'en-US',
    userAgent: viewport.userAgent,
  })
  const page = await context.newPage()
  const record = {
    topic: '/board-test local harness',
    viewport: viewport.name,
    sessionId: 'local-board-test',
    observed: { failedRequests: [], serverErrors: [], consoleErrors: [], pageErrors: [] },
  }
  page.on('console', (msg) => {
    if (msg.type() === 'error') record.observed.consoleErrors.push({ text: msg.text().slice(0, 1000), location: msg.location() })
  })
  page.on('pageerror', (error) => record.observed.pageErrors.push(String(error).slice(0, 1000)))
  page.on('requestfailed', (req) => {
    recordFailedRequest(record.observed, req)
  })
  page.on('response', (res) => {
    recordServerError(record.observed, res)
  })
  try {
    await page.goto(`${BASE_URL}/board-test`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForBoardTestHydration(page)
    const addAllButton = page.getByTestId('btn-add-all')
    await addAllButton.waitFor({ state: 'attached', timeout: 15000 })
    const before = await collectBoardTestMetrics(page)
    await addAllButton.evaluate((button) => button.scrollIntoView({ block: 'center', inline: 'center' })).catch(() => {})
    try {
      await addAllButton.click({ timeout: 5000 })
    } catch {
      await addAllButton.evaluate((button) => button.click())
    }
    await page.waitForFunction(() => {
      return document.querySelector('[data-testid="board-test-root"]')?.getAttribute('data-count') === '14'
    }, null, { timeout: 5000 })
    await page.waitForTimeout(250)
    const afterAddAllSoon = await collectBoardTestMetrics(page)
    await page.waitForTimeout(LOCAL_PACING_CHECK_MS)
    const afterPacingDelay = await collectBoardTestMetrics(page)
    record.displayMetrics = afterPacingDelay
    record.localBoardTest = { before, afterAddAllSoon, afterPacingDelay }
    record.screenshot = await screenshot(page, `local-${viewport.name}-board-test`)

    const isMobile = viewport.size.width < 768
    const issues = []
    for (const [label, metrics] of Object.entries(record.localBoardTest)) {
      if (metrics.horizontalOverflow || metrics.offenders.length) {
        issues.push({
          type: 'horizontal_overflow',
          severity: 'visual',
          message: `${label}: scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth}; offenders=${metrics.offenders.length}.`,
        })
      }
    }
    if (isMobile) {
      const beforeCount = before.renderedSections
      const soonCount = afterAddAllSoon.renderedSections
      const laterCount = afterPacingDelay.renderedSections
      if (soonCount > beforeCount + 1) {
        issues.push({
          type: 'mobile_board_revealed_too_fast',
          severity: 'high',
          message: `Mobile board jumped from ${beforeCount} to ${soonCount} sections within 250ms after Add all.`,
        })
      }
      if (laterCount <= soonCount && beforeCount < 14) {
        issues.push({
          type: 'mobile_board_pacing_stalled',
          severity: 'medium',
          message: `Mobile board did not reveal another section after ${LOCAL_PACING_CHECK_MS}ms; ${soonCount} -> ${laterCount}.`,
        })
      }
    }
    if (record.observed.failedRequests.length || record.observed.serverErrors.length) {
      issues.push({
        type: 'network_display_error',
        severity: 'blocked',
        message: `${record.observed.failedRequests.length} failed requests and ${record.observed.serverErrors.length} server errors.`,
      })
    }
    record.analysis = {
      element_count: afterPacingDelay.renderedSections,
      audio_ready_count: '',
      elements_before_first_audio: '',
      playback_backlog_ms: '',
      max_audio_lag_ms: '',
      issues,
    }
    if (issues.length) {
      findings.push({
        topic: record.topic,
        viewport: record.viewport,
        session_id: record.sessionId,
        issues,
        screenshot: record.screenshot,
      })
    }
    events.push(record)
  } catch (error) {
    const message = String(error)
    record.error = message
    try {
      record.displayMetrics = await collectBoardTestMetrics(page)
    } catch {}
    try {
      record.screenshot = await screenshot(page, `local-${viewport.name}-board-test-crash`)
    } catch {}
    record.analysis = {
      element_count: record.displayMetrics?.renderedSections ?? '',
      audio_ready_count: '',
      elements_before_first_audio: '',
      playback_backlog_ms: '',
      max_audio_lag_ms: '',
      issues: [{ type: 'local_board_test_crash', severity: 'blocked', message }],
    }
    findings.push({
      topic: record.topic,
      viewport: record.viewport,
      session_id: record.sessionId,
      issues: record.analysis.issues,
      screenshot: record.screenshot,
    })
    events.push(record)
  } finally {
    await context.close()
  }
}

async function runLesson(browser, topic, index, viewport) {
  const board = await createBoardSession(topic, index)
  const record = {
    topic,
    viewport: viewport.name,
    planId: board.planId,
    unitId: board.unitId,
    sessionId: board.sessionId,
    observed: null,
  }
  const { context, page, observed } = await createObservedContext(browser, viewport)
  record.observed = observed
  try {
    const started = performance.now()
    await page.goto(`${BASE_URL}/board/${board.sessionId}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForFunction(() => {
      const text = document.body.innerText || ''
      return /Writing on the board|AI Teacher|AI 老师|done|error/i.test(text)
    }, { timeout: 90000 }).catch(() => null)
    const settled = await waitForBoardSettled(board.sessionId, started)
    record.finalState = settled.finalState
    record.statePolls = settled.statePolls
    record.settled = settled.settled
    record.lastStatePoll = settled.lastPoll
    record.elapsed_ms = Math.round(performance.now() - started)
    record.displayMetrics = await collectDisplayMetrics(page).catch((error) => ({ error: String(error) }))
    record.screenshot = await screenshot(page, `${index + 1}-${viewport.name}-${topic}`)
  } finally {
    await context.close()
  }
  await analyzeLesson(record)
  events.push(record)
  return record
}

async function writeReport() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const summary = {
    run_id: RUN_ID,
    base_url: BASE_URL,
    generated_at: new Date().toISOString(),
    lessons_run: events.length,
    findings_count: findings.length,
    issue_counts: findings.reduce((acc, finding) => {
      for (const issue of finding.issues) acc[issue.type] = (acc[issue.type] || 0) + 1
      return acc
    }, {}),
  }
  const report = { summary, events, findings }
  await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  const lines = [
    '# Board Pacing QA',
    '',
    `Run: \`${RUN_ID}\``,
    `Base URL: \`${BASE_URL}\``,
    '',
    '## Summary',
    '',
    `- Lessons run: ${summary.lessons_run}`,
    `- Findings: ${summary.findings_count}`,
    `- Issue counts: ${JSON.stringify(summary.issue_counts)}`,
    '',
    '## Lessons',
    '',
    '| Topic | Viewport | Settled | Elements | Audio ready | Before first audio | Backlog | Max lag | Issues | Screenshot |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...events.map((event) => [
      event.topic,
      event.viewport,
      event.settled ?? '',
      event.analysis?.element_count ?? '',
      event.analysis?.audio_ready_count ?? '',
      event.analysis?.elements_before_first_audio ?? '',
      event.analysis?.playback_backlog_ms ?? '',
      event.analysis?.max_audio_lag_ms ?? '',
      (event.analysis?.issues || []).map((issue) => issue.type).join(', ') || 'none',
      event.screenshot || '',
    ].map((cell) => `\`${String(cell).replaceAll('`', '')}\``).join(' | ')).map((row) => `| ${row} |`),
    '',
    '## Findings',
    '',
    ...(findings.length ? findings.flatMap((finding, index) => [
      `### Finding ${index + 1}: ${finding.topic} (${finding.viewport})`,
      '',
      `Session: \`${finding.session_id}\``,
      `Screenshot: \`${finding.screenshot}\``,
      '',
      ...finding.issues.map((issue) => `- ${issue.severity}: ${issue.type} — ${issue.message}`),
      '',
    ]) : ['No findings.']),
  ]
  await fs.writeFile(path.join(OUT_DIR, 'report.md'), `${lines.join('\n')}\n`)
  return report
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    if (RUN_LOCAL_BOARD_TEST) {
      for (const viewport of VIEWPORTS) {
        await runLocalBoardTest(browser, viewport).catch((error) => {
          const record = { topic: '/board-test local harness', viewport: viewport.name, error: String(error), observed: { failedRequests: [], serverErrors: [] } }
          events.push(record)
          findings.push({ topic: record.topic, viewport: viewport.name, session_id: null, issues: [{ type: 'local_board_test_crash', severity: 'blocked', message: String(error) }] })
        })
      }
    } else {
      await ensureAuthSession()
      const topics = BOARD_TOPICS.slice(0, MAX_LESSONS)
      for (let i = 0; i < topics.length; i++) {
        const viewport = VIEWPORTS[i % VIEWPORTS.length]
        await Promise.race([
          runLesson(browser, topics[i], i, viewport),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`lesson timeout after ${LESSON_TIMEOUT_MS}ms`)), LESSON_TIMEOUT_MS)),
        ]).catch((error) => {
          const record = { topic: topics[i], viewport: viewport.name, error: String(error), observed: { failedRequests: [], serverErrors: [] } }
          events.push(record)
          findings.push({ topic: topics[i], viewport: viewport.name, session_id: null, issues: [{ type: 'lesson_timeout_or_crash', severity: 'blocked', message: String(error) }] })
        })
      }
    }
  } finally {
    await browser.close()
  }
  const report = await writeReport()
  console.log(JSON.stringify({
    run_id: RUN_ID,
    out_dir: OUT_DIR,
    summary: report.summary,
    findings: report.findings.map((finding) => ({
      topic: finding.topic,
      viewport: finding.viewport,
      issue_types: finding.issues.map((issue) => issue.type),
    })),
  }, null, 2))
}

main().catch(async (error) => {
  events.push({ type: 'harness_crash', error: String(error), stack: error?.stack })
  findings.push({ topic: 'harness', viewport: '', session_id: null, issues: [{ type: 'harness_crash', severity: 'blocked', message: String(error) }] })
  await writeReport().catch(() => {})
  console.error(error)
  process.exit(1)
})
