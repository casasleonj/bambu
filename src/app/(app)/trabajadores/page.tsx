import { prisma } from '@/lib/prisma'
import { conDeudaPendiente } from '@/lib/trabajadores-deuda'
import TrabajadoresClient from './trabajadores-client'

export default async function TrabajadoresPage() {
  const trabajadores = await prisma.trabajador.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  })

  // #566: deuda pendiente calculada en el servidor (una consulta agrupada).
  // Si falla, cada trabajador llega con `deudaPendiente: null` y la lista se muestra igual.
  const conDeuda = await conDeudaPendiente(trabajadores)

  // Serialize to plain JSON to handle Prisma Decimal and Date objects
  const serialized = JSON.parse(JSON.stringify(conDeuda))

  return <TrabajadoresClient initialTrabajadores={serialized} />
}
