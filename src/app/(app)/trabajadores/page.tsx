import { prisma } from '@/lib/prisma'
import TrabajadoresClient from './trabajadores-client'

export default async function TrabajadoresPage() {
  const trabajadores = await prisma.trabajador.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  })

  // Serialize to plain JSON to handle Prisma Decimal and Date objects
  const serialized = JSON.parse(JSON.stringify(trabajadores))

  return <TrabajadoresClient initialTrabajadores={serialized} />
}
