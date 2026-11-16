/**
 * #788 — búsqueda de la lista de Pedidos que se resuelve en el navegador
 * (modo heredado, sin Hub): una sola regla para la lista y para las filas
 * pendientes de sincronizar.
 *
 * Nombre de cliente y de negocio: sin distinguir mayúsculas ni tildes, con todas
 * las palabras presentes en cualquier orden. Teléfono y número de pedido
 * conservan su comparación literal: un identificador nunca se aproxima (#789).
 */
import { normalizarTexto } from '@/lib/cliente-search'

export interface PedidoBuscable {
  nombreCli?: string | null
  apellidoCli?: string | null
  nombreNegocioCli?: string | null
  telefonoCli?: string | null
  numero?: number
}

/** Palabras de la búsqueda sin tildes ni mayúsculas. */
function palabrasDe(search: string): string[] {
  return normalizarTexto(search).split(/\s+/).filter(Boolean)
}

/** Coincidencia de contacto: nombre del cliente, nombre del negocio o teléfono. */
export function coincideContactoPedido(p: PedidoBuscable, search: string): boolean {
  const palabras = palabrasDe(search)
  if (palabras.length > 0) {
    const nombres = normalizarTexto(
      `${p.nombreCli ?? ''} ${p.apellidoCli ?? ''} ${p.nombreNegocioCli ?? ''}`,
    )
    if (palabras.every((palabra) => nombres.includes(palabra))) return true
  }
  return Boolean(p.telefonoCli?.includes(search))
}

/** Coincidencia completa de la lista: contacto o número de pedido. */
export function coincidePedidoBusqueda(p: PedidoBuscable, search: string): boolean {
  return coincideContactoPedido(p, search) ||
    (p.numero !== undefined && p.numero.toString().includes(search.toLowerCase()))
}
