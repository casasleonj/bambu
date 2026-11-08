// #696 — Saldo a favor de UN cliente con el origen de cada movimiento (solo lectura).
//
// Une dos fuentes que ya existen:
//  - `IngresoSaldoFavor` (#524): lo que el cliente entregó de más al cobrar fiados. El pedido, la factura y quién
//    recibió el dinero se leen de la auditoría de ese cobro (`Historial.datos`), validada con zod: si no se puede
//    leer, el cobro queda en `null` («sin dato») y nunca se inventa un valor.
//  - `PedidoSaldoFavorMovimiento` (#533, #577): correcciones de precio, reducciones y anulaciones, que ya traen
//    pedido, autor y motivo.
//
// El saldo es una sola bolsa: aquí NO se atribuye un uso a una entrada concreta.
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { isConsumidorFinalCanonical } from '@/lib/cliente-canonical'

export type TipoMovimientoSaldoFavor = 'ENTRADA_COBRO' | 'ACREDITACION' | 'REAPLICACION' | 'REVERSION_ANULACION'

export interface PedidoDeMovimiento {
  id: string
  numero: number
  factura: string | null
  negocio: string | null
}

export interface CobroDeMovimiento {
  montoRecibido: number | null
  montoAplicado: number | null
  pedidos: Array<PedidoDeMovimiento & { montoAplicado: number }>
  recibio: { quien: 'OFICINA' | 'REPARTIDOR'; nombre: string; fecha: string } | null
}

export interface MovimientoSaldoFavorCliente {
  id: string
  tipo: TipoMovimientoSaldoFavor
  /** Siempre > 0: el signo lo da `signo`. */
  monto: number
  signo: 1 | -1
  fecha: string
  /** Medio en que llegó el dinero (solo `ENTRADA_COBRO`). */
  metodo: string | null
  motivo: string | null
  origenTipo: string | null
  /** Quién lo registró o autorizó. */
  registro: { nombre: string; rol: string } | null
  /** Pedido del que viene el movimiento (correcciones, reducciones y anulaciones). */
  pedido: PedidoDeMovimiento | null
  /** Detalle del cobro (solo `ENTRADA_COBRO`); null = sin dato legible. */
  cobro: CobroDeMovimiento | null
  /** Clave del cobro para soporte (`offlineId`). */
  referencia: string | null
}

export interface SaldoFavorCliente {
  cliente: { id: string; nombre: string }
  saldo: number
  movimientos: MovimientoSaldoFavorCliente[]
  hayMas: boolean
}

export const LIMITE_MOVIMIENTOS_SALDO_FAVOR = 50

// ---------------------------------------------------------------------------------------------------------------------
// Auditoría del cobro (COBRO_FIADO_V2)
// ---------------------------------------------------------------------------------------------------------------------

const AuditoriaCobroSchema = z.object({
  operacion: z.literal('COBRO_FIADO_V2'),
  resultado: z.object({
    montoRecibido: z.number().finite().optional(),
    montoAplicado: z.number().finite().optional(),
    pagosAplicados: z
      .array(
        z.object({
          pedidoId: z.string().min(1),
          numero: z.number().int(),
          facturaNumero: z.string().nullish(),
          montoAplicado: z.number().finite(),
        }),
      )
      .default([]),
    recepcion: z
      .object({ quien: z.enum(['OFICINA', 'REPARTIDOR']), nombre: z.string(), fecha: z.string() })
      .optional(),
  }),
})

export interface CobroDeAuditoria {
  montoRecibido: number | null
  montoAplicado: number | null
  pedidos: Array<{ pedidoId: string; numero: number; facturaNumero: string | null; montoAplicado: number }>
  recibio: { quien: 'OFICINA' | 'REPARTIDOR'; nombre: string; fecha: string } | null
}

