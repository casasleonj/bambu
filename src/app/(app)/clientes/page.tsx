import { prisma } from '@/lib/prisma'
import ClientesClient from './clientes-client'

export type ClientesSearchParams = {
  openCliente?: string
  bloqueado?: string
  reclamaciones?: string
  noVerificado?: string
}

export type FiltroRiesgo = 'bloqueado' | 'reclamaciones' | 'noVerificado' | null

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<ClientesSearchParams>
}) {
  const resolvedSearchParams = await searchParams
  // Determinar filtro de riesgo activo
  let filtroActivo: FiltroRiesgo = null
  const where: Record<string, unknown> = {
    activo: true,
    // FIX consumidor-final-duplicado: ocultar el canónico y cualquier
    // duplicado legacy CUID que haya quedado con nombre='Consumidor Final'.
    // El canónico tiene activo=false, pero esta es defensa en profundidad.
    NOT: [
      { id: 'CONSUMIDOR_FINAL' },
      { nombre: 'Consumidor Final', telefono: '' },
    ],
  }

  if (resolvedSearchParams.bloqueado === 'true') {
    filtroActivo = 'bloqueado'
    ;(where as Record<string, unknown>).bloqueado = true
  } else if (resolvedSearchParams.reclamaciones === 'gte3') {
    filtroActivo = 'reclamaciones'
    ;(where as Record<string, unknown>).reclamaciones = { gte: 3 }
  } else if (resolvedSearchParams.noVerificado === 'true') {
    filtroActivo = 'noVerificado'
    ;(where as Record<string, unknown>).verificado = false
  }

  const clientes = await prisma.cliente.findMany({
    where,
    orderBy: { nombre: 'asc' },
    include: {
      _count: { select: { pedidos: true } },
      pedidos: {
        where: {
          saldo: { gt: 0 },
          estadoEntrega: 'ENTREGADO',
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

  return <ClientesClient initialClientes={serialized} openClienteId={resolvedSearchParams.openCliente} filtroActivo={filtroActivo} />
}
