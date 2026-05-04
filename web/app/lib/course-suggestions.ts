// Course suggestions per (framework, subject) — mirrors the backend catalogs at
// backend/prompts/subjects/frameworks/{ap,a_level,ib,gaokao}_courses.json.
// Kept short (top 3 per cell) so the chip strip stays compact. When the user
// clicks a chip we seed the AI chat with the course name so plan generation
// anchors to that catalog entry on the backend.

export interface CourseSuggestion {
  /** Display name shown on the chip + sent to the AI to seed plan generation. */
  name: string
  /** Optional Chinese name; falls back to `name` when not set. */
  nameZh?: string
}

/** framework → subject → CourseSuggestion[] */
export const COURSE_SUGGESTIONS: Record<string, Record<string, CourseSuggestion[]>> = {
  ap: {
    math: [
      { name: 'AP Calculus AB' },
      { name: 'AP Calculus BC' },
      { name: 'AP Statistics' },
    ],
    physics: [
      { name: 'AP Physics 1' },
      { name: 'AP Physics 2' },
      { name: 'AP Physics C: Mechanics' },
    ],
    chemistry: [{ name: 'AP Chemistry' }],
    biology: [{ name: 'AP Biology' }],
    cs: [
      { name: 'AP Computer Science A' },
      { name: 'AP Computer Science Principles' },
    ],
    environmental_science: [{ name: 'AP Environmental Science' }],
    history: [
      { name: 'AP US History' },
      { name: 'AP World History' },
      { name: 'AP European History' },
    ],
    english: [
      { name: 'AP English Language' },
      { name: 'AP English Literature' },
    ],
    economics: [
      { name: 'AP Macroeconomics' },
      { name: 'AP Microeconomics' },
    ],
    psychology: [{ name: 'AP Psychology' }],
    government: [{ name: 'AP US Government' }],
    world_languages: [{ name: 'AP Spanish Language' }],
  },
  a_level: {
    math: [{ name: 'A Level Mathematics (CAIE 9709)', nameZh: 'A Level 数学 (CAIE 9709)' }],
    physics: [{ name: 'A Level Physics (CAIE 9702)', nameZh: 'A Level 物理 (CAIE 9702)' }],
    chemistry: [{ name: 'A Level Chemistry (CAIE 9701)', nameZh: 'A Level 化学 (CAIE 9701)' }],
    biology: [{ name: 'A Level Biology (CAIE 9700)', nameZh: 'A Level 生物 (CAIE 9700)' }],
    economics: [{ name: 'A Level Economics (CAIE 9708)', nameZh: 'A Level 经济 (CAIE 9708)' }],
    english: [{ name: 'A Level English Literature (Edexcel)' }],
    history: [{ name: 'A Level History (CAIE 9489)' }],
  },
  ib: {
    math: [
      { name: 'IB Math Analysis & Approaches HL' },
      { name: 'IB Math Analysis & Approaches SL' },
    ],
    physics: [{ name: 'IB Physics HL' }],
    chemistry: [{ name: 'IB Chemistry HL' }],
    biology: [{ name: 'IB Biology HL' }],
    english: [{ name: 'IB English A: Language and Literature HL' }],
    history: [{ name: 'IB History HL' }],
    economics: [{ name: 'IB Economics HL' }],
  },
  gaokao: {
    math: [{ name: 'Gaokao Mathematics', nameZh: '高考数学' }],
    physics: [{ name: 'Gaokao Physics', nameZh: '高考物理' }],
    chemistry: [{ name: 'Gaokao Chemistry', nameZh: '高考化学' }],
    biology: [{ name: 'Gaokao Biology', nameZh: '高考生物' }],
    english: [{ name: 'Gaokao English', nameZh: '高考英语' }],
    history: [{ name: 'Gaokao History', nameZh: '高考历史' }],
    world_languages: [{ name: 'Gaokao Chinese (Yuwen)', nameZh: '高考语文' }],
  },
  general: {},
}

export function getCourseSuggestions(
  framework: string | null | undefined,
  subject: string | null | undefined,
): CourseSuggestion[] {
  if (!framework || !subject) return []
  return COURSE_SUGGESTIONS[framework]?.[subject] ?? []
}
