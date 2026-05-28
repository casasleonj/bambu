import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import EmbarquesClient from './embarques-client'
import { calcularPacasEmbarque, calcularPesoEmbarque, getCapacidadInfo } from '@/lib/embarque-capacidad'

export default async function EmbarquesPage() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return null

  const session = authResult as { user?: { id?: string; role?: string } }
  const isAdmin = session.user?.role === 'ADMIN'

  const [embarques, trabajadores, rutas, pedidos] = await Promise.all([
    prisma.embarque.findMany({
      orderBy: [{ fecha: 'desc' }, { numeroDia: 'desc' }],
      include: {
        trabajador: true,
        ruta: { select: { id: true, nombre: true } },
        pedidos: {
          include: {
            cliente: { select: { id: true, nombre: true, barrio: true } },
          },
        },
        productos: true,
      },
    }),
    prisma.trabajador.findMany({
      where: { rol: 'REPARTIDOR', activo: true, usaMoto: true },
    }),
    prisma.ruta.findMany(),
    isAdmin
      ? prisma.pedido.findMany({
          where: { estado: { in: ['PENDIENTE', 'EN_RUTA'] } },
          include: {
            cliente: { select: { id: true, nombre: true, barrio: true } },
          },
        })
      : prisma.pedido.findMany({
          where: {
            estado: { in: ['PENDIENTE', 'EN_RUTA'] },
            embarque: { trabajadorId: session.user?.id },
          },
          include: {
            cliente: { select: { id: true, nombre: true, barrio: true } },
          },
        }),
  ])

  const initialData = JSON.parse(JSON.stringify({
    embarques: embarques.map(e => {
      const totalPacas = e.productos?.reduce((sum, p) => sum + p.cargadas, 0) ?? calcularPacasEmbarque(e.pedidos)
      const pesoKg = e.productos
        ? (
            (e.productos.find(p => p.producto === 'PACA_AGUA')?.cargadas || 0) * 10.0 +
            (e.productos.find(p => p.producto === 'PACA_HIELO')?.cargadas || 0) * 11.0 +
            (e.productos.find(p => p.producto === 'BOTELLON')?.cargadas || 0) * 20.0 +
            (e.productos.find(p => p.producto === 'BOLSA_AGUA')?.cargadas || 0) * 0.25 +
            (e.productos.find(p => p.producto === 'BOLSA_HIELO')?.cargadas || 0) * 0.55
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
    pedidos,
  }))

  return <EmbarquesClient initialData={initialData} isAdmin={isAdmin} />
}
