'use client'

import { useState, useEffect, useCallback } from 'react'
import { syncWithServer, isOnline } from '@/lib/db/sync'

const SYNC_INTERVAL_MS = 30000

export function ConnectivityIndicator() {
  const [online, setOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setOnline(isOnline())
  }, [])

  useEffect(() => {
    if (!mounted) return
    const handle = () => setOnline(isOnline())
    window.addEventListener('online', handle)
    window.addEventListener('offline', handle)
    return () => {
      window.removeEventListener('online', handle)
      window.removeEventListener('offline', handle)
    }
  }, [mounted])

  const doSync = useCallback(async () => {
    if (!mounted || !isOnline() || syncing) return
    setSyncing(true)
    await syncWithServer()
    setSyncing(false)
  }, [mounted, syncing])

  // Skip polling when in Playwright test mode (avoids networkidle timeout)
  const isPlaywright = typeof window !== 'undefined' && (window as any).__PLAYWRIGHT_TEST__

  useEffect(() => {
    if (!mounted || isPlaywright) return
    const id = setInterval(doSync, SYNC_INTERVAL_MS)
    return () => clearInterval(id)
  }, [mounted, doSync, isPlaywright])

  useEffect(() => {
    if (mounted && online && !isPlaywright) doSync()
  }, [online, isPlaywright]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10">
        <span className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
        <span className="text-xs font-medium text-white/50">...</span>
      </div>
    )
  }

  const bg = online ? 'bg-emerald-500/20' : 'bg-red-500/20'
  const dot = online ? 'bg-emerald-400 shadow-emerald-400/60' : 'bg-red-400 shadow-red-400/60'
  const text = online ? 'text-emerald-100' : 'text-red-100'
  const label = syncing ? 'Sync' : online ? 'Online' : 'Offline'

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bg} transition-colors duration-300`}>
      <span className={`w-2 h-2 rounded-full ${dot} shadow-[0_0_6px_currentColor] transition-colors duration-300`} />
      <span className={`text-xs font-semibold tracking-wide ${text} transition-colors duration-300`}>
        {label}
      </span>
      {syncing && (
        <svg className="w-3 h-3 animate-spin text-white/60" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
    </div>
  )
}