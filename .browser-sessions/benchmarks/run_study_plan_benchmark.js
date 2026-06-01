const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const token = process.env.MM_TOKEN;
if (!token) throw new Error('MM_TOKEN missing');

const outDir = path.resolve('.browser-sessions/benchmarks/study-plan-learner-levels');
fs.mkdirSync(outDir, { recursive: true });

const user = { id: '29719f09-8231-40d4-bd8c-c60c43d16d10', email: 'test@mentormind.local', firstName: 'test', username: 'test', fullName: 'test' };

const cases = [
  {
    id: 'extra-smart',
    label: 'Extra Smart',
    foundation: 'Aiming high',
    timeline: 'May 2026, about 2 months',
    target: 'AP 5 with margin; wants Olympiad-like challenge if useful',
    weekly: '8',
    months: '2',
    sessionHours: '2',
    desiredDays: ['Mon','Wed','Fri'],
    baseline: ['Very confident','Very confident','Very confident','Mostly steady','Very confident'],
    notes: 'Already fast with algebra, vectors, and basic mechanics. Needs high-difficulty AP Physics 1 FRQs, experimental design, edge cases, and a fast pace. Gets bored by long basic explanations.',
    expectation: 'Should compress concept review, prioritize hard FRQs/lab reasoning, use challenge problems, and avoid patronizing basics.'
  },
  {
    id: 'smart',
    label: 'Smart',
    foundation: 'Intermediate',
    timeline: 'May 2026, about 4 months',
    target: 'AP 4 or 5',
    weekly: '6',
    months: '4',
    sessionHours: '1.5',
    desiredDays: ['Mon','Wed','Fri'],
    baseline: ['Mostly steady','Somewhat','Somewhat','Mostly steady','Somewhat'],
    notes: 'Understands class lectures and can solve routine problems. Mistakes appear on multi-step force/energy questions, graphs, and explaining reasoning under time pressure.',
    expectation: 'Should balance concise concept repair with frequent AP-style practice, error review, and timed FRQ drills.'
  },
  {
    id: 'medium',
    label: 'Medium',
    foundation: 'Some foundation',
    timeline: 'May 2026, about 5 months',
    target: 'AP 3 or 4',
    weekly: '5',
    months: '5',
    sessionHours: '1',
    desiredDays: ['Mon','Wed','Fri'],
    baseline: ['Somewhat','Not confident','Somewhat','Somewhat','Not confident'],
    notes: 'Can follow examples after seeing them, but struggles to start problems alone. Weak in free-body diagrams, equations from graphs, and choosing formulas.',
    expectation: 'Should include scaffolding, worked examples, small wins, retrieval practice, and gradual release before timed AP work.'
  },
  {
    id: 'slow-learner',
    label: 'Slow Learner',
    foundation: 'Need quick wins',
    timeline: 'May 2026, about 6 months',
    target: 'Pass AP Physics 1; build confidence first',
    weekly: '4',
    months: '6',
    sessionHours: '1',
    desiredDays: ['Mon','Wed','Sat'],
    baseline: [],
    notes: 'I do not want a long pretest first. I need quick wins, fun short missions, very concrete explanations, visual intuition, repetition, and confidence-building.',
    expectation: 'Should infer foundation_rebuild without forcing baseline answers; use short low-pressure missions, concrete examples, and confidence-building.'
  }
];

async function loginContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 960 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'mm_token', value: token, domain: 'localhost', path: '/' }]);
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('mm_token', token);
    localStorage.setItem('mm_user', JSON.stringify(user));
    // Avoid draft restore prompts contaminating benchmark cases.
    for (const key of Object.keys(localStorage)) {
      if (key.includes('study') || key.includes('draft')) localStorage.removeItem(key);
    }
  }, { token, user });
  return context;
}

async function runCase(browser, profile) {
  const context = await loginContext(browser);
  const page = await context.newPage();
  const network = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/backend/study-plan/chat')) network.push({ status: res.status(), url, ts: Date.now() });
  });
  const started = Date.now();
  await page.goto('http://localhost:3000/study-plan', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('button').filter({ hasText: 'AP (Advanced Placement)' }).filter({ hasText: '12 SUBJECTS' }).first().click();
  await page.locator('button').filter({ hasText: 'Physics' }).filter({ hasText: '⚛️' }).first().click();
  await page.locator('button').filter({ hasText: 'AP Physics 1' }).last().click();
  await page.locator('select').nth(0).selectOption(profile.foundation);
  await page.locator('input').nth(0).fill(profile.timeline);
  await page.locator('input').nth(1).fill(profile.target);
  await page.locator('input').nth(2).fill(profile.weekly);
  await page.locator('input').nth(3).fill(profile.months);
  // Keep default Mon/Wed/Fri schedule for benchmark consistency; the profile notes and hour fields carry pace differences.
  await page.locator('input').nth(4).fill(profile.sessionHours);
  await page.locator('textarea').nth(0).fill(profile.notes);
  for (let i = 0; i < profile.baseline.length; i++) {
    await page.locator('select').nth(i + 1).selectOption(profile.baseline[i]);
  }
  if (profile.baseline.length === 0) {
    await page.getByText('Skip for now').click().catch(() => {});
  }
  await page.screenshot({ path: path.join(outDir, `${profile.id}-intake.png`), fullPage: true });
  await page.getByText('Let Mina build the plan').click();
  await page.waitForTimeout(500);
  const preSendText = await page.locator('body').innerText();
  const sendStart = Date.now();
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/backend/study-plan/chat'),
    { timeout: 90000 },
  ).catch((err) => ({ error: String(err) }));
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const chatResponse = await responsePromise;
  let chatJson = null;
  if (chatResponse && !chatResponse.error) {
    await chatResponse.finished().catch(() => {});
    chatJson = await chatResponse.json().catch(() => null);
  }
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    const afterMarker = text.split('Please generate the study plan from the context above.').pop() || '';
    return afterMarker.replace(/Mina|Send|Tweaks|\s/g, '').length > 80;
  }, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const finalText = await page.locator('body').innerText();
  await page.screenshot({ path: path.join(outDir, `${profile.id}-response.png`), fullPage: true });
  const elapsedMs = Date.now() - sendStart;
  await context.close();
  return { profile, started_at: new Date(started).toISOString(), elapsed_ms: elapsedMs, network, chat_response_status: chatResponse && !chatResponse.error ? chatResponse.status() : null, chat_response_error: chatResponse && chatResponse.error, chat_json: chatJson, pre_send_text: preSendText, final_text: finalText };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const profile of cases) {
    console.log(`RUN ${profile.id}`);
    try {
      const result = await runCase(browser, profile);
      results.push(result);
      console.log(`DONE ${profile.id} ${result.elapsed_ms}ms`);
    } catch (err) {
      console.error(`FAIL ${profile.id}`, err);
      results.push({ profile, error: String(err && err.stack || err) });
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'raw-results.json'), JSON.stringify(results, null, 2));
  console.log(path.join(outDir, 'raw-results.json'));
})();
