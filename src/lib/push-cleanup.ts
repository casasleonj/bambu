/**
 * Push subscription cleanup on logout.
 *
 * Removes the browser's push subscription and tells the backend to delete
 * the stored subscription for the current device. Called before signOut so
 * the next user on the same device does not receive the previous user's
 * notifications.
 */
const SERVICE_WORKER_READY_TIMEOUT_MS = 3000

async function serviceWorkerReadyWithTimeout(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('serviceWorker.ready timeout')), SERVICE_WORKER_READY_TIMEOUT_MS),
      ),
    ])
  } catch {
    return null
  }
}

export async function unsubscribePushOnLogout(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  try {
    const registration = await serviceWorkerReadyWithTimeout()
    if (!registration) return
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      const unsubscribed = await subscription.unsubscribe()
      if (unsubscribed) {
        await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {
          // Best-effort: the subscription is already gone from the browser.
        })
      }
    }
  } catch {
    // Ignore cleanup errors during logout.
  }
}
