/**
 * Regla ÚNICA de resolución de dirección de TEXTO efectiva de un pedido.
 *
 * Gemelo de `pickCoords()` (mismo archivo hermano, misma prioridad):
 * override del pedido (Bloque "dirección de entrega por pedido") → negocio →
 * cliente → ninguna. Existía duplicada de forma independiente en al menos 4
 * lugares (SSR /pedidos, GET /api/pedidos, GET /api/pedidos/[id], y faltaba
 * por completo en /embarques); esta función centraliza esa lógica para que
 * los consumidores no diverjan.
 */

export interface DireccionSource {
  direccion?: string | null
  barrio?: string | null
}

export interface PedidoDireccionInput {
  cliente?: DireccionSource | null
  negocio?: DireccionSource | null
  /** Snapshot por pedido (dirección de entrega puntual). Gana sobre negocio/cliente. */
  overrideDireccion?: string | null
  overrideBarrio?: string | null
}

export interface EffectiveDireccion {
  direccion: string
  barrio: string
  fuente: 'override' | 'negocio' | 'cliente' | 'ninguna'
}

function tieneTexto(direccion?: string | null, barrio?: string | null): boolean {
  return Boolean((direccion && direccion.trim()) || (barrio && barrio.trim()))
}

/** Resuelve la dirección de texto efectiva de un pedido. */
export function pickDireccionTexto(p: PedidoDireccionInput): EffectiveDireccion {
  if (tieneTexto(p.overrideDireccion, p.overrideBarrio)) {
    return { direccion: p.overrideDireccion || '', barrio: p.overrideBarrio || '', fuente: 'override' }
  }
  if (p.negocio && tieneTexto(p.negocio.direccion, p.negocio.barrio)) {
    return { direccion: p.negocio.direccion || '', barrio: p.negocio.barrio || '', fuente: 'negocio' }
  }
  if (p.cliente && tieneTexto(p.cliente.direccion, p.cliente.barrio)) {
    return { direccion: p.cliente.direccion || '', barrio: p.cliente.barrio || '', fuente: 'cliente' }
  }
  return { direccion: '', barrio: '', fuente: 'ninguna' }
}
