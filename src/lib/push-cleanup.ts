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

export async function unsubscribePushOnLogout(signal?: AbortSignal): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  signal?.throwIfAborted()
  try {
    const registration = await serviceWorkerReadyWithTimeout()
    signal?.throwIfAborted()
    if (!registration) return
    const subscription = await registration.pushManager.getSubscription()

    signal?.throwIfAborted()
    if (subscription) {
      const unsubscribed = await subscription.unsubscribe()
      signal?.throwIfAborted()
      if (unsubscribed) {
        await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {
          // Best-effort: the subscription is already gone from the browser.
        })
      }
    }
    signal?.throwIfAborted()
  } catch {
    signal?.throwIfAborted()
    // Preserve existing best-effort behavior for push cleanup.
  }
}
