import { prisma } from '@/lib/prisma'
import CasosClient from './casos-client'

export default async function CasosPage() {
  const casos = await prisma.caso.findMany({
    include: {
      cliente: { select: { id: true, nombre: true, telefono: true } },
      pedido: { select: { id: true, numero: true, total: true } },
      asignadoA: { select: { id: true, username: true } },
      creadoPor: { select: { id: true, username: true } },
      _count: { select: { eventos: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const usuarios = await prisma.user.findMany({
    where: { activo: true },
    select: { id: true, username: true, rol: true },
    orderBy: { username: 'asc' },
  })

  const serialized = JSON.parse(JSON.stringify(casos))

  return <CasosClient initialCasos={serialized} usuarios={usuarios} />
}
