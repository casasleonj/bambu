import type { Prisma } from '@prisma/client'
import { startOfDayBogota } from '@/lib/dates'
import { DIAS_REVISION_SUELDOS, sueldosQueTocan } from '@/lib/sueldos-fijos'
import { diaBogota } from '@/lib/gestion-admin-fecha'

type Db = Pick<Prisma.TransactionClient, 'trabajador' | 'nomina'>

export interface SueldoPendiente {
  trabajadorId: string
  nombre: string
  rol: string
  /** Fecha de pago ya cumplida (YYYY-MM-DD). */
  fecha: string
  /** Monto de cada pago (`salarioFijo`); la nómina puede descontar deudas al pagarlo. */
  monto: number
  /** Su pago queda en la nómina pero no baja el efectivo de la caja (p. ej. el administrador). */
  fueraDeCaja: boolean
}

/**
 * #644 — «Sueldos que tocan»: fechas de pago de sueldo fijo ya cumplidas (hasta `hasta`, día comercial de Bogotá)
 * que ninguna nómina PAGADA del trabajador cubre. Una nómina pendiente no cuenta como pagada: se puede pagar desde aquí.
 */
export async function sueldosPendientesAl(db: Db, hasta: string): Promise<SueldoPendiente[]> {
  const trabajadores = await db.trabajador.findMany({
    where: { activo: true, frecuenciaPago: { not: null }, salarioFijo: { gt: 0 }, tipoPago: { in: ['FIJO', 'MIXTO'] } },
    select: { id: true, nombre: true, rol: true, salarioFijo: true, frecuenciaPago: true, diasPago: true, frecuenciaDesde: true, pagoFueraDeCaja: true },
    orderBy: { nombre: 'asc' },
  })
  if (trabajadores.length === 0) return []

  const desdeVentana = new Date(startOfDayBogota(hasta).getTime() - DIAS_REVISION_SUELDOS * 86_400_000)
  const pagadas = await db.nomina.findMany({
    where: {
      trabajadorId: { in: trabajadores.map((t) => t.id) },
      estado: 'PAGADA',
      fechaFin: { gte: desdeVentana },
    },
    select: { trabajadorId: true, fechaInicio: true, fechaFin: true },
  })

  const resultado: SueldoPendiente[] = []
  for (const t of trabajadores) {
    const suyas = pagadas.filter((n) => n.trabajadorId === t.id)
    const pendientes = sueldosQueTocan(
      { frecuenciaPago: t.frecuenciaPago, diasPago: t.diasPago },
      Number(t.salarioFijo),
      hasta,
      (fecha) => {
        const instante = startOfDayBogota(fecha)
        return suyas.some((n) => n.fechaInicio <= instante && n.fechaFin >= instante)
      },
      DIAS_REVISION_SUELDOS,
      t.frecuenciaDesde ? diaBogota(t.frecuenciaDesde) : undefined,
    )
    for (const p of pendientes) {
      resultado.push({ trabajadorId: t.id, nombre: t.nombre, rol: t.rol, fecha: p.fecha, monto: p.monto, fueraDeCaja: t.pagoFueraDeCaja })
    }
  }
  return resultado.sort((a, b) => (a.fecha === b.fecha ? a.nombre.localeCompare(b.nombre) : a.fecha.localeCompare(b.fecha)))
}
