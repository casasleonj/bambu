'use client'

import { useInstallPrompt } from '@/hooks/use-install-prompt'

export function PwaInstallBanner() {
  const { canInstall, isIos, isStandalone, install, dismiss, dismissed } = useInstallPrompt()

  if (isStandalone) return null
  if (dismissed) return null
  if (!canInstall && !isIos) return null

  return (
    <div
      role="banner"
      aria-label="Instalar aplicación"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg px-4 py-3 pb-safe"
    >
      <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">Instala Agua Bambú</p>
          {canInstall ? (
            <p className="text-xs text-gray-500 truncate">
              Accede más rápido desde tu pantalla de inicio.
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              Presiona el botón Compartir
              <ShareIcon className="inline w-3.5 h-3.5 mx-0.5 align-text-bottom" />
              y luego &quot;Agregar a pantalla de inicio&quot;.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canInstall && (
            <button
              onClick={install}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              Instalar app
            </button>
          )}
          <button
            onClick={dismiss}
            aria-label="Cerrar banner de instalación"
            className="p-2 min-h-[44px] min-w-[44px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  )
}
