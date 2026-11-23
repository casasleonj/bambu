/**
 * #630 F1-B1a / #602: fecha de entrega en ventas libres creadas en ruta.
 * No inferir el instante físico a partir de la hora en que sincroniza.
 * El ocurridoAt declarado debe ser consistente con la captura local.
 * Fechas sospechosas o históricas sin evidencia quedan pendientes.
 */
import {
  UMBRAL_TARDIA_MS,
  UMBRAL_SOSPECHOSA_MS,
  type ClasificacionTemporal,
} from '@/lib/venta-libre-clasificacion'

const TOLERANCIA_RELOJ_MS = 5 * 60 * 1000

export interface FechaEntregaVentaLibreInput {
  entregarAhora: boolean
  occurredAt: Date | null
  capturedAt: Date | null
  serverReceivedAt: Date
  clasificacionTemporal: ClasificacionTemporal
}

export function resolverFechaEntregaVentaLibre(input: FechaEntregaVentaLibreInput): Date | null {
  const { occurredAt, capturedAt, serverReceivedAt } = input
  if (!input.entregarAhora || !occurredAt || !capturedAt ||
      input.clasificacionTemporal === 'SOSPECHOSA') return null
  const ocurrido = occurredAt.getTime()
  const capturado = capturedAt.getTime()
  const recibido = serverReceivedAt.getTime()
  if (![ocurrido, capturado, recibido].every(Number.isFinite)) return null
  if (Math.abs(ocurrido - capturado) > UMBRAL_TARDIA_MS) return null
  if (ocurrido > recibido + TOLERANCIA_RELOJ_MS ||
      capturado > recibido + TOLERANCIA_RELOJ_MS) return null
  if (recibido - capturado > UMBRAL_SOSPECHOSA_MS) return null
  return new Date(ocurrido)
}
