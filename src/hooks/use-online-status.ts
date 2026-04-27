'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/app-store'

export function useOnlineStatus() {
  const storeIsOnline = useAppStore((state) => state.isOnline)
  const setIsOnline = useAppStore((state) => state.setIsOnline)
  const [isOnline, setLocalOnline] = useState(true)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setLocalOnline(true)
    }
    const handleOffline = () => {
      setIsOnline(false)
      setLocalOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const online = navigator.onLine
    setIsOnline(online)
    setLocalOnline(online)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setIsOnline])

  return storeIsOnline ?? isOnline
}