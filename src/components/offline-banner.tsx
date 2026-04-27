'use client'

import { useOnlineStatus } from '@/hooks/use-online-status'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-yellow-500 text-black px-4 py-2 text-center text-sm z-50">
      Estás offline. Los cambios se sincronizarán cuando reconectes.
    </div>
  )
}