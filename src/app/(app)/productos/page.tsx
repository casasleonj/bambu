import { prisma } from '@/lib/prisma'
import ProductosClient from './productos-client'

export default async function ProductosPage() {
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

  return <ProductosClient productos={data} />
}
