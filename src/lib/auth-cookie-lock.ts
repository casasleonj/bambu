/** Browser-local coordination only. Never stores credentials or application data. */
export const AUTH_COOKIE_LOCK = 'bambu:auth-cookie:760'
let fallbackQueue: Promise<unknown> = Promise.resolve()

export class AuthCookieLockError extends Error {
  constructor() {
    super('No se pudo completar el acceso. Reintenta en unos segundos.')
    this.name = 'AuthCookieLockError'
  }
}

export async function withAuthCookieLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    try {
      return await navigator.locks.request(AUTH_COOKIE_LOCK, { signal: controller.signal }, () => {
        clearTimeout(timer)
        return action()
      })
    } catch (error) {
      if (controller.signal.aborted) throw new AuthCookieLockError()
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  // Older/insecure browsers retain same-tab serialization. Web Locks supplies the
  // cross-tab guarantee in supported secure contexts (HTTPS and localhost).
  const pending = fallbackQueue.then(action, action)
  fallbackQueue = pending.catch(() => undefined)
  return pending
}
