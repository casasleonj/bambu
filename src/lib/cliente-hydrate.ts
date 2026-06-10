// src/lib/cliente-hydrate.ts
// (Fase 3 CONTRACT) Helper de hidratación de productos.
// `cliente.contactos` ahora ES directamente la relación Prisma (array de
// ContactoCliente[]), no necesita hidratación. `cliente.productos` (de
// PlantillaRecurrente) sigue siendo array y necesita mapearse a un map
// {PACA_AGUA: n, ...} para consumidores que esperan el shape legacy.

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
