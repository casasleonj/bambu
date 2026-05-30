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

  // Fetch inactive tiers only for ADMIN
  let inactiveByProducto: Record<string, Array<{ id: string; productoId: string; cantMin: number; cantMax: number | null; precio: string; activo: boolean }>> = {}
  if (isAdmin) {
    const inactiveTiers = await prisma.precioVolumen.findMany({
      where: { activo: false },
      orderBy: [{ productoId: 'asc' }, { cantMin: 'asc' }],
    })
    inactiveByProducto = {}
    for (const tier of inactiveTiers) {
      if (!inactiveByProducto[tier.productoId]) inactiveByProducto[tier.productoId] = []
      inactiveByProducto[tier.productoId].push({
        id: tier.id,
        productoId: tier.productoId,
        cantMin: tier.cantMin,
        cantMax: tier.cantMax,
        precio: tier.precio.toString(),
        activo: tier.activo,
      })
    }
  }

  // Attach inactive tiers to each producto (only if admin)
  const data = JSON.parse(JSON.stringify(productos.map(p => ({
    ...p,
    preciosInactivos: isAdmin ? (inactiveByProducto[p.id] || []) : [],
  }))))

  return <ProductosClient productos={data} isAdmin={isAdmin} />
}
