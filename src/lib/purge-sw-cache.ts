/**
 * Purge all service worker caches.
 * Call this before signOut to prevent stale authenticated HTML from
 * being served to the next user on the same device.
 */
export async function purgeSWCache(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('caches' in window)) return

  // Delete all cache entries
  const names = await caches.keys()
  await Promise.all(names.map((name) => caches.delete(name)))
}
