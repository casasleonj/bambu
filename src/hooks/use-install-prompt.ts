'use client'

import { useEffect, useState, useCallback } from 'react'
import { isIosDevice, isStandaloneMode } from '@/lib/pwa'

const DISMISS_KEY = 'pwa-install-banner-dismissed'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

interface UseInstallPromptReturn {
  canInstall: boolean
  isIos: boolean
  isStandalone: boolean
  deferredPrompt: BeforeInstallPromptEvent | null
  install: () => Promise<void>
  dismiss: () => void
  dismissed: boolean
}

export function useInstallPrompt(): UseInstallPromptReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Detección de plataforma/localStorage: APIs browser-only, no
    // derivables durante el render en SSR.
    /* eslint-disable react-hooks/set-state-in-effect */
    setIsIos(isIosDevice())
    setIsStandalone(isStandaloneMode())
    setDismissed(localStorage.getItem(DISMISS_KEY) === 'true')
    /* eslint-enable react-hooks/set-state-in-effect */

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === 'accepted') {
      setIsStandalone(true)
    }
  }, [deferredPrompt])

  const dismiss = useCallback(() => {
    setDismissed(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, 'true')
    }
  }, [])

  return {
    canInstall: deferredPrompt !== null,
    isIos,
    isStandalone,
    deferredPrompt,
    install,
    dismiss,
    dismissed,
  }
}
