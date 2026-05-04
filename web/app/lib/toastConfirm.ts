'use client'

import { toast } from 'sonner'

interface ToastConfirmOptions {
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  duration?: number
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

export function toastConfirm(message: string, opts: ToastConfirmOptions): void {
  const {
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    duration = 8000,
    destructive = false,
    onConfirm,
    onCancel,
  } = opts

  const id = toast(message, {
    description,
    duration,
    action: {
      label: confirmLabel,
      onClick: () => {
        const ret = onConfirm()
        if (ret && typeof (ret as Promise<unknown>).then === 'function') {
          ;(ret as Promise<unknown>).catch((err) => {
            console.error('toastConfirm onConfirm error:', err)
          })
        }
      },
    },
    cancel: {
      label: cancelLabel,
      onClick: () => {
        if (onCancel) onCancel()
      },
    },
    className: destructive ? 'mm-toast-destructive' : undefined,
  })

  void id
}
