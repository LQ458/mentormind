import { NextResponse } from 'next/server'

const MAX_LOG_DETAIL = 2000

function safeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').slice(0, MAX_LOG_DETAIL)
}

export function logBackendProxyError(scope: string, status: number | null, detail: unknown): void {
  const statusPart = typeof status === 'number' ? ` status=${status}` : ''
  const text = safeText(detail)
  if (text) {
    console.error(`[${scope}] backend error${statusPart}: ${text}`)
  } else {
    console.error(`[${scope}] backend error${statusPart}`)
  }
}

function publicErrorForStatus(status: number): { code: string; detail: string } {
  if (status === 400) return { code: 'bad_request', detail: 'The request could not be processed.' }
  if (status === 401) return { code: 'auth_required', detail: 'Sign in again and retry.' }
  if (status === 403) return { code: 'forbidden', detail: 'You do not have permission for this action.' }
  if (status === 404) return { code: 'not_found', detail: 'The requested item was not found.' }
  if (status === 408 || status === 504) return { code: 'timeout', detail: 'The backend timed out while processing this request.' }
  if (status === 413) return { code: 'payload_too_large', detail: 'The upload is too large.' }
  if (status === 415) return { code: 'unsupported_media_type', detail: 'This file type is not supported.' }
  if (status === 422) return { code: 'unprocessable', detail: 'The backend could not read enough usable content.' }
  if (status === 429) return { code: 'rate_limited', detail: 'Too many requests. Try again shortly.' }
  if (status >= 500) return { code: 'backend_unavailable', detail: 'The backend service failed. Try again shortly.' }
  return { code: 'backend_error', detail: 'The backend could not complete this request.' }
}

export function backendErrorResponse(
  message: string,
  status: number,
  options: { code?: string; detail?: string } = {},
): NextResponse {
  const fallback = publicErrorForStatus(status)
  return NextResponse.json(
    {
      error: message,
      code: options.code || fallback.code,
      detail: options.detail || fallback.detail,
      status,
    },
    { status },
  )
}

export function proxyFailureResponse(message: string, detail = 'Could not reach backend service.'): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code: 'proxy_unreachable',
      detail,
      status: 502,
    },
    { status: 502 },
  )
}
