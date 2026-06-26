'use client'

export const OPEN_SURVEY_EVENT = 'mm:open-survey'
export const OPEN_FEEDBACK_EVENT = 'mm:open-feedback'

export type FeedbackKind = 'bug' | 'function' | 'feeling' | 'general'
export type FeedbackSeverity = 'blocked' | 'wrong' | 'confusing' | 'slow' | 'visual' | 'quality' | 'idea'
export type FeedbackSource = 'global_feedback_button' | 'local_report_button'

export interface FeedbackLaunchContext {
  surface?: string
  source?: FeedbackSource
  interactionId?: string
  feedbackKind?: FeedbackKind
  severity?: FeedbackSeverity
  snapshot?: Record<string, unknown>
}

export function openFeedback(context?: FeedbackLaunchContext) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<FeedbackLaunchContext>(OPEN_FEEDBACK_EVENT, {
    detail: context || {},
  }))
}
