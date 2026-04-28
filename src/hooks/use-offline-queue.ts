'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/app-store'

interface QueueItem {
  id: string
  endpoint: string
  method: string
  data: any
  timestamp: number
}

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const isOnline = useAppStore((state) => state.isOnline)

  useEffect(() => {
    const stored = localStorage.getItem('syncQueue')
    if (stored) setQueue(JSON.parse(stored))
  }, [])

  useEffect(() => {
    if (isOnline && queue.length > 0) {
      syncQueue()
    }
  }, [isOnline])

  const addToQueue = (item: Omit<QueueItem, 'id' | 'timestamp'>) => {
    const newItem: QueueItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }
    const updated = [...queue, newItem]
    setQueue(updated)
    localStorage.setItem('syncQueue', JSON.stringify(updated))
  }

  const syncQueue = async () => {
    const failed: QueueItem[] = []
    for (const item of queue) {
      try {
        const res = await fetch(item.endpoint, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data),
        })
        if (!res.ok) {
          failed.push(item)
        }
      } catch (e) {
        console.error('Sync failed', e)
        failed.push(item)
      }
    }
    setQueue(failed)
    if (failed.length > 0) {
      localStorage.setItem('syncQueue', JSON.stringify(failed))
    } else {
      localStorage.removeItem('syncQueue')
    }
  }

  return { queue, addToQueue, syncQueue, isOnline }
}