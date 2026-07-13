/**
 * fetch con AbortController + timeout.
 *
 * El fetch nativo del navegador no tiene timeout por defecto. En conexiones
 * rurales 2G/3G una request puede quedar colgada indefinidamente si el
 * servidor acepta la conexion pero no responde. Este helper aborta a los
 * `timeoutMs` y deja que el caller maneje el error.
 */
export class FetchTimeoutError extends Error {
  constructor(message = 'La conexión tardó demasiado') {
    super(message)
    this.name = 'FetchTimeoutError'
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return res
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new FetchTimeoutError()
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
