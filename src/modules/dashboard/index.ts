/**
 * Dashboard Module — Composition Root.
 *
 * Assembles all repositories and provides the use case entry point.
 * This is the only file the presentation layer should import from this module.
 */

import { PrismaFinanzasRepository } from './infrastructure/finanzas.repository'
import { getDashboardData } from './application'
import {
  PrismaPedidoRepository,
  PrismaProduccionRepository,
  PrismaConfigRepository,
  PrismaAlertasRepository,
  PrismaGastosRepository,
  PrismaEmbarquesRepository,
} from './infrastructure'

// Singleton repositories — created once, reused across requests
const pedidoRepo = new PrismaPedidoRepository()
const produccionRepo = new PrismaProduccionRepository()
const configRepo = new PrismaConfigRepository()
const alertasRepo = new PrismaAlertasRepository()
const gastosRepo = new PrismaGastosRepository()
const embarquesRepo = new PrismaEmbarquesRepository()

export { getDashboardData }

/**
 * Convenience wrapper that creates the dependency graph internally.
 * Presentation layer calls this directly.
 */
export async function fetchDashboardData(
  todayRange: { start: Date; end: Date },
  yesterdayRange: { start: Date; end: Date },
) {
  return getDashboardData(todayRange, yesterdayRange, {
    finanzas: new PrismaFinanzasRepository(),
    pedidos: pedidoRepo,
    produccion: produccionRepo,
    config: configRepo,
    alertas: alertasRepo,
    gastos: gastosRepo,
    embarques: embarquesRepo,
  })
}

/** Anclar ambos días a un solo instante; extremos exclusivos, sin perder el último milisegundo. */
export function fetchCurrentDashboardData(now = new Date()) {
  const dia = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const start = new Date(`${dia}T00:00:00-05:00`)
  const hoy = { start, end: new Date(+start + 86_400_000) }
  const ayer = { start: new Date(+start - 86_400_000), end: start }
  return fetchDashboardData(hoy, ayer)
}
