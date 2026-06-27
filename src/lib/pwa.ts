/**
 * Utilidades PWA (Progressive Web App).
 *
 * Centraliza la deteccion de iOS y modo standalone para evitar duplicacion
 * entre hooks y componentes.
 */

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  return /ipad|iphone|ipod/.test(ua) || /ipad|iphone|ipod/.test(platform)
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  if ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone) {
    return true
  }
  return window.matchMedia('(display-mode: standalone)').matches
}
