// ============================================================
// DATA — realistic mock content for MentorMind
// ============================================================

const DATA = {
  user: { name: "Wei Chen", zh: "陈伟", role: "Year 12 / IB HL", level: "Advanced" },

  today: {
    date: "Mon · Apr 20, 2026",
    dateZh: "周一 · 四月 二十",
    focus: "Quadratic forms — discriminant intuition",
    focusZh: "二次式 · 判别式",
    streak: 11,
    minutesLogged: 42,
    minutesGoal: 60,
  },

  reviewQueue: [
    { id: "R-141", when: "due now",     whenCode: "+00h",  title: "Law of cosines — acute vs. obtuse cases", topic: "Trigonometry", mastery: 0.52, trigger: "spaced · 3rd pass" },
    { id: "R-142", when: "in 2h",       whenCode: "+02h",  title: "Factoring the discriminant Δ = b² − 4ac", topic: "Quadratics",   mastery: 0.34, trigger: "gap · missed 2/3 exit qs" },
    { id: "R-143", when: "tonight",     whenCode: "+06h",  title: "Vieta's formulas — sum & product of roots", topic: "Quadratics",   mastery: 0.71, trigger: "spaced · maintenance" },
    { id: "R-144", when: "tomorrow",    whenCode: "+24h",  title: "Translating word problems to equations", topic: "Problem solving", mastery: 0.48, trigger: "scheduled" },
  ],

  notifications: [
    { id: "N-07", kind: "diagnostic", title: "Your Monday diagnostic is ready — 6 questions, 8 min", body: "Based on last week's gaps: trigonometry and quadratics." },
    { id: "N-08", kind: "suggest",    title: "Try tomorrow: Simulation — \"Defend your method\"",   body: "You tend to rush final-answer checks. This mode slows you down." },
  ],

  plan: {
    title: "IB Math AA — Higher Level · Paper 1",
    titleZh: "IB 数学 AA · 高阶 · 试卷一",
    framework: "IB",
    totalHours: 84,
    hoursDone: 31,
    units: [
      {
        ref: "1",
        title: "Number & algebra",
        titleZh: "数与代数",
        hours: 12,
        done: 12,
        status: "done",
        topics: [
          { t: "Sequences & series", m: 0.86 },
          { t: "Exponents & logs",    m: 0.78 },
          { t: "Binomial theorem",    m: 0.82 },
        ]
      },
      {
        ref: "2",
        title: "Functions",
        titleZh: "函数",
        hours: 14,
        done: 11,
        status: "active",
        topics: [
          { t: "Quadratic functions",   m: 0.64 },
          { t: "Rational functions",    m: 0.58 },
          { t: "Transformations",       m: 0.74 },
          { t: "Inverse functions",     m: 0.41 },
        ]
      },
      {
        ref: "3",
        title: "Geometry & trigonometry",
        titleZh: "几何与三角",
        hours: 16,
        done: 6,
        status: "active",
        topics: [
          { t: "Unit circle & radians", m: 0.70 },
          { t: "Law of sines/cosines",  m: 0.52 },
          { t: "Identities",            m: 0.28 },
          { t: "Vectors in 3D",         m: 0.12 },
        ]
      },
      {
        ref: "4", title: "Statistics & probability", titleZh: "统计与概率",
        hours: 14, done: 2, status: "queued",
        topics: [
          { t: "Distributions",         m: 0.22 },
          { t: "Conditional probability",m: 0.10 },
        ]
      },
      {
        ref: "5", title: "Calculus", titleZh: "微积分",
        hours: 22, done: 0, status: "upcoming",
        topics: [
          { t: "Limits",                m: 0 },
          { t: "Derivatives",           m: 0 },
          { t: "Integrals",             m: 0 },
          { t: "Applications",          m: 0 },
        ]
      },
      {
        ref: "6", title: "Assessment bootcamp", titleZh: "考前冲刺",
        hours: 6, done: 0, status: "upcoming",
        topics: [
          { t: "Past paper 2022",       m: 0 },
          { t: "Past paper 2023",       m: 0 },
        ]
      },
    ]
  },

  lesson: {
    id: "L-0221",
    ref: "§2.4",
    title: "The discriminant, read as a question",
    titleZh: "判别式 · 作为一个问题",
    duration: "11:42",
    created: "Apr 18, 2026",
    teacher: "Mentor / Socratic",
    quality: 0.89,
    synopsis: "We reframe Δ = b² − 4ac not as a formula but as a question the quadratic is asking about its own graph. Three cases, three answers.",
    outline: [
      { t: "0:00", h: "Prelude — what does a formula ask?" },
      { t: "1:40", h: "The geometry before the algebra" },
      { t: "3:58", h: "Case 1 · Δ > 0  — two real intercepts" },
      { t: "6:12", h: "Case 2 · Δ = 0  — the tangent case" },
      { t: "8:05", h: "Case 3 · Δ < 0  — when the x-axis is not invited" },
      { t: "10:14", h: "Exit — four questions, one paragraph each" },
    ],
    estMin: 24,
    steps: [
      { kind: "Warm-up",   prompt: "Sketch y = x² − 4x + 3 in your head. What can you already see?",
        body: "Before we compute anything, what do you expect? Parabola opens up or down? Vertex above or below the axis?" },
      { kind: "Socratic",  prompt: "Where is the axis of symmetry?",
        body: "It's the x-value of the vertex. For ax² + bx + c, try x = −b/(2a). Keep that in mind — we'll use it next."},
      { kind: "Model",     prompt: "So f(2) = 4 − 8 + 3 = −1 — the vertex sits below the axis.",
        body: "An upward parabola with its vertex below y = 0 must cross the x-axis twice. The picture already tells us the answer.",
        think: "The discriminant Δ is a formula that describes this picture. Positive Δ → two crossings. Zero → tangent. Negative → no real crossings."},
      { kind: "Check",     prompt: "If Δ = 16 − 12 = 4, how many real roots?",
        options: [
          { t: "No real roots" },
          { t: "Exactly one real root (tangent)" },
          { t: "Two distinct real roots", correct: true },
          { t: "Cannot be determined from Δ alone" },
        ]},
      { kind: "Reflection",prompt: "Say it in your own words: what is Δ asking?",
        body: "Write a one-paragraph answer. The formula is not the question — it's an answer to a geometric question about the parabola's relationship to the x-axis."},
      { kind: "Exit",      prompt: "Four short questions to close the loop.",
        body: "Last stretch — these check the idea you just built, not memorization."},
    ],
    estMin: 24,
    steps: [
      { kind: "Warm-up",   prompt: "Sketch y = x² − 4x + 3 in your head. What can you already see?",
        body: "Before we compute anything, what do you expect? Parabola opens up or down? Vertex above or below the axis?" },
      { kind: "Socratic",  prompt: "Where is the axis of symmetry?",
        body: "It's the x-value of the vertex. For ax² + bx + c, try x = −b/(2a). Keep that in mind — we'll use it next."},
      { kind: "Model",     prompt: "So f(2) = 4 − 8 + 3 = −1 — the vertex sits below the axis.",
        body: "An upward parabola with its vertex below y = 0 must cross the x-axis twice. The picture already tells us the answer.",
        think: "The discriminant Δ is a formula that describes this picture. Positive Δ → two crossings. Zero → tangent. Negative → no real crossings."},
      { kind: "Check",     prompt: "If Δ = 16 − 12 = 4, how many real roots?",
        options: [
          { t: "No real roots" },
          { t: "Exactly one real root (tangent)" },
          { t: "Two distinct real roots", correct: true },
          { t: "Cannot be determined from Δ alone" },
        ]},
      { kind: "Reflection",prompt: "Say it in your own words: what is Δ asking?",
        body: "Write a one-paragraph answer. The formula is not the question — it's an answer to a geometric question about the parabola's relationship to the x-axis."},
      { kind: "Exit",      prompt: "Four short questions to close the loop.",
        body: "Last stretch — these check the idea you just built, not memorization."},
    ],
    transcript: [
      { n: 34, t: "3:58", s: "Let's test: we have x² − 4x + 3. Before we compute Δ, sketch the parabola in your head." },
      { n: 35, t: "4:06", s: "It opens upward. Where is the vertex? The axis of symmetry is x = 2. Substitute: f(2) = 4 − 8 + 3 = −1." },
      { n: 36, t: "4:20", s: "So the vertex is BELOW the x-axis and the parabola opens upward. How many times does it cross?" },
      { n: 37, t: "4:31", s: "Twice. And this is what Δ > 0 is claiming — not as a rule, but as a picture." },
      { n: 38, t: "4:42", s: "Now compute. Δ = 16 − 12 = 4. Positive. The algebra agrees with the geometry.", mark: true },
      { n: 39, t: "4:58", s: "The formula didn't produce the answer. The picture did. The formula confirmed it." },
    ],
    concepts: [
      "vertex", "axis of symmetry", "intercepts", "discriminant", "completing the square"
    ],
    exitQuestions: 4,
    estMin: 24,
    steps: [
      { kind: 'Prelude',    prompt: "What does a formula ask?", body: "Before we touch Δ, let's agree that a formula is not an instruction — it's a question in disguise. The discriminant is asking about geometry." },
      { kind: 'Warm-up',    prompt: "Sketch x² − 4x + 3 in your head.", body: "Opens upward. Vertex at x = 2. f(2) = −1. So the vertex sits below the x-axis." },
      { kind: 'Setup',      prompt: "How many times does that parabola cross the x-axis?", body: "Vertex below, opens up — it must cross twice. This is geometry, no formula yet." },
      { kind: 'Check',      prompt: "What does Δ > 0 mean about the graph?",
        options: [
          { t: "The parabola doesn't touch the x-axis" },
          { t: "The parabola crosses the x-axis at two distinct points", correct: true },
          { t: "The parabola is tangent to the x-axis" },
          { t: "The parabola opens downward" },
        ],
        think: "Δ > 0 is the algebra confirming what the picture already shows: two intercepts means two real roots.",
      },
      { kind: 'Reveal',     prompt: "Δ = b² − 4ac = 16 − 12 = 4.", body: "Positive, as expected. The formula confirms the picture." },
      { kind: 'Application', prompt: "Now predict: what must Δ be for x² + 4?", body: "No real intercepts — the parabola floats above the x-axis. Δ must be negative." },
    ],
  },

  library: [
    { id: "L-0221", kind:"lesson", topic: "Quadratics",   title: "The discriminant, read as a question",    when: "2 days ago",  mastery: 0.68 },
    { id: "L-0218", kind:"lesson", topic: "Quadratics",   title: "Completing the square — why that name?", when: "4 days ago",  mastery: 0.74 },
    { id: "L-0215", kind:"note",   topic: "Trigonometry", title: "Law of cosines — the altitude trick",     when: "6 days ago",  mastery: 0.52 },
    { id: "L-0210", kind:"lesson", topic: "Algebra",      title: "Binomial theorem · Pascal revisited",     when: "9 days ago",  mastery: 0.82 },
    { id: "L-0206", kind:"deck",   topic: "Functions",    title: "Function families · 24 cards",            when: "11 days ago", mastery: 0.71 },
    { id: "L-0203", kind:"lesson", topic: "Algebra",      title: "Exponents derived, not memorized",        when: "13 days ago", mastery: 0.78 },
    { id: "L-0199", kind:"note",   topic: "Trigonometry", title: "Radians · a unit that had to exist",      when: "16 days ago", mastery: 0.70 },
    { id: "L-0195", kind:"deck",   topic: "Algebra",      title: "Log identities · 18 cards",               when: "18 days ago", mastery: 0.75 },
  ],

  // knowledge graph (simple force-free layout — hand-placed)
  graph: {
    nodes: [
      { id: "quad",  label: "Quadratics",           x: 360, y: 180, m: 0.64, active: true },
      { id: "disc",  label: "Discriminant Δ",       x: 550, y: 110, m: 0.34 },
      { id: "vieta", label: "Vieta's formulas",     x: 560, y: 240, m: 0.71 },
      { id: "cs",    label: "Completing the square",x: 200, y: 110, m: 0.74 },
      { id: "roots", label: "Roots",                x: 370, y: 320, m: 0.58 },
      { id: "func",  label: "Functions",            x: 160, y: 260, m: 0.66 },
      { id: "graph", label: "Parabola / graph",     x: 360, y: 50,  m: 0.62 },
      { id: "sys",   label: "Systems of equations", x: 180, y: 380, m: 0.48 },
      { id: "comp",  label: "Complex numbers",      x: 700, y: 180, m: 0.18, future: true },
    ],
    edges: [
      ["quad","disc"], ["quad","vieta"], ["quad","cs"], ["quad","roots"],
      ["quad","graph"], ["func","quad"], ["cs","roots"], ["disc","roots"],
      ["roots","sys"], ["disc","comp"],
    ]
  },

  createChat: [
    { role: "mentor", t: "09:42", s: "Welcome back. I've looked at your last three sessions — the common thread is \"rearranging\" formulas under pressure. Should today's lesson be about reflex, or about understanding?" },
    { role: "user",   t: "09:43", s: "Understanding. I keep panicking on the discriminant." },
    { role: "mentor", t: "09:43", s: "Good. Then I'll not explain the formula. I'll show you what it's asking. Before we start — do you want Socratic (I ask, you answer), or Simulation (you defend a method I disagree with)?" },
  ],

  sources: [
    { kind: "PDF",  name: "IB_MathAA_HL_Textbook_ch02.pdf", pages: 38, cited: 12, code: "S-01" },
    { kind: "VID",  name: "Khan — Discriminant intuition",  mins: 14, cited: 3,  code: "S-02" },
    { kind: "NOTE", name: "class notes 2026-04-16.md",      lines: 142, cited: 7, code: "S-03" },
    { kind: "AUD",  name: "tutor_session_2026-04-12.m4a",   mins: 52, cited: 4, code: "S-04" },
  ],
};

window.DATA = DATA;
