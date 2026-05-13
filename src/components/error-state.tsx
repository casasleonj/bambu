'use client'

import { useState } from 'react'

interface RecoveryAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'outline'
}

interface ErrorStateProps {
  title?: string
  message: string
  errorCode?: string
  recoveryActions?: RecoveryAction[]
  showRetry?: boolean
  onRetry?: () => void
  showCopy?: boolean
  className?: string
}

const ERROR_ICONS: Record<string, React.ReactNode> = {
  network: (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  ),
  server: (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  auth: (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  validation: (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  generic: (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  ),
}

export function ErrorState({
  title,
  message,
  errorCode,
  recoveryActions,
  showRetry = true,
  onRetry,
  showCopy = true,
  className = '',
}: ErrorStateProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = `Error: ${title || 'Error'}\nMensaje: ${message}${errorCode ? `\nCódigo: ${errorCode}` : ''}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const getErrorType = (): keyof typeof ERROR_ICONS => {
    const msg = message.toLowerCase()
    if (msg.includes('network') || msg.includes('conexión') || msg.includes('internet') || msg.includes('fetch')) return 'network'
    if (msg.includes('auth') || msg.includes('sesión') || msg.includes('token') || msg.includes('login')) return 'auth'
    if (msg.includes('valid') || msg.includes('campo') || msg.includes('requerido')) return 'validation'
    if (msg.includes('server') || msg.includes('servidor') || msg.includes('500')) return 'server'
    return 'generic'
  }

  const errorType = getErrorType()
  const Icon = ERROR_ICONS[errorType]

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className={`rounded-full p-4 mb-4 ${
        errorType === 'network' ? 'bg-orange-50 text-orange-500' :
        errorType === 'server' ? 'bg-red-50 text-red-500' :
        errorType === 'auth' ? 'bg-yellow-50 text-yellow-600' :
        errorType === 'validation' ? 'bg-blue-50 text-blue-500' :
        'bg-gray-50 text-gray-500'
      }`}>
        {Icon}
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title || 'Algo salió mal'}
      </h3>

      <p className="text-sm text-gray-500 max-w-md mb-6 leading-relaxed">
        {message}
      </p>

      {errorCode && (
        <p className="text-xs text-gray-400 font-mono mb-4 bg-gray-50 px-2 py-1 rounded">
          Código: {errorCode}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition text-sm font-medium shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reintentar
          </button>
        )}

        {recoveryActions?.map((action, idx) => (
          <button
            key={idx}
            onClick={action.onClick}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
              action.variant === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' :
              action.variant === 'secondary' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' :
              'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {action.label}
          </button>
        ))}

        {showCopy && (
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copiado
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copiar error
              </>
            )}
          </button>
        )}
      </div>

      {errorCode && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="mt-4 text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1"
        >
          {showDetails ? 'Ocultar' : 'Ver'} detalles técnicos
          <svg className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {showDetails && errorCode && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-left max-w-md w-full">
          <p className="text-xs text-gray-500 font-mono break-all">
            {errorCode}
          </p>
        </div>
      )}
    </div>
  )
}
