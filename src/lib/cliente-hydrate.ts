// src/lib/cliente-hydrate.ts
// Hidratador temporal (Fase 2): reconstruye la shape legacy `contactos: [...]`
// desde la nueva relación `contactosRel`. La UI consume la shape legacy;
// este wrapper se elimina en Fase 3 cuando se renombre la relación.

import { prisma } from '@/lib/prisma'

export type ClienteConContactos = NonNullable<
  Awaited<ReturnType<typeof loadClienteCompleto>>
>

/**
 * Carga un cliente con sus contactos hidratados al shape legacy.
 * En Fase 3, eliminar este wrapper y usar `prisma.cliente.findUnique` directo.
 */
export async function loadClienteCompleto(id: string) {
  const c = await prisma.cliente.findUnique({
    where: { id },
    include: { contactosRel: true },
  })
  if (!c) return null
  return {
    ...c,
    contactos: c.contactosRel.map(r => ({
      nombre: r.nombre,
      telefono: r.telefono,
      relacion: r.relacion ?? undefined,
    })),
  }
}

/**
 * Hidrata un cliente ya cargado (con contactosRel) al shape legacy.
 * Útil en mapeos post-query.
 */
export function hydrateContactos<
  T extends { contactosRel: Array<{ nombre: string; telefono: string; relacion: string | null }> }
>(c: T): T & { contactos: Array<{ nombre: string; telefono: string; relacion?: string }> } {
  return {
    ...c,
    contactos: c.contactosRel.map(r => ({
      nombre: r.nombre,
      telefono: r.telefono,
      relacion: r.relacion ?? undefined,
    })),
  }
}

/**
 * Carga una plantilla con sus productos como map.
 * Fase 2: lee desde productosRel, expone como {PACA_AGUA: n, ...}.
 * Fase 3: se elimina este wrapper.
 */
export async function loadPlantillaCompleta(id: string) {
  const p = await prisma.plantillaRecurrente.findUnique({
    where: { id },
    include: { productosRel: true },
  })
  if (!p) return null
  return {
    ...p,
    productos: hydrateProductos(p.productosRel),
  }
}

/**
 * Convierte el array de PlantillaProducto[] en el map legacy.
 */
export function hydrateProductos(
  rows: Array<{ producto: string; cantidad: number }>
): {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
} {
  const map = {
    PACA_AGUA: 0,
    PACA_HIELO: 0,
    BOTELLON: 0,
    BOLSA_AGUA: 0,
    BOLSA_HIELO: 0,
  } as Record<string, number>
  for (const r of rows) {
    if (r.producto in map) {
      map[r.producto] = r.cantidad
    }
  }
  return map as {
    PACA_AGUA: number
    PACA_HIELO: number
    BOTELLON: number
    BOLSA_AGUA: number
    BOLSA_HIELO: number
  }
}
