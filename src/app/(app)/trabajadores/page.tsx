import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import TrabajadoresClient from './trabajadores-client'

export default async function TrabajadoresPage() {
  const session = await auth()
  // Crear, editar y desactivar trabajadores es solo del ADMIN (las rutas responden 403 al resto).
  const soloLectura = (session?.user as { role?: string } | undefined)?.role !== 'ADMIN'
  const trabajadores = await prisma.trabajador.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  })

  // Serialize to plain JSON to handle Prisma Decimal and Date objects
  const serialized = JSON.parse(JSON.stringify(trabajadores))

  return <TrabajadoresClient initialTrabajadores={serialized} soloLectura={soloLectura} />
}
