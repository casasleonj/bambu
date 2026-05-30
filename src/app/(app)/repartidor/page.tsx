import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { RepartidorClient } from './repartidor-client'
import { requirePagePermission } from '@/lib/auth-guard'

export default async function RepartidorPage() {
  await requirePagePermission('view:repartidor')

  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const userRole = session.user.role

  // Find trabajador linked to user
  const trabajador = await prisma.trabajador.findFirst({
    where: { userId },
    select: { id: true, nombre: true },
  })

  if (!trabajador) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900">No tienes perfil de repartidor</h3>
        <p className="text-sm text-gray-500 mt-2">Contacta al administrador para asignarte como repartidor.</p>
      </div>
    )
  }

  // Find open embarque
  const embarque = await prisma.embarque.findFirst({
    where: { trabajadorId: trabajador.id, estado: 'ABIERTO' },
    include: {
      ruta: { select: { nombre: true } },
      pedidos: {
        include: { cliente: { select: { id: true, nombre: true, telefono: true, direccion: true } }, items: true },
        orderBy: { numero: 'asc' },
      },
    },
    orderBy: { numero: 'desc' },
  })

  const embarqueData = embarque
    ? {
        ...embarque,
        fecha: embarque.fecha.toISOString(),
        horaSalida: embarque.horaSalida?.toISOString() || null,
        horaLlegada: embarque.horaLlegada?.toISOString() || null,
        createdAt: embarque.createdAt.toISOString(),
        updatedAt: embarque.updatedAt.toISOString(),
        pedidos: embarque.pedidos.map(p => ({
          ...p,
          fecha: p.fecha.toISOString(),
          fechaEntrega: p.fechaEntrega?.toISOString() || null,
          total: Number(p.total),
          saldo: Number(p.saldo),
          totalPagado: Number(p.totalPagado),
          precioPacaAgua: Number(p.precioPacaAgua),
          precioPacaHielo: Number(p.precioPacaHielo),
          precioBotellonFab: Number(p.precioBotellonFab),
          precioBotellonDom: Number(p.precioBotellonDom),
          precioBolsaAgua: Number(p.precioBolsaAgua),
          precioBolsaHielo: Number(p.precioBolsaHielo),
          gpsLat: p.gpsLat ? Number(p.gpsLat) : null,
          gpsLng: p.gpsLng ? Number(p.gpsLng) : null,
          items: p.items.map(i => ({
            ...i,
            precio: Number(i.precio),
            subtotal: Number(i.subtotal),
          })),
        })),
      }
    : null

  return (
    <RepartidorClient
      trabajador={{ id: trabajador.id, nombre: trabajador.nombre }}
      embarque={embarqueData ? JSON.parse(JSON.stringify(embarqueData)) : null}
      userRole={userRole}
    />
  )
}
