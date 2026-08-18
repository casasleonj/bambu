/**
 * Métricas operacionales (FASE 5, contrato §24).
 *
 * Contadores incrementales expuestos via log estructurado (Pino) y un endpoint
 * `/api/metrics`. Las métricas NO sustituyen invariantes ni constraints; son
 * señal operacional para detectar regresiones (ej. dual_write_divergence_count).
 */

import { logger } from './logger'

const counters = new Map<string, number>()

export function incrementMetric(name: string, delta = 1): void {
  const total = (counters.get(name) ?? 0) + delta
  counters.set(name, total)
  logger.info({ metric: name, delta, total }, 'metric:increment')
}

export function getMetrics(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of counters) {
    out[k] = v
  }
  return out
}
