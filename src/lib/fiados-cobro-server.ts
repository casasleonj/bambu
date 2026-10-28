import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { leerMetodosRequierenConfirmacion } from './pago-confirmacion'
import type { PreparacionCobroFiado, ResultadoCobroFiado } from './fiados-cobro'

type Lectura = Pick<Prisma.TransactionClient, 'pedido' | 'cliente' | 'config'>
export const idResultadoFiado = (offlineId: string) => `cobro-fiado:${offlineId}`
export const huellaCobroFiado = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Misma lectura para la revisión y para revalidar bajo CARTERA al registrar. */
export async function prepararCobroFiado(clienteId: string, db: Lectura = prisma): Promise<PreparacionCobroFiado | null> {
  const [cliente, raw, metodosPorConfirmar] = await Promise.all([
    db.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true, apellido: true } }),
    db.pedido.findMany({ where: { clienteId, estadoEntrega: 'ENTREGADO', saldo: { gt: 0 } },
      orderBy: [{ fecha: 'asc' }, { numero: 'asc' }],
      select: { id: true, numero: true, fecha: true, total: true, totalPagado: true, saldo: true,
        factura: { select: { id: true, numero: true, estado: true, saldo: true, montoPagado: true } } },
    }),
    leerMetodosRequierenConfirmacion(db),
  ])
  if (!cliente) return null
  const pedidos = raw.map(p => ({ id: p.id, numero: p.numero, fecha: p.fecha.toISOString(),
    total: Number(p.total), totalPagado: Number(p.totalPagado), saldo: Number(p.saldo),
    factura: p.factura ? { id: p.factura.id, numero: p.factura.numero } : null }))
  return { clienteId, clienteNombre: [cliente.nombre, cliente.apellido].filter(Boolean).join(' '), pedidos,
    deudaTotal: pedidos.reduce((sum, p) => sum + Math.round(p.saldo * 100), 0) / 100,
    metodosPorConfirmar,
    version: huellaCobroFiado({ clienteId, raw, metodosPorConfirmar }),
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
