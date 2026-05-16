import { useState } from 'react'
import { Modal } from '@/components/modal'

export function PasswordResultModal({
  open,
  onClose,
  password,
  userName,
}: {
  open: boolean
  onClose: () => void
  password: string
  userName: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text
      const input = document.getElementById('reset-password-result') as HTMLInputElement
      input?.select()
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl p-6 w-full max-w-md">
      <div className="flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>

        <h3 className="text-lg font-bold text-gray-900 mb-1">Contraseña generada</h3>
        <p className="text-sm text-gray-500 mb-4">
          Nueva contraseña para <span className="font-semibold">{userName}</span>
        </p>

        <div className="w-full bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <p className="text-xs text-amber-700 font-medium mb-2 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Esta contraseña solo se muestra una vez. Copiala y enviala al usuario.
          </p>
          <div className="flex gap-2">
            <input
              id="reset-password-result"
              type="text"
              readOnly
              value={password}
              className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-lg text-center font-mono text-lg tracking-wider text-gray-900"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg transition flex items-center gap-1.5"
              title="Copiar contraseña"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copiado
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copiar
                </>
              )}
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          Entendido, cerrar
        </button>
      </div>
    </Modal>
  )
}
