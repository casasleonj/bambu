import { prisma } from '@/lib/prisma'

export interface PedidoParaEnriquecer {
  id: string
  numero: number
  negocioId?: string | null
  clienteId?: string | null
  cliente?: {
    id?: string
    nombre: string
    apellido?: string | null
    barrio?: string | null
    telefono?: string | null
  } | null
}

export interface PedidoEnriquecido {
  clienteId: string
  negocioId?: string | null
  nombreCli: string
  apellidoCli?: string | null
  nombreNegocioCli?: string | null
}

/**
 * Enriquece pedidos provenientes de embarques con los nombres de negocio
 * y cliente necesarios para mostrar el display correcto.
 */
export async function enrichPedidosWithNegocio<T extends PedidoParaEnriquecer>(
  pedidos: T[],
): Promise<Array<T & PedidoEnriquecido>> {
  const negocioIds = [...new Set(pedidos.map(p => p.negocioId).filter(Boolean))] as string[]
  const clienteIds = [...new Set(pedidos.map(p => p.clienteId || p.cliente?.id).filter(Boolean))] as string[]

  const [negocios, clientes] = await Promise.all([
    negocioIds.length > 0
      ? prisma.negocio.findMany({
          where: { id: { in: negocioIds } },
          select: { id: true, nombre: true },
        })
      : Promise.resolve([]),
    clienteIds.length > 0
      ? prisma.cliente.findMany({
          where: { id: { in: clienteIds } },
          select: { id: true, nombre: true, apellido: true },
        })
      : Promise.resolve([]),
  ])

  const negocioMap = new Map(negocios.map(n => [n.id, n.nombre]))
  const clienteMap = new Map(clientes.map(c => [c.id, c]))

  return pedidos.map(p => {
    const clienteId = p.clienteId || p.cliente?.id
    const cliente = clienteId ? clienteMap.get(clienteId) : null
    const nombreCli = cliente?.nombre || p.cliente?.nombre || 'Sin cliente'
    const apellidoCli = cliente?.apellido ?? p.cliente?.apellido ?? null

    return {
      ...p,
      clienteId: clienteId || p.cliente?.id || '',
      negocioId: p.negocioId,
      nombreCli,
      apellidoCli,
      nombreNegocioCli: p.negocioId ? negocioMap.get(p.negocioId) || null : null,
    }
  })
}
