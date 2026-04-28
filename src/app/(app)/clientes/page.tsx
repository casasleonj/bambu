import { prisma } from '@/lib/prisma'
import ClientesClient from './clientes-client'

export default async function ClientesPage() {
  const clientes = await prisma.cliente.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
    include: { _count: { select: { pedidos: true } } },
  })

  // Serialize Prisma objects (Date, Decimal) for client component props.
  // Also map id -> clienteId to match the shape the client component expects.
  const serialized = JSON.parse(JSON.stringify(clientes)).map(
    (c: Record<string, unknown>) => ({
      ...c,
      clienteId: c.id,
      precioAguaPref: c.precioAguaPref ? Number(c.precioAguaPref) : undefined,
    })
  )

  return <ClientesClient initialClientes={serialized} />
}
