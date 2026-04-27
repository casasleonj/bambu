'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { syncWithServer, isOnline } from '@/lib/db/sync'

export function ConnectivityIndicator() {
  const [online, setOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<{ synced: number; failed: number } | null>(null)

  useEffect(() => {
    const handle = () => setOnline(isOnline())
    window.addEventListener('online', handle)
    window.addEventListener('offline', handle)
    setOnline(isOnline())
    return () => {
      window.removeEventListener('online', handle)
      window.removeEventListener('offline', handle)
    }
  }, [])

  const handleSync = async () => {
    if (!isOnline()) return
    setSyncing(true)
    setLastResult(null)
    const result = await syncWithServer()
    setLastResult(result)
    setSyncing(false)
  }

  return (
    <div className="flex items-center gap-2 fixed top-4 right-4 z-50 bg-white px-3 py-2 rounded-lg shadow border">
      <span className={`w-3 h-3 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-sm font-medium">{online ? 'En línea' : 'Sin conexión'}</span>
      <Button
        size="sm"
        variant={syncing ? 'ghost' : 'outline'}
        onClick={handleSync}
        disabled={syncing || !online}
      >
        {syncing ? 'Sincronizando...' : 'Sincronizar'}
      </Button>
      {lastResult && (
        <span className="text-xs text-gray-500">
          {lastResult.synced > 0 && `${lastResult.synced} ok`}
          {lastResult.failed > 0 && `, ${lastResult.failed} falló`}
        </span>
      )}
    </div>
  )
}
