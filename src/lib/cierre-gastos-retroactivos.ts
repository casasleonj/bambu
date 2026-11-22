import type { PrismaClient } from '@prisma/client'

export interface GastoRetroactivoDelCierre {
  id: string
  origen: 'NOMINA' | 'EMBARQUES' | 'GASTOS'
  concepto: string
  monto: number
  fechaEfectiva: string
  fechaRegistro: string
}

/**
 * Movimientos anotados DESPUÉS de cerrar una jornada pero atribuidos a esa
 * jornada ANTES de la hora de cierre. Se informan, nunca se suman/restan del
 * snapshot ni prueban por sí solos un ingreso/reintegro físico.
 */
export async function leerGastosRetroactivosCierre(
  db: Pick<PrismaClient, 'gasto'>,
  { inicio, fin, horaCierre }: { inicio: Date; fin: Date; horaCierre: Date },
): Promise<GastoRetroactivoDelCierre[]> {
  const corte = new Date(Math.min(fin.getTime(), horaCierre.getTime()))
  if (corte <= inicio) return []

  const registros = await db.gasto.findMany({
    where: {
      fecha: { gte: inicio, lt: corte },
      createdAt: { gt: horaCierre },
    },
    select: {
      id: true, categoria: true, descripcion: true, monto: true,
      fecha: true, createdAt: true, embarqueId: true,
      trabajadorId: true, esPagoPersonal: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

  return registros.map(gasto => {
    const personal = gasto.categoria === 'NOMINA' || gasto.trabajadorId !== null ||
      gasto.esPagoPersonal || gasto.descripcion.startsWith('Reversión nómina anulada -')
    const origen = personal ? 'NOMINA' : gasto.embarqueId ? 'EMBARQUES' : 'GASTOS'
    // No presentar una anotación de sueldo como gasto operativo modificable.
    const concepto = personal ? 'Movimiento de personal registrado desde Nómina'
      : gasto.embarqueId ? 'Movimiento originado en Embarques' : gasto.descripcion
    return {
      id: gasto.id,
      origen,
      concepto,
      monto: Number(gasto.monto),
      fechaEfectiva: gasto.fecha.toISOString(),
      fechaRegistro: gasto.createdAt.toISOString(),
    }
  })
}
