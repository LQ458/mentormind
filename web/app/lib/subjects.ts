export interface SubjectMeta {
  id: string
  label: string
  labelZh: string
  icon: string
  category: 'stem' | 'humanities'
}

export const SUBJECTS: SubjectMeta[] = [
  // STEM
  { id: 'math', label: 'Mathematics', labelZh: '数学', icon: '📐', category: 'stem' },
  { id: 'physics', label: 'Physics', labelZh: '物理', icon: '⚛️', category: 'stem' },
  { id: 'chemistry', label: 'Chemistry', labelZh: '化学', icon: '🧪', category: 'stem' },
  { id: 'biology', label: 'Biology', labelZh: '生物', icon: '🧬', category: 'stem' },
  { id: 'cs', label: 'Computer Science', labelZh: '计算机科学', icon: '💻', category: 'stem' },
  { id: 'environmental_science', label: 'Environmental Science', labelZh: '环境科学', icon: '🌍', category: 'stem' },
  // Humanities & Social Sciences
  { id: 'history', label: 'History', labelZh: '历史', icon: '📜', category: 'humanities' },
  { id: 'english', label: 'English', labelZh: '英语', icon: '📝', category: 'humanities' },
  { id: 'economics', label: 'Economics', labelZh: '经济学', icon: '📊', category: 'humanities' },
  { id: 'psychology', label: 'Psychology', labelZh: '心理学', icon: '🧠', category: 'humanities' },
  { id: 'government', label: 'Government & Politics', labelZh: '政治学', icon: '🏛️', category: 'humanities' },
  { id: 'world_languages', label: 'World Languages', labelZh: '外国语', icon: '🌐', category: 'humanities' },
  { id: 'art', label: 'Art', labelZh: '艺术', icon: '🎨', category: 'humanities' },
]

export function getSubject(id: string | null | undefined): SubjectMeta | undefined {
  if (!id) return undefined
  return SUBJECTS.find((s) => s.id === id)
}
