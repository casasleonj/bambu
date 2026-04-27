export async function syncOfflineData() {
  if (!navigator.onLine) return

  const { syncPedidos } = await import('./offline')
  await syncPedidos()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', syncOfflineData)
}