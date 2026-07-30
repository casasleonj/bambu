import { prisma } from '@/lib/prisma'
import { hydrateProductos } from '@/lib/cliente-hydrate'
import type { Recurrente } from './recurrentes-client/types'
import RecurrentesClient from './recurrentes-client'

export default async function RecurrentesPage() {
  // Fetch plantillas server-side para evitar cold start duplicado.
  // El preview (más complejo y caro) se carga lazy via hook client-side.
  const plantillas = await prisma.plantillaRecurrente.findMany({
    where: { activo: true },
    include: {
      cliente: { select: { id: true, nombre: true, telefono: true } },
      productos: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const initialRecurrentes: Recurrente[] = plantillas
    .filter(pt => pt.cliente) // Only include plantillas with valid cliente
    .map(pt => ({
      id: pt.id,
      cliente: {
        id: pt.cliente!.id,
        nombre: pt.cliente!.nombre,
        telefono: pt.cliente!.telefono,
      },
      cadaNDias: pt.cadaNDias,
      tipo: pt.tipo,
      canal: pt.canal,
      horaPreferida: pt.horaPreferida,
      productos: hydrateProductos(pt.productos),
      ultimaGeneracion: pt.ultimaGeneracion?.toISOString() ?? null,
      proxGeneracion: pt.proxGeneracion?.toISOString() ?? null,
      saltos: pt.saltos,
      pausaHasta: pt.pausaHasta?.toISOString() ?? null,
      notas: pt.notas ?? null,
    }))

  return <RecurrentesClient initialRecurrentes={initialRecurrentes} />
}
