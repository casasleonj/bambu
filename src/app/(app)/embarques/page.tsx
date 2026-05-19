import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import EmbarquesClient from './embarques-client'

export default async function EmbarquesPage() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return null

  const session = authResult as { user?: { id?: string; role?: string } }
  const isAdmin = session.user?.role === 'ADMIN'

  const [embarques, trabajadores, rutas, pedidos] = await Promise.all([
    prisma.embarque.findMany({
      orderBy: { numero: 'desc' },
      include: {
        trabajador: true,
        ruta: { select: { id: true, nombre: true } },
        pedidos: {
          include: {
            cliente: { select: { id: true, nombre: true, barrio: true } },
          },
        },
      },
    }),
    prisma.trabajador.findMany({
      where: { rol: 'REPARTIDOR', activo: true },
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
    embarques: embarques.map(e => ({
      ...e,
      totalPacas: e.pedidos.reduce((s, p) =>
        s + (p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) +
        (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) +
        (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0), 0),
      pesoKg: e.pedidos.reduce((s, p) =>
        s + (p.cPacaAguaPed || 0) * 10.0 + (p.cPacaHieloPed || 0) * 11.0 +
        (p.cBotellonFabPed || 0) * 20.0 + (p.cBotellonDomPed || 0) * 20.0 +
        (p.cBolsaAguaPed || 0) * 0.25 + (p.cBolsaHieloPed || 0) * 0.55, 0),
    })),
    trabajadores,
    rutas,
    pedidos,
  }))

  return <EmbarquesClient initialData={initialData} />
}
