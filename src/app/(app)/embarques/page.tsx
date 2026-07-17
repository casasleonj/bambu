import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import EmbarquesClient from './embarques-client'
import { calcularPacasEmbarque, calcularPesoEmbarque, getCapacidadInfo, PESOS_KG } from '@/lib/embarque-capacidad'
import { getStockEstimadoHoy, getStockDisponible } from '@/lib/stock'

export default async function EmbarquesPage() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return null

  const session = authResult as { user?: { id?: string; role?: string } }
  const isAdmin = session.user?.role === 'ADMIN'

  // FIX prod-performance: limitar listado inicial a 100 embarques recientes.
  // El detalle de un embarque específico carga sus pedidos completos en su
  // propia página (/embarques/[id]).
  const [embarques, trabajadores, rutas, stockEstimado, stockDisponible] = await Promise.all([
    prisma.embarque.findMany({
      orderBy: [{ fecha: 'desc' }, { numeroDia: 'desc' }],
      take: 100,
      include: {
        trabajador: true,
        ruta: { select: { id: true, nombre: true } },
        pedidos: {
          select: {
            id: true,
            cPacaAguaPed: true,
            cPacaHieloPed: true,
            cBotellonFabPed: true,
            cBotellonDomPed: true,
            cBolsaAguaPed: true,
            cBolsaHieloPed: true,
          },
        },
        productos: true,
      },
    }),
    prisma.trabajador.findMany({
      where: { rol: 'REPARTIDOR', activo: true, usaMoto: true },
    }),
    prisma.ruta.findMany(),
    getStockEstimadoHoy(),
    getStockDisponible(),
  ])

  const totalStockAguaHielo = (stockDisponible.stock.PACA_AGUA || 0) + (stockDisponible.stock.PACA_HIELO || 0)
  const stockBajo = totalStockAguaHielo < 50

  const initialData = JSON.parse(JSON.stringify({
    embarques: embarques.map(e => {
      const totalPacas = e.productos?.reduce((sum, p) => sum + p.cargadas, 0) ?? calcularPacasEmbarque(e.pedidos)
      const pesoKg = e.productos
        ? (
            (e.productos.find(p => p.producto === 'PACA_AGUA')?.cargadas || 0) * PESOS_KG.PACA_AGUA +
            (e.productos.find(p => p.producto === 'PACA_HIELO')?.cargadas || 0) * PESOS_KG.PACA_HIELO +
            (e.productos.find(p => p.producto === 'BOTELLON')?.cargadas || 0) * PESOS_KG.BOTELLON +
            (e.productos.find(p => p.producto === 'BOLSA_AGUA')?.cargadas || 0) * PESOS_KG.BOLSA_AGUA +
            (e.productos.find(p => p.producto === 'BOLSA_HIELO')?.cargadas || 0) * PESOS_KG.BOLSA_HIELO
          )
        : calcularPesoEmbarque(e.pedidos)
      const capacidadKg = e.trabajador.capacidadKg || 500
      const capacidadInfo = getCapacidadInfo(totalPacas, pesoKg, capacidadKg)

      return {
        ...e,
        totalPacas,
        pesoKg,
        capacidadKg,
        capacidadInfo,
        baseDinero: Number(e.baseDinero || 0),
      }
    }),
    trabajadores,
    rutas,
    stockEstimado,
    stockBajo,
  }))

  return <EmbarquesClient initialData={initialData} isAdmin={isAdmin} />
}
