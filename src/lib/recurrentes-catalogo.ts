import { prisma } from './prisma'
import { hydrateProductos } from './cliente-hydrate'
import type { Prisma } from '@prisma/client'

/** Misma consulta para la página y la API; no excluye el contexto Negocio. */
export async function leerCatalogoRecurrentes(
  where: Prisma.PlantillaRecurrenteWhereInput,
) {
  const rows = await prisma.plantillaRecurrente.findMany({
    where,
    include: {
      cliente: { select: { id: true, nombre: true, telefono: true } },
      negocio: {
        select: {
          id: true,
          nombre: true,
          cliente: { select: { id: true, nombre: true } },
        },
      },
      productos: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  })
  return rows.map((pt) => ({
    ...pt,
    productos: hydrateProductos(pt.productos),
  }))
}
