// Framework metadata for the study-plan picker.
// Each entry carries display copy, an emoji icon, and Tailwind classes for the
// distinctive accent color of that framework. Course suggestions live in
// course-suggestions.ts so each framework feels like a first-class module.

export interface FrameworkMeta {
  id: 'ap' | 'a_level' | 'ib' | 'gaokao' | 'general'
  label: string
  labelZh: string
  short: string         // 1-3 char badge (e.g., "AP", "AL", "IB", "高")
  shortZh: string
  icon: string          // emoji
  taglineEn: string
  taglineZh: string
  // Tailwind classes — stored as strings so they survive purge.
  ringClass: string
  bgClass: string
  textClass: string
  borderClass: string
}

export const FRAMEWORKS: FrameworkMeta[] = [
  {
    id: 'ap',
    label: 'AP (Advanced Placement)',
    labelZh: 'AP (美国大学预修)',
    short: 'AP',
    shortZh: 'AP',
    icon: '🎓',
    taglineEn: 'College Board AP courses with official CED unit lists.',
    taglineZh: '美国大学理事会 AP 课程，按 CED 官方单元结构展开。',
    ringClass: 'ring-blue-500',
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-800',
    borderClass: 'border-blue-300',
  },
  {
    id: 'a_level',
    label: 'A Level (Cambridge / Edexcel)',
    labelZh: 'A Level (剑桥 / 爱德思)',
    short: 'AL',
    shortZh: 'AL',
    icon: '📘',
    taglineEn: 'AS + A2 split with Cambridge syllabus codes (9709, 9702, …).',
    taglineZh: '按 AS + A2 分阶段，对应剑桥考纲编号（9709、9702……）。',
    ringClass: 'ring-indigo-500',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-800',
    borderClass: 'border-indigo-300',
  },
  {
    id: 'ib',
    label: 'IB Diploma Programme',
    labelZh: 'IB 国际文凭',
    short: 'IB',
    shortZh: 'IB',
    icon: '🌐',
    taglineEn: 'SL & HL distinction, paper structure, IA components.',
    taglineZh: '区分 SL/HL，包含 Paper 结构与 IA 评估。',
    ringClass: 'ring-violet-500',
    bgClass: 'bg-violet-50',
    textClass: 'text-violet-800',
    borderClass: 'border-violet-300',
  },
  {
    id: 'gaokao',
    label: 'Gaokao (高考)',
    labelZh: '高考',
    short: '高',
    shortZh: '高',
    icon: '🏯',
    taglineEn: 'China Gaokao — required + elective units, organised around high-frequency exam topics.',
    taglineZh: '高考全国卷考纲，必修 + 选修分章节，标注高频考点。',
    ringClass: 'ring-red-500',
    bgClass: 'bg-red-50',
    textClass: 'text-red-800',
    borderClass: 'border-red-300',
  },
  {
    id: 'general',
    label: 'General',
    labelZh: '通用',
    short: 'G',
    shortZh: '通',
    icon: '📚',
    taglineEn: 'Open syllabus — AI plans the structure for you.',
    taglineZh: '无固定考纲，由 AI 根据你的目标自动规划。',
    ringClass: 'ring-gray-400',
    bgClass: 'bg-gray-50',
    textClass: 'text-gray-800',
    borderClass: 'border-gray-300',
  },
]

export function getFramework(id: string | null | undefined): FrameworkMeta | undefined {
  if (!id) return undefined
  return FRAMEWORKS.find((f) => f.id === id)
}
