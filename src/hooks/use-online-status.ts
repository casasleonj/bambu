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

    // navigator.onLine no existe en el servidor, no se puede leer durante
    // el render.
    const online = navigator.onLine
    /* eslint-disable react-hooks/set-state-in-effect */
    setIsOnline(online)
    setLocalOnline(online)
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setIsOnline])

  return storeIsOnline ?? isOnline
}