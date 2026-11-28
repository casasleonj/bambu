/**
 * A read-only browser operation can be abandoned safely. Do not use for
 * mutations (unsubscribe/cache deletion/cookie writes) which retain the lock.
 */
export function awaitLogoutRead<T>(read: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return read
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    read.then(
      value => { signal.removeEventListener('abort', abort); resolve(value) },
      error => { signal.removeEventListener('abort', abort); reject(error) },
    )
    if (signal.aborted) abort()
  })
}
