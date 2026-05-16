'use client'

import { useState, useCallback } from 'react'

interface ConfirmOptions {
  title?: string
  message: string
  description?: string
  details?: React.ReactNode
  consequences?: string[]
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive' | 'warning'
  requireTyping?: string // text user must type to confirm (for critical actions)
}

interface PendingConfirm {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [typedText, setTypedText] = useState('')

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise((resolve) => {
      setTypedText('')
      setPending({ options: opts, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    pending?.resolve(true)
    setPending(null)
    setTypedText('')
  }, [pending])

  const handleCancel = useCallback(() => {
    pending?.resolve(false)
    setPending(null)
    setTypedText('')
  }, [pending])

  const isConfirmDisabled = pending?.options.requireTyping
    ? typedText !== pending.options.requireTyping
    : false

  const variantStyles = {
    default: {
      icon: (
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      ),
      confirmBtn: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
    },
    warning: {
      icon: (
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
      ),
      confirmBtn: 'bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800',
    },
    destructive: {
      icon: (
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      ),
      confirmBtn: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
    },
  }

  const variant = pending?.options.variant || 'default'
  const styles = variantStyles[variant]

  const modal = pending ? (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="flex flex-col items-center text-center">
          {styles.icon}

          <h3 id="confirm-title" className="text-lg font-bold text-gray-900 mb-2">
            {pending.options.title || 'Confirmar acción'}
          </h3>

          <p className="text-sm text-gray-600 mb-2">{pending.options.message}</p>

          {pending.options.description && (
            <p className="text-xs text-gray-500 mb-4">{pending.options.description}</p>
          )}

          {pending.options.details && (
            <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-left">
              {pending.options.details}
            </div>
          )}

          {/* Consequences list */}
          {pending.options.consequences && pending.options.consequences.length > 0 && (
            <div className="w-full bg-red-50 border border-red-100 rounded-lg p-3 mb-4 text-left">
              <p className="text-xs font-semibold text-red-700 mb-1.5">Esto hará:</p>
              <ul className="space-y-1">
                {pending.options.consequences.map((c, i) => (
                  <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                    <span className="mt-0.5 flex-shrink-0">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Require typing confirmation */}
          {pending.options.requireTyping && (
            <div className="w-full mb-4">
              <label className="block text-xs text-gray-500 mb-1.5">
                Escribe <span className="font-mono font-bold text-gray-700">{pending.options.requireTyping}</span> para confirmar
              </label>
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-center font-mono focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition"
                autoFocus
              />
            </div>
          )}

          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              {pending.options.cancelLabel || 'Cancelar'}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isConfirmDisabled}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm ${styles.confirmBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {pending.options.confirmLabel || 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, modal }
}