/** Lee el origen de un cobro de fiados desde su auditoría. null si no se puede leer con certeza. */
export function leerCobroDeAuditoria(datos: string): CobroDeAuditoria | null {
  let json: unknown
  try {
    json = JSON.parse(datos)
  } catch {
    return null
  }
  const r = AuditoriaCobroSchema.safeParse(json)
  if (!r.success) return null
  const { resultado } = r.data
  return {
    montoRecibido: resultado.montoRecibido ?? null,
    montoAplicado: resultado.montoAplicado ?? null,
    pedidos: resultado.pagosAplicados.map((p) => ({
      pedidoId: p.pedidoId,
      numero: p.numero,
      facturaNumero: p.facturaNumero ?? null,
      montoAplicado: p.montoAplicado,
    })),
    recibio: resultado.recepcion ?? null,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Armado (puro)
// ---------------------------------------------------------------------------------------------------------------------

export interface UsuarioLite {
  nombre: string
  apellido: string
  rol: string
}

export interface EntradaArmado {
  ingresos: Array<{
    id: string
    metodo: string
    monto: number
    createdAt: Date
    createdById: string | null
    auditoriaId: string | null
    offlineId: string | null
  }>
  /** `Historial.datos` por id de auditoría. */
  auditorias: Map<string, string>
  movimientos: Array<{
    id: string
    tipo: Exclude<TipoMovimientoSaldoFavor, 'ENTRADA_COBRO'>
    monto: number
    origenTipo: string
    motivo: string
    createdAt: Date
    autorId: string
    pedidoId: string
  }>
  usuarios: Map<string, UsuarioLite>
  /** Solo pedidos de ESTE cliente: lo que no esté aquí no se muestra. */
  pedidos: Map<string, PedidoDeMovimiento>
  limite: number
}

const nombreDe = (u: UsuarioLite) => [u.nombre, u.apellido].filter(Boolean).join(' ').trim() || 'Sin nombre'

function registroDe(id: string | null, usuarios: Map<string, UsuarioLite>): MovimientoSaldoFavorCliente['registro'] {
  const u = id ? usuarios.get(id) : undefined
  return u ? { nombre: nombreDe(u), rol: u.rol } : null
}

export function armarMovimientosSaldoFavor(e: EntradaArmado): { movimientos: MovimientoSaldoFavorCliente[]; hayMas: boolean } {
  const filas: MovimientoSaldoFavorCliente[] = []

  for (const i of e.ingresos) {
    const datos = i.auditoriaId ? e.auditorias.get(i.auditoriaId) : undefined
    const leido = datos === undefined ? null : leerCobroDeAuditoria(datos)
    const cobro: CobroDeMovimiento | null = leido
      ? {
          montoRecibido: leido.montoRecibido,
          montoAplicado: leido.montoAplicado,
          pedidos: leido.pedidos.flatMap((p) => {
            const ped = e.pedidos.get(p.pedidoId)
            // Solo pedidos que existen y son de este cliente; la factura sale del pedido y, si no, de la auditoría.
            return ped ? [{ ...ped, factura: ped.factura ?? p.facturaNumero, montoAplicado: p.montoAplicado }] : []
          }),
          recibio: leido.recibio,
        }
      : null
    filas.push({
      id: i.id,
      tipo: 'ENTRADA_COBRO',
      monto: i.monto,
      signo: 1,
      fecha: i.createdAt.toISOString(),
      metodo: i.metodo,
      motivo: null,
      origenTipo: 'PAGAR_FIADO',
      registro: registroDe(i.createdById, e.usuarios),
      pedido: null,
      cobro,
      referencia: i.offlineId,
    })
  }

  for (const m of e.movimientos) {
    filas.push({
      id: m.id,
      tipo: m.tipo,
      monto: m.monto,
      signo: m.tipo === 'ACREDITACION' ? 1 : -1,
      fecha: m.createdAt.toISOString(),
      metodo: null,
      motivo: m.motivo || null,
      origenTipo: m.origenTipo,
      registro: registroDe(m.autorId, e.usuarios),
      pedido: e.pedidos.get(m.pedidoId) ?? null,
      cobro: null,
      referencia: null,
    })
  }

  filas.sort((a, b) => (a.fecha === b.fecha ? (a.id < b.id ? 1 : -1) : a.fecha < b.fecha ? 1 : -1))
  return { movimientos: filas.slice(0, e.limite), hayMas: filas.length > e.limite }
}

// ---------------------------------------------------------------------------------------------------------------------
// Lectura (I/O)
// ---------------------------------------------------------------------------------------------------------------------

type Db = Pick<
  Prisma.TransactionClient,
  'cliente' | 'ingresoSaldoFavor' | 'pedidoSaldoFavorMovimiento' | 'historial' | 'pedido' | 'user'
>

/** null = el cliente no existe. */
export async function leerSaldoFavorCliente(
  db: Db,
  clienteId: string,
  limite: number = LIMITE_MOVIMIENTOS_SALDO_FAVOR,
): Promise<SaldoFavorCliente | null> {
  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, nombre: true, apellido: true, saldoFavor: true },
  })
  if (!cliente) return null
  const titular = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ').trim()
  // La venta anónima no tiene a quién acreditar saldo a favor.
  if (isConsumidorFinalCanonical(clienteId)) {
    return { cliente: { id: cliente.id, nombre: titular }, saldo: 0, movimientos: [], hayMas: false }
  }

  // limite + 1 por fuente alcanza para saber si hay más al unirlas.
  const [ingresos, movimientos] = await Promise.all([
    db.ingresoSaldoFavor.findMany({ where: { clienteId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limite + 1 }),
    db.pedidoSaldoFavorMovimiento.findMany({ where: { clienteId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limite + 1 }),
  ])

  const auditoriaIds = [...new Set(ingresos.flatMap((i) => (i.auditoriaId ? [i.auditoriaId] : [])))]
  const historial = auditoriaIds.length
    ? await db.historial.findMany({ where: { id: { in: auditoriaIds } }, select: { id: true, datos: true } })
    : []
  const auditorias = new Map(historial.map((h) => [h.id, h.datos]))

  // Pedidos citados por las auditorías y por los movimientos; solo se aceptan los de este cliente.
  const pedidoIds = new Set<string>(movimientos.map((m) => m.pedidoId))
  for (const datos of auditorias.values()) {
    for (const p of leerCobroDeAuditoria(datos)?.pedidos ?? []) pedidoIds.add(p.pedidoId)
  }
  const pedidosDb = pedidoIds.size
    ? await db.pedido.findMany({
        where: { id: { in: [...pedidoIds] }, clienteId },
        select: { id: true, numero: true, negocio: { select: { nombre: true } }, factura: { select: { numero: true } } },
      })
    : []
  const pedidos = new Map<string, PedidoDeMovimiento>(
    pedidosDb.map((p) => [p.id, { id: p.id, numero: p.numero, factura: p.factura?.numero ?? null, negocio: p.negocio?.nombre ?? null }]),
  )

  const userIds = [...new Set([...ingresos.flatMap((i) => (i.createdById ? [i.createdById] : [])), ...movimientos.map((m) => m.autorId)])]
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true, apellido: true, rol: true } })
    : []
  const usuarios = new Map<string, UsuarioLite>(users.map((u) => [u.id, { nombre: u.nombre, apellido: u.apellido, rol: u.rol }]))

  const armado = armarMovimientosSaldoFavor({
    ingresos: ingresos.map((i) => ({
      id: i.id,
      metodo: i.metodo,
      monto: Number(i.monto),
      createdAt: i.createdAt,
      createdById: i.createdById,
      auditoriaId: i.auditoriaId,
      offlineId: i.offlineId,
    })),
    auditorias,
    movimientos: movimientos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      monto: Number(m.monto),
      origenTipo: m.origenTipo,
      motivo: m.motivo,
      createdAt: m.createdAt,
      autorId: m.autorId,
      pedidoId: m.pedidoId,
    })),
    usuarios,
    pedidos,
    limite,
  })

  return { cliente: { id: cliente.id, nombre: titular }, saldo: Number(cliente.saldoFavor), ...armado }
}
