'use client'

import { useOnlineStatus } from '@/hooks/use-online-status'
import { useOfflineQueue } from '@/hooks/use-offline-queue'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const { queue } = useOfflineQueue()

  if (isOnline) return null

  const pending = queue.length

  return (
    <div className="fixed top-14 left-0 right-0 bg-amber-500 text-amber-950 px-4 py-2.5 text-center text-sm font-medium z-50 shadow-md">
      <div className="flex items-center justify-center gap-2">
        <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span>
          Modo offline — los cambios se guardarán localmente
          {pending > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 bg-amber-700 text-amber-100 text-xs rounded-full font-bold">
              {pending} pendiente{pending !== 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}