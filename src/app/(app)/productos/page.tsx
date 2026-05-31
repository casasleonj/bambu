import { prisma } from '@/lib/prisma'
import ProductosClient from './productos-client'
import { auth } from '@/lib/auth'

export default async function ProductosPage() {
  const session = await auth()
  const userRole = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = userRole === 'ADMIN'

  const productos = await prisma.producto.findMany({
    where: { activo: true },
    include: {
      precios: {
        where: { activo: true },
        orderBy: { cantMin: 'asc' },
      },
    },
    orderBy: { codigo: 'asc' },
  })

  const data = JSON.parse(JSON.stringify(productos))

  return <ProductosClient productos={data} isAdmin={isAdmin} />
}
