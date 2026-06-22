'use client'

import { useEffect, useState, useCallback } from 'react'

const DISMISS_KEY = 'pwa-install-banner-dismissed'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  return /ipad|iphone|ipod/.test(ua) || /ipad|iphone|ipod/.test(platform)
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  if ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone) {
    return true
  }
  return window.matchMedia('(display-mode: standalone)').matches
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

  useEffect(() => {
    if (typeof window === 'undefined') return

    setIsStandalone(isStandaloneMode())
    setDismissed(localStorage.getItem(DISMISS_KEY) === 'true')

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    isIos: isIosDevice(),
    isStandalone,
    deferredPrompt,
    install,
    dismiss,
    dismissed,
  }
}
