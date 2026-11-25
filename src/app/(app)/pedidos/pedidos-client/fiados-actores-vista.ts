import type { ActoresFiado } from '@/lib/fiados-actores'

/** #614: valor del filtro «Entregado por» para pedidos sin responsable acreditado. */
export const ENTREGO_SIN_IDENTIFICAR = '__sin_identificar__'

export interface PedidoConActores { actores?: ActoresFiado | null }

/** Total físico entregado por producto, sumando solo eventos con cantidades verificadas. */
export function totalesEntregados(actores: ActoresFiado): {
  porProducto: Array<{ producto: string; cantidad: number }>
  total: number
  /** `false` si algún evento no trae cantidades: el total es parcial y se rotula así. */
  completo: boolean
} {
  const suma = new Map<string, number>()
  let completo = actores.entregas.length > 0
  for (const e of actores.entregas) {
    if (!e.cantidades) { completo = false; continue }
    for (const l of e.cantidades) suma.set(l.producto, (suma.get(l.producto) ?? 0) + l.cantidad)
  }
  const porProducto = [...suma].map(([producto, cantidad]) => ({ producto, cantidad })).filter(l => l.cantidad > 0)
  return { porProducto, total: porProducto.reduce((n, l) => n + l.cantidad, 0), completo }
}

/** Personas con entregas acreditadas en el universo, por ID (nunca por nombre). */
export function opcionesEntregadoPor(pedidos: PedidoConActores[]): {
  personas: Array<{ id: string; nombre: string }>
  haySinIdentificar: boolean
} {
  const personas = new Map<string, string>()
  let haySinIdentificar = false
  for (const p of pedidos) {
    if (!p.actores) continue
    if (p.actores.responsablesEntrega.length === 0) haySinIdentificar = true
    for (const r of p.actores.responsablesEntrega) personas.set(r.id, r.nombre)
  }
  return {
    personas: [...personas].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    haySinIdentificar,
  }
}

/** Un pedido compartido coincide con cada una de sus personas; sin datos de actores no se atribuye a nadie. */
export function coincideEntregadoPor(p: PedidoConActores, filtro: string): boolean {
  if (!filtro) return true
  if (!p.actores) return false
  const ids = p.actores.responsablesEntrega
  return filtro === ENTREGO_SIN_IDENTIFICAR ? ids.length === 0 : ids.some(r => r.id === filtro)
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return ((partes[0]?.[0] ?? '?') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}
