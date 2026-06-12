'use client'

import { useState, useEffect, useCallback } from 'react'
import { syncWithServer, isOnline } from '@/lib/db/sync'
import { fetchResilient } from '@/lib/fetch-resilient'
import { offlineDb } from '@/lib/db/offline'
import { logger } from '@/lib/logger'

const SYNC_INTERVAL_MS = 30000
const QUEUE_POLL_MS = 5000 // Poll queue size for UI counter (cheap read)

export function ConnectivityIndicator() {
  const [online, setOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    setMounted(true)
    setOnline(isOnline())
  }, [])

  // FIX Fase 1 §5.2: pedir persistent storage al boot. Sin esto, el SO
  // puede borrar la cola offline (requestQueue en IndexedDB) cuando hay
  // presión de almacenamiento. navigator.storage.persist() pide al browser
  // que marque el origin como persistente — el usuario puede negarlo, en
  // cuyo caso seguimos funcionando en best-effort como antes.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return
    let cancelled = false
    void navigator.storage.persisted().then(async (alreadyGranted) => {
      if (alreadyGranted || cancelled) return
      const granted = await navigator.storage.persist()
      logger.info(
        { granted, persisted: await navigator.storage.persisted() },
        'storage.persist() request',
      )
    })
    return () => {
      cancelled = true
    }
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
    try {
      const result = await syncWithServer()
      logger.info({ ...result }, 'Manual sync result')
    } finally {
      setSyncing(false)
      // Update counter after sync
      const count = await offlineDb.requestQueue.count()
      setPendingCount(count)
    }
  }, [mounted, syncing])

  // Skip polling when in Playwright test mode (avoids networkidle timeout)
  const isPlaywright = typeof window !== 'undefined' && (window as any).__PLAYWRIGHT_TEST__

  // Poll queue size for the UI counter (one read on mount, then interval)
  useEffect(() => {
    if (!mounted) return
    const updateCount = async () => {
      try {
        const count = await offlineDb.requestQueue.count()
        setPendingCount(count)
      } catch (e) {
        logger.error({ err: e instanceof Error ? e.message : 'Unknown' }, 'Failed to count requestQueue')
      }
    }
    void updateCount()
    if (isPlaywright) return // skip polling in tests
    const id = setInterval(updateCount, QUEUE_POLL_MS)
    return () => clearInterval(id)
  }, [mounted, isPlaywright])

  useEffect(() => {
    if (!mounted || isPlaywright) return
    const id = setInterval(doSync, SYNC_INTERVAL_MS)
    return () => clearInterval(id)
  }, [mounted, doSync, isPlaywright])

  useEffect(() => {
    if (mounted && online && !isPlaywright) doSync()
  }, [online, isPlaywright]) // eslint-disable-line react-hooks/exhaustive-deps

  // Expose test helpers on window when running under Playwright.
  // Permite a los E2E tests inspeccionar y manipular la cola offline
  // sin tener que reproducir el comportamiento del usuario por la UI.
  useEffect(() => {
    if (!isPlaywright || typeof window === 'undefined') return
    ;(window as any).__bambu = {
      fetchResilient,
      syncWithServer,
      getRequestQueue: () => offlineDb.requestQueue.toArray(),
      getSyncQueue: () => offlineDb.syncQueue.toArray(),
      clearQueues: async () => {
        await offlineDb.requestQueue.clear()
        await offlineDb.syncQueue.clear()
      },
    }
  }, [isPlaywright])

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
  const showPending = pendingCount > 0
  const canSync = online && !syncing && pendingCount > 0

  const handleClick = () => {
    if (canSync) doSync()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canSync}
      aria-label={
        canSync
          ? `Sincronizar ${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}`
          : `Estado de conexión: ${label}${showPending ? `. ${pendingCount} cambios pendientes.` : ''}`
      }
      data-testid="connectivity-indicator"
      data-pending-count={pendingCount}
      // FIX mobile UX: padding más compacto, label oculto en <sm.
      className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full ${bg} transition-colors duration-300 flex-shrink-0 ${
        canSync ? 'cursor-pointer hover:brightness-110 active:scale-95' : 'cursor-default'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${dot} shadow-[0_0_6px_currentColor] transition-colors duration-300`} />
      <span className={`text-xs font-semibold tracking-wide ${text} transition-colors duration-300 hidden sm:inline`}>
        {label}
      </span>
      {showPending && (
        <span
          data-testid="pending-sync-counter"
          className="ml-0.5 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold rounded-full bg-amber-400 text-amber-950 leading-none"
          title={`${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'} de sincronizar`}
        >
          {pendingCount}
        </span>
      )}
      {syncing && (
        <svg className="w-3 h-3 animate-spin text-white/60" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
    </button>
  )
}