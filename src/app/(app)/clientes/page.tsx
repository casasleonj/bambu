import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import ClientesClient from './clientes-client'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ openCliente?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const session = await auth()
  const isAdmin = session?.user?.role === 'ADMIN'
  const clientes = await prisma.cliente.findMany({
    where: {
      activo: true,
      ...(isAdmin ? {} : { id: { not: 'CONSUMIDOR_FINAL' } }),
    },
    orderBy: { nombre: 'asc' },
    include: {
      _count: { select: { pedidos: true } },
      pedidos: {
        where: {
          saldo: { gt: 0 },
          estadoEntrega: { in: ['ENTREGADO', 'EN_RUTA', 'PENDIENTE', 'NO_ENTREGADO'] },
        },
        include: {
          factura: {
            include: {
              abonos: true,
            },
          },
          pagos: true,
        },
      },
      negocios: {
        where: { activo: true },
        select: {
          id: true,
          nombre: true,
          tipoNegocio: true,
          direccion: true,
          barrio: true,
          referencia: true,
        },
      },
    },
  })

  // Serialize Prisma objects (Date, Decimal) for client component props.
  // Also map id -> clienteId to match the shape the client component expects.
  // Calculate saldoPendiente from pedidos with saldo > 0
  const serialized = JSON.parse(JSON.stringify(clientes)).map(
    (c: Record<string, unknown>) => ({
      ...c,
      clienteId: c.id,
      saldoPendiente: (c.pedidos as Array<{ saldo: number }>).reduce(
        (sum: number, p: { saldo: number }) => sum + Number(p.saldo), 0
      ),
      preciosEspeciales: c.preciosEspeciales || undefined,
    })
  )

  return <ClientesClient initialClientes={serialized} openClienteId={resolvedSearchParams.openCliente} />
}
