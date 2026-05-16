import { prisma } from '@/lib/prisma'
import InsumosClient from './insumos-client'

export default async function InsumosPage() {
  const [insumosRaw, proveedoresRaw] = await Promise.all([
    prisma.insumo.findMany({
      where: { activo: true },
      include: { proveedor: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.proveedor.findMany({
      where: { activo: true },
    }),
  ])

  // Serialize to handle Date objects and Prisma types
  const insumos = JSON.parse(JSON.stringify(insumosRaw))
  const proveedores = JSON.parse(JSON.stringify(proveedoresRaw))

  return (
    <InsumosClient
      initialInsumos={insumos}
      initialProveedores={proveedores}
    />
  )
}
