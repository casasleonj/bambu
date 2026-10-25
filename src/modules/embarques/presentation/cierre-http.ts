/**
 * Adaptadores HTTP compartidos por `POST /cerrar` y `POST /cerrar/preview`.
 *
 * El preview corre el MISMO caso de uso que el cierre real, así que debe mapear
 * el input y los errores EXACTAMENTE igual: si divergen, el preview deja pasar
 * (o rechaza distinto) lo que el cierre real hará (ADR-CIERRE-002).
 */

import type { z } from 'zod'
import type { CerrarEmbarqueSchema } from '@/lib/validators'
import type { CerrarEmbarqueInput } from '../application/dto'

type CerrarEmbarqueBody = z.infer<typeof CerrarEmbarqueSchema>

const n = (v: number | null | undefined): number => v ?? 0

export function toCerrarInput(
  id: string,
  data: CerrarEmbarqueBody,
  extra: { offlineId?: string; dryRun?: boolean } = {},
): CerrarEmbarqueInput {
  const { pedidos, ventasLibres, productos, cambiosDesdeSustituciones, gastos, dineroEntregado, justificacionDiscrepancia, justificacionFaltante, obs } = data
  return {
    id,
    pedidos: pedidos.map((p) => ({
      pedidoId: p.pedidoId,
      entregado: p.entregado,
      productosEntregados: p.productosEntregados ? {
        cPacaAguaEnt: n(p.productosEntregados.cPacaAguaEnt),
        cPacaHieloEnt: n(p.productosEntregados.cPacaHieloEnt),
        cBotellonFabEnt: n(p.productosEntregados.cBotellonFabEnt),
        cBotellonDomEnt: n(p.productosEntregados.cBotellonDomEnt),
        cBolsaAguaEnt: n(p.productosEntregados.cBolsaAguaEnt),
        cBolsaHieloEnt: n(p.productosEntregados.cBolsaHieloEnt),
      } : undefined,
      pagos: p.pagos.map((pg) => ({ metodo: pg.metodo, monto: n(pg.monto) })),
      preciosReales: p.preciosReales ? {
        pacaAgua: n(p.preciosReales.pacaAgua),
        pacaHielo: n(p.preciosReales.pacaHielo),
        botellonFab: n(p.preciosReales.botellonFab),
        botellonDom: n(p.preciosReales.botellonDom),
        bolsaAgua: n(p.preciosReales.bolsaAgua),
        bolsaHielo: n(p.preciosReales.bolsaHielo),
      } : undefined,
      nuevoEmbarqueId: p.nuevoEmbarqueId ?? undefined,
    })),
    ventasLibres: ventasLibres?.map((v) => ({
      clienteId: v.clienteId,
      cPacaAgua: n(v.cPacaAgua),
      cPacaHielo: n(v.cPacaHielo),
      cBotellonFab: n(v.cBotellonFab),
      cBotellonDom: n(v.cBotellonDom),
      cBolsaAgua: n(v.cBolsaAgua),
      cBolsaHielo: n(v.cBolsaHielo),
      pagos: v.pagos.map((pg) => ({ metodo: pg.metodo, monto: n(pg.monto) })),
      obs: v.obs,
      negocioId: v.negocioId,
      pedidoOrigenId: v.pedidoOrigenId,
      excepcionId: v.excepcionId,
    })),
    productosRetorno: productos,
    ...(cambiosDesdeSustituciones ? { cambiosDesdeSustituciones: true } : {}),
    gastos: gastos?.map((g) => ({ categoria: g.categoria, nota: g.nota, monto: g.monto })),
    dineroEntregado,
    justificacionDiscrepancia,
    justificacionFaltante,
    obs,
    ...(extra.offlineId ? { offlineId: extra.offlineId } : {}),
    ...(extra.dryRun ? { dryRun: true } : {}),
  }
}

export interface ErrorHttpCierre {
  status: number
  message: string
  code?: string
}

const CODIGOS_409 = ['PEDIDOS_SIN_RESOLVER', 'PEDIDO_FUERA_DEL_EMBARQUE', 'PEDIDO_NO_ENTREGABLE', 'PEDIDO_DUPLICADO', 'CAMBIOS_NO_COINCIDEN']
const CODIGOS_400 = [
  'VENTA_LIBRE_PAGO_SIN_PRODUCTOS', 'PAGO_EXCEDE_TOTAL', 'NEGOCIO_INVALIDO', 'PEDIDO_ORIGEN_INVALIDO',
  'VENTA_LIBRE_CLIENTE_NO_ENCONTRADO', 'PAGO_COMPLETO_OBLIGATORIO', 'EXCEPCION_CREDITO_YA_CONSUMIDA',
]

/** Traduce un error del caso de uso a la respuesta HTTP; `null` = no es un error conocido. */
export function mapCierreError(message: string): ErrorHttpCierre | null {
  if (message === 'EMBARQUE_NOT_FOUND') return { status: 404, message: 'Embarque no encontrado' }
  if (message === 'EMBARQUE_YA_CERRADO' || message.toLowerCase().includes('transicion')) {
    return { status: 400, message: 'El embarque ya esta cerrado' }
  }
  if (message.startsWith('PAGOS_EXCEDIDOS')) return { status: 400, message: message.replace('PAGOS_EXCEDIDOS: ', '') }
  // B-12: `COMPLETO` exige cantidad acumulada completa; rechazo determinista.
  if (/^(ENTREGA_INCOMPLETA|ENTREGA_EXCEDE_PEDIDO|ENTREGA_INCONSISTENTE|SALIDAS_EXCEDEN_CARGA)/.test(message)) {
    return { status: 400, message: message.replace(/^(?:ENTREGA_(?:INCOMPLETA|EXCEDE_PEDIDO|INCONSISTENTE)|SALIDAS_EXCEDEN_CARGA): /, '') }
  }
  // Defensa en profundidad: si algún camino persiste `totalPagado > total`, la CHECK de Postgres lo ataja.
  if (message.includes('chk_pedido_montopagado_le_total')) {
    return { status: 400, message: 'Los pagos registrados exceden el total del pedido. Revisá los montos.' }
  }
  if (message.startsWith('EMBARQUE_DESTINO_NOT_FOUND')) return { status: 404, message: message.replace('EMBARQUE_DESTINO_NOT_FOUND: ', '') }
  if (message.startsWith('EMBARQUE_DESTINO_NO_DISPONIBLE')) return { status: 400, message: message.replace('EMBARQUE_DESTINO_NO_DISPONIBLE: ', '') }

  // ADR-CIERRE-002 §1-2: el cierre no cubre exactamente los pedidos vigentes → 409.
  const sep = message.indexOf(': ')
  const codigo = sep > 0 ? message.slice(0, sep) : message
  const texto = sep > 0 ? message.slice(sep + 2) : ''
  if (CODIGOS_409.includes(codigo)) return { status: 409, message: texto, code: codigo }
  // ADR-CIERRE-002 §4: reglas de la venta libre del cierre.
  if (CODIGOS_400.includes(codigo)) return { status: 400, message: texto, code: codigo }
  if (codigo === 'DEUDOR_REQUERIDO') {
    return {
      status: 422,
      message: texto || 'La venta deja saldo pendiente: registra el pago completo o identifica al cliente que queda debiendo.',
      code: 'DEUDOR_REQUERIDO',
    }
  }
  if (message.startsWith('CLIENTE_DEBE:')) return { status: 400, message: message.replace('CLIENTE_DEBE: ', ''), code: 'CLIENTE_DEBE' }
  return null
}
