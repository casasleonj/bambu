/**
 * #829 — búsqueda de la pestaña Alertas. Misma regla que la lista de Pedidos (#788):
 * nombre, apellido y negocio sin mayúsculas ni tildes, con todas las palabras en
 * cualquier orden; el teléfono sigue siendo literal. Una búsqueda vacía o en blanco no
 * filtra nada.
 */
import type { AlertaRow } from '@/lib/alertas-config'
import { coincideContactoPedido } from '@/lib/pedido-busqueda-local'

export function coincideAlertaBusqueda(fila: AlertaRow, busqueda: string): boolean {
  const termino = busqueda.trim()
  return !termino || coincideContactoPedido(fila, termino)
}
