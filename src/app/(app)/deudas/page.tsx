import { prisma } from '@/lib/prisma'
import DeudasGlobalClient from './deudas-global-client'

export default async function DeudasGlobalesPage() {
  // Get all pending debts grouped by worker
  const deudasPorTrabajador = await prisma.deudaTrabajador.groupBy({
    by: ['trabajadorId'],
    where: { montoPendiente: { gt: 0 } },
    _sum: { montoPendiente: true, montoOriginal: true },
    _count: { id: true },
  })

  const trabajadorIds = deudasPorTrabajador.map(d => d.trabajadorId)
  const trabajadores = await prisma.trabajador.findMany({
    where: { id: { in: trabajadorIds } },
    select: { id: true, nombre: true, rol: true, activo: true },
  })
  const trabajadorMap = Object.fromEntries(trabajadores.map(t => [t.id, t]))

  const resumen = deudasPorTrabajador.map(d => ({
    trabajadorId: d.trabajadorId,
    nombre: trabajadorMap[d.trabajadorId]?.nombre || 'Desconocido',
    rol: trabajadorMap[d.trabajadorId]?.rol || '',
    activo: trabajadorMap[d.trabajadorId]?.activo ?? true,
    totalPendiente: Number(d._sum.montoPendiente || 0),
    totalOriginal: Number(d._sum.montoOriginal || 0),
    cantidadDeudas: d._count.id,
  })).sort((a, b) => b.totalPendiente - a.totalPendiente)

  const totalGeneral = resumen.reduce((sum, r) => sum + r.totalPendiente, 0)

  return (
    <DeudasGlobalClient
      initialResumen={resumen}
      totalGeneral={totalGeneral}
    />
  )
}
