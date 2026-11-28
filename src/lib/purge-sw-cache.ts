/**
 * Purge all service worker caches.
 * Call this before signOut to prevent stale authenticated HTML from
 * being served to the next user on the same device.
 */
export async function purgeSWCache(signal?: AbortSignal): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('caches' in window)) return

  // Delete all cache entries
  signal?.throwIfAborted()
  const names = await caches.keys()
  // No new destructive work after the deadline. Retain the lock until each
  // already-started deletion finishes; CacheStorage has no abort API.
  for (const name of names) {
    signal?.throwIfAborted()
    await caches.delete(name)
  }
  signal?.throwIfAborted()
}
