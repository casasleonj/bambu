/**
 * Cross-tab price synchronization.
 * When prices are updated in one tab, other tabs get notified.
 * Uses BroadcastChannel with localStorage fallback for older browsers.
 */

const CHANNEL_NAME = 'price-updates'
const STORAGE_KEY = 'precios_updated'

/**
 * Broadcast that prices have been updated to all other tabs.
 * Call this after a successful price save/add/delete.
 */
export function broadcastPriceUpdate(): void {
  if (typeof window === 'undefined') return

  // Method 1: BroadcastChannel (fast, same-origin only)
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage({ type: 'prices_updated', ts: Date.now() })
    channel.close()
  } catch {
    // BroadcastChannel not available
  }

  // Method 2: localStorage (works across tabs, triggers storage event)
  try {
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
  } catch {
    // localStorage not available (private mode, etc.)
  }
}

/**
 * Subscribe to price update notifications from other tabs.
 * Returns a cleanup function to unsubscribe.
 */
export function onPriceUpdate(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  let cleanupBroadcast: (() => void) | null = null
  let cleanupStorage: (() => void) | null = null

  // Method 1: BroadcastChannel
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'prices_updated') {
        callback()
      }
    }
    cleanupBroadcast = () => channel.close()
  } catch {
    // BroadcastChannel not available
  }

  // Method 2: localStorage storage event (fires in OTHER tabs only)
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      callback()
    }
  }
  window.addEventListener('storage', storageHandler)
  cleanupStorage = () => window.removeEventListener('storage', storageHandler)

  return () => {
    cleanupBroadcast?.()
    cleanupStorage?.()
  }
}
