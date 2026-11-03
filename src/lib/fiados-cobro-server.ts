import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { leerMetodosRequierenConfirmacion } from './pago-confirmacion'
import type { DeudaFiado, PreparacionCobroFiado, ResultadoCobroFiado } from './fiados-cobro'
import { isConsumidorFinalCanonical } from './cliente-canonical'
import { diaBogota } from './gestion-admin-fecha'
import { todayStringBogota } from './dates'

type Lectura = Pick<Prisma.TransactionClient, 'pedido' | 'cliente' | 'config'>
export const idResultadoFiado = (offlineId: string) => `cobro-fiado:${offlineId}`
export const huellaCobroFiado = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * Misma lectura para la revisión y para revalidar bajo CARTERA al registrar.
 * Con `pedidoId` (#597) solo devuelve ese pedido y, aparte, si el reparto por antigüedad pagaría
 * ANTES otra deuda del cliente (`deudaAnterior`): en ese caso el dinero no debe ir a este pedido.
 */
export async function prepararCobroFiado(clienteId: string, db: Lectura = prisma, pedidoId?: string): Promise<PreparacionCobroFiado | null> {
  const [cliente, todas, metodosPorConfirmar] = await Promise.all([
    db.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true, apellido: true } }),
    db.pedido.findMany({ where: { clienteId, estadoEntrega: 'ENTREGADO', saldo: { gt: 0 } },
      orderBy: [{ fecha: 'asc' }, { numero: 'asc' }],
      select: { id: true, numero: true, fecha: true, total: true, totalPagado: true, saldo: true,
        factura: { select: { id: true, numero: true, estado: true, saldo: true, montoPagado: true } },
        entregadoAt: true, promesaPagoFecha: true },
    }),
    leerMetodosRequierenConfirmacion(db),
  ])
  if (!cliente) return null
  // El orden de `todas` es el del reparto (fecha, número): lo que esté antes del pedido se paga antes.
  const indice = pedidoId ? todas.findIndex(p => p.id === pedidoId) : -1
  const raw = pedidoId ? (indice >= 0 ? [todas[indice]] : []) : todas
  const anteriores = indice > 0 ? todas.slice(0, indice) : []
  const pedidos: DeudaFiado[] = raw.map(p => ({ id: p.id, numero: p.numero, fecha: p.fecha.toISOString(),
    total: Number(p.total), totalPagado: Number(p.totalPagado), saldo: Number(p.saldo),
    factura: p.factura ? { id: p.factura.id, numero: p.factura.numero } : null,
    ...(pedidoId ? { entregadoAt: p.entregadoAt?.toISOString() ?? null, promesaPagoFecha: p.promesaPagoFecha?.toISOString() ?? null } : {}) }))
  // La versión no cambia para el cobro de Fiados: no incluye los campos agregados por #597.
  const base = raw.map(({ entregadoAt: _e, promesaPagoFecha: _p, ...resto }) => resto)
  return { clienteId, clienteNombre: [cliente.nombre, cliente.apellido].filter(Boolean).join(' '), pedidos,
    deudaTotal: pedidos.reduce((sum, p) => sum + Math.round(p.saldo * 100), 0) / 100,
    metodosPorConfirmar,
    ...(pedidoId ? { deudaAnterior: { cantidad: anteriores.length, masAntiguaNumero: anteriores[0]?.numero ?? 0 } } : {}),
    version: huellaCobroFiado({ clienteId, raw: base, metodosPorConfirmar,
      ...(pedidoId ? { pedidoId, anteriores: anteriores.length } : {}) }),
  }
}

export interface RegistroCobroFiado {
  operacion: 'COBRO_FIADO_V2'
  huella: string
  resultado: ResultadoCobroFiado
}

export function leerResultadoFiado(datos: string): RegistroCobroFiado | null {
  try {
    const value: unknown = JSON.parse(datos)
    if (!value || typeof value !== 'object' || !('operacion' in value)
      || value.operacion !== 'COBRO_FIADO_V2' || !('huella' in value) || typeof value.huella !== 'string'
      || !('resultado' in value) || !value.resultado || typeof value.resultado !== 'object') return null
    const r = value.resultado
    if (!('clienteId' in r) || typeof r.clienteId !== 'string' || !('pagosAplicados' in r) || !Array.isArray(r.pagosAplicados)) return null
    // El resultado lo escribe únicamente este handler, en la misma tx del pago.
    return value as RegistroCobroFiado
  } catch { return null }
}

export interface ErrorCobroPedido { code: string; message: string; status: 400 | 409 }

/**
 * #597: el cobro de UN pedido (lista de Pedidos) solo aplica a un pedido entregado HOY, con saldo, de un
 * cliente real, que no se vendió fiado a propósito y sin otra deuda que el reparto por antigüedad pagaría
 * antes (si no, el dinero iría al pedido equivocado). Todo lo demás es un fiado y se cobra en Fiados.
 * `montoCentavos` se valida solo al registrar: el cobro de un pedido nunca genera saldo a favor.
 */
export function errorCobroPedido(prep: PreparacionCobroFiado, clienteId: string, montoCentavos?: number): ErrorCobroPedido | null {
  if (isConsumidorFinalCanonical(clienteId)) return { code: 'CONSUMIDOR_FINAL', status: 400,
    message: 'Las ventas sin cliente se cobran completas al vender; no tienen saldo pendiente.' }
  const pedido = prep.pedidos[0]
  if (!pedido) return { code: 'SIN_DEUDA', status: 400,
    message: 'Este pedido no tiene saldo por cobrar o todavía no está entregado.' }
  // Día de la entrega; si no se registró (ventas inmediatas antiguas), el del pedido.
  if (diaBogota(new Date(pedido.entregadoAt ?? pedido.fecha)) !== todayStringBogota()) return { code: 'PEDIDO_NO_ES_DEL_DIA', status: 409,
    message: 'Este pedido no se entregó hoy, por eso es un fiado. Cóbralo en la pestaña Fiados.' }
  if (pedido.promesaPagoFecha) return { code: 'PEDIDO_VENDIDO_FIADO', status: 409,
    message: 'Este pedido se vendió fiado. Cóbralo en la pestaña Fiados.' }
  if (prep.deudaAnterior && prep.deudaAnterior.cantidad > 0) return { code: 'CLIENTE_CON_DEUDA_ANTERIOR', status: 409,
    message: `Este cliente tiene deuda anterior (la más antigua es el pedido #${prep.deudaAnterior.masAntiguaNumero}). El pago se aplica primero a la más antigua: cóbralo en la pestaña Fiados.` }
  if (montoCentavos !== undefined && montoCentavos > Math.round(pedido.saldo * 100)) return { code: 'MONTO_EXCEDE_PEDIDO', status: 400,
    message: `El monto supera el saldo del pedido (${pedido.saldo}). Registra como máximo el saldo pendiente.` }
  return null
}
