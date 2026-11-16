/**
 * #788 — búsqueda de la lista de Pedidos que se resuelve en el navegador
 * (modo heredado, sin Hub): una sola regla para la lista y para las filas
 * pendientes de sincronizar.
 *
 * Nombre de cliente, apellido y negocio: sin distinguir mayúsculas ni tildes, por
 * fragmento en cualquier posición (igual que el `contains` del Hub) y con todas
 * las palabras presentes en cualquier orden. Teléfono y número de pedido
 * conservan su comparación literal: un identificador nunca se aproxima (#789).
 * Los espacios al inicio o al final se ignoran en todos los campos.
 */
import { normalizarTexto } from '@/lib/cliente-search'

export interface PedidoBuscable {
  nombreCli?: string | null
  apellidoCli?: string | null
  nombreNegocioCli?: string | null
  telefonoCli?: string | null
  numero?: number
}

/** Coincidencia de contacto: nombre del cliente, nombre del negocio o teléfono. */
export function coincideContactoPedido(p: PedidoBuscable, search: string): boolean {
  const termino = search.trim()
  if (!termino) return false
  const palabras = normalizarTexto(termino).split(/\s+/).filter(Boolean)
  const nombres = normalizarTexto(
    `${p.nombreCli ?? ''} ${p.apellidoCli ?? ''} ${p.nombreNegocioCli ?? ''}`,
  )
  if (palabras.every((palabra) => nombres.includes(palabra))) return true
  return Boolean(p.telefonoCli?.includes(termino))
}

/** Coincidencia completa de la lista: contacto o número de pedido. */
export function coincidePedidoBusqueda(p: PedidoBuscable, search: string): boolean {
  const termino = search.trim()
  if (!termino) return false
  return coincideContactoPedido(p, termino) ||
    (p.numero !== undefined && p.numero.toString().includes(termino.toLowerCase()))
}
