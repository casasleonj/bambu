import type { Prisma } from '@prisma/client'

/**
 * Deuda pendiente de un trabajador, lista para mostrar (#566).
 *
 * Reúne dos orígenes que la nómina descuenta hoy:
 *  - `DeudaTrabajador` con saldo (préstamos, adelantos, descuadres de caja y fiados no cobrados).
 *  - `DescuentoRepartidor` todavía no aplicado en una nómina (faltante de embarque).
 * Las cifras salen del servidor; la pantalla no suma nada por su cuenta.
 */

export type OrigenDeuda = 'DEUDA' | 'DESCUENTO_EMBARQUE'

export interface DeudaItem {
  id: string
  origen: OrigenDeuda
  fecha: string
  concepto: string
  detalle: string
  pedido: { id: string; numero: number; cliente: string } | null
  total: number
  pendiente: number
}

export interface DeudasTrabajador {
  items: DeudaItem[]
  totalPendiente: number
  cantidad: number
}

export interface ResumenDeudaTrabajador {
  totalPendiente: number
  cantidad: number
}

interface DeudaFila {
  id: string
  trabajadorId: string
  tipo: string
  montoOriginal: Prisma.Decimal | number
  montoPendiente: Prisma.Decimal | number
  descripcion: string
  fecha: Date
  pedido: {
    id: string
    numero: number
    cliente: { nombre: string; apellido: string | null }
  } | null
}

interface DescuentoFila {
  id: string
  trabajadorId: string
  monto: Prisma.Decimal | number
  motivo: string
  fecha: Date
}

const CONCEPTO_POR_TIPO: Record<string, string> = {
  PRESTAMO: 'Préstamo',
  ADELANTO_NOMINA: 'Adelanto de nómina',
  OTRO: 'Otra deuda',
}

function conceptoDeuda(fila: DeudaFila): string {
  if (fila.tipo === 'DEFICIT_EFECTIVO') {
    // «Fiado no cobrado» es el único descuadre que nace de un pedido; el resto es caja.
    return fila.pedido || fila.descripcion.startsWith('Fiado no cobrado') ? 'Fiado no cobrado' : 'Descuadre de caja'
  }
  return CONCEPTO_POR_TIPO[fila.tipo] ?? 'Otra deuda'
}

/** Arma los ítems de UN trabajador, ordenados del más reciente al más antiguo. */
export function armarDeudasTrabajador(deudas: DeudaFila[], descuentos: DescuentoFila[]): DeudasTrabajador {
  const items: DeudaItem[] = [
    ...deudas.map((d): DeudaItem => ({
      id: d.id,
      origen: 'DEUDA',
      fecha: d.fecha.toISOString(),
      concepto: conceptoDeuda(d),
      detalle: d.descripcion,
      pedido: d.pedido
        ? {
            id: d.pedido.id,
            numero: d.pedido.numero,
            cliente: [d.pedido.cliente.nombre, d.pedido.cliente.apellido].filter(Boolean).join(' '),
          }
        : null,
      total: Number(d.montoOriginal),
      pendiente: Number(d.montoPendiente),
    })),
    ...descuentos.map((x): DeudaItem => ({
      id: x.id,
      origen: 'DESCUENTO_EMBARQUE',
      fecha: x.fecha.toISOString(),
      concepto: 'Faltante de embarque',
      detalle: x.motivo,
      pedido: null,
      total: Number(x.monto),
      pendiente: Number(x.monto),
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))

  return {
    items,
    totalPendiente: items.reduce((s, i) => s + i.pendiente, 0),
    cantidad: items.length,
  }
}

type Db = Pick<Prisma.TransactionClient, 'deudaTrabajador' | 'descuentoRepartidor'>

/** Deuda pendiente por trabajador. Sin `trabajadorIds` trae a todos los que deben algo. */
export async function obtenerDeudasPendientes(
  db: Db,
  trabajadorIds?: string[],
): Promise<Map<string, DeudasTrabajador>> {
  const filtro = trabajadorIds ? { trabajadorId: { in: trabajadorIds } } : {}
  const [deudas, descuentos] = await Promise.all([
    db.deudaTrabajador.findMany({
      where: { ...filtro, montoPendiente: { gt: 0 } },
      select: {
        id: true,
        trabajadorId: true,
        tipo: true,
        montoOriginal: true,
        montoPendiente: true,
        descripcion: true,
        fecha: true,
        pedido: {
          select: { id: true, numero: true, cliente: { select: { nombre: true, apellido: true } } },
        },
      },
    }),
    db.descuentoRepartidor.findMany({
      where: { ...filtro, aplicadoEnNomina: false },
      select: { id: true, trabajadorId: true, monto: true, motivo: true, fecha: true },
    }),
  ])

  const ids = new Set<string>([...deudas.map((d) => d.trabajadorId), ...descuentos.map((x) => x.trabajadorId)])
  const resultado = new Map<string, DeudasTrabajador>()
  for (const id of ids) {
    resultado.set(
      id,
      armarDeudasTrabajador(
        deudas.filter((d) => d.trabajadorId === id),
        descuentos.filter((x) => x.trabajadorId === id),
      ),
    )
  }
  return resultado
}
