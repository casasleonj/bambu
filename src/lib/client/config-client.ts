/**
 * Client-side fetcher for the REQUIERE_FOTO_ENTREGA config.
 *
 * Extracted from PedidosClient so it can be unit-tested in isolation.
 * Returns the parsed boolean (default false on any error).
 *
 * Response shape from /api/config?clave=... is:
 *   { success: true, config: { clave, valor } }
 * (apiSuccess spreads the data to the top level, NOT nested under .data.)
 */
const TRUE_LITERALS = new Set(['true', '1', 'si', 'sí', 'yes', 'y'])

export function parseRequiereFotoValue(raw: unknown): boolean {
  if (raw == null) return false
  const str = String(raw).trim().toLowerCase()
  return TRUE_LITERALS.has(str)
}

export interface ConfigClientOptions {
  /** Override fetch for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Override the URL for testing. */
  url?: string
}

export async function fetchRequiereFotoEntrega(
  opts: ConfigClientOptions = {},
): Promise<boolean> {
  try {
    const f = opts.fetchImpl ?? fetch
    const res = await f(opts.url ?? '/api/config?clave=REQUIERE_FOTO_ENTREGA', {
      cache: 'no-store',
    })
    if (!res.ok) return false
    const json: unknown = await res.json()
    // Top-level path (correct): json.config.valor
    // Legacy path for safety: json.data.valor
    const path = (json as Record<string, unknown> | null)
    const config = (path?.['config'] as { valor?: string } | undefined) ??
                   (path?.['data'] as { valor?: string } | undefined)
    return parseRequiereFotoValue(config?.valor)
  } catch {
    return false
  }
}
