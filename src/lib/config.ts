/**
 * Centralized config (key-value) helper.
 *
 * Reads from the `Config` Prisma model with Next.js Data Cache (60s TTL).
 * Configs modified via /api/config routes are auto-invalidated via revalidateTag.
 *
 * @example
 *   const bloqueado = await getConfigBool('BLOQUEAR_PRECIOS_REPARTIDOR')
 *   const empresa = await getConfigs(['empresa_nombre', 'empresa_nit'])
 *   const baseDia = await getConfigNumber('BASE_DIA', 100000)
 */

import { prisma } from './prisma'
import { revalidateTag, unstable_cache } from 'next/cache'

const CONFIG_CACHE_TAG = 'config'
const CONFIG_TTL_SECONDS = 60

/**
 * Read a single config value by key.
 * Returns null if the key doesn't exist (use defaults at the call site).
 */
export const getConfig = unstable_cache(
  async (clave: string): Promise<string | null> => {
    const config = await prisma.config.findUnique({ where: { clave } })
    return config?.valor ?? null
  },
  ['config-get'],
  { revalidate: CONFIG_TTL_SECONDS, tags: [CONFIG_CACHE_TAG] },
)

/**
 * Read multiple config values at once.
 * Missing keys are absent from the result.
 */
export const getConfigs = unstable_cache(
  async (claves: readonly string[]): Promise<Record<string, string>> => {
    const configs = await prisma.config.findMany({
      where: { clave: { in: claves as string[] } },
    })
    return Object.fromEntries(configs.map((c) => [c.clave, c.valor]))
  },
  ['config-get-many'],
  { revalidate: CONFIG_TTL_SECONDS, tags: [CONFIG_CACHE_TAG] },
)

/**
 * Read a config as boolean. Recognizes 'true' (case-insensitive) as true.
 * Returns the provided default if the key is missing.
 */
export async function getConfigBool(clave: string, defaultValue = false): Promise<boolean> {
  const v = await getConfig(clave)
  if (v === null) return defaultValue
  return v.trim().toLowerCase() === 'true'
}

/**
 * Read a config as number. Returns the provided default if missing or NaN.
 */
export async function getConfigNumber(clave: string, defaultValue = 0): Promise<number> {
  const v = await getConfig(clave)
  if (v === null) return defaultValue
  const n = Number(v)
  return Number.isNaN(n) ? defaultValue : n
}

/**
 * Read a config as integer. Returns the provided default if missing, NaN, or non-integer.
 */
export async function getConfigInt(clave: string, defaultValue = 0): Promise<number> {
  const v = await getConfigNumber(clave, defaultValue)
  return Number.isInteger(v) ? v : defaultValue
}

/**
 * Invalidate all cached config values. Call this after a config is updated.
 * Uses profile 'max' to immediately expire all entries with this tag.
 */
export function revalidateConfigCache(): void {
  revalidateTag(CONFIG_CACHE_TAG, 'max')
}
