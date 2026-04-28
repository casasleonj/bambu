import { prisma } from '@/lib/prisma'
import PreciosClient from './precios-client'

export default async function PreciosPage() {
  const productos = await prisma.producto.findMany({
    where: { activo: true },
    include: {
      precios: {
        where: { activo: true },
        orderBy: [{ canal: 'asc' }, { cantMin: 'asc' }],
      },
    },
    orderBy: { codigo: 'asc' },
  })

  // Serialize Prisma objects (Date, Decimal) for client component props.
  const data = JSON.parse(JSON.stringify(productos))

  return <PreciosClient productos={data} />
}
