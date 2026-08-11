/**
 * Pure decision logic for whether a pedido submit should also persist a
 * cliente address update (Cliente.direccion / Cliente.barrio).
 *
 * MUST return undefined whenever a negocio/sucursal is selected as the
 * delivery destination: in that case editDireccion/editBarrio hold the
 * negocio's address (see the sync effect in index.tsx), not an edit of the
 * cliente's own address. Sending actualizarCliente in that case silently
 * overwrites the cliente's canonical address with the negocio's.
 */

export interface ResolveActualizarClienteInput {
  clienteSeleccionado: { direccion?: string | null; barrio?: string | null } | null
  canal: 'PUNTO' | 'DOMICILIO'
  negocioSeleccionado: string | null
  editDireccion: string
  editBarrio: string
  /**
   * Opt-out explícito para direcciones de entrega puntuales ("el cliente
   * pidió que se lo lleven a otro lado solo hoy"). Default false preserva
   * el comportamiento histórico (toda edición de la dirección del domicilio
   * principal se persiste) — invertir la polaridad a "opt-in por defecto"
   * habría dejado de guardar correcciones reales silenciosamente, que es
   * exactamente el tipo de regresión que este módulo existe para evitar.
   */
  soloParaEstePedido?: boolean
}

export function resolveActualizarCliente(
  input: ResolveActualizarClienteInput,
): { direccion: string; barrio: string } | undefined {
  const { clienteSeleccionado, canal, negocioSeleccionado, editDireccion, editBarrio, soloParaEstePedido } = input

  if (!clienteSeleccionado) return undefined
  if (canal !== 'DOMICILIO') return undefined
  // Invariante crítico (no reordenar): el guard de negocio va siempre
  // primero e incondicional, sin importar soloParaEstePedido. Es la
  // protección del fix original contra pisar Cliente.direccion con la
  // dirección de un negocio.
  if (negocioSeleccionado) return undefined
  if (soloParaEstePedido) return undefined

  const direccionCambio = editDireccion !== (clienteSeleccionado.direccion || '')
  const barrioCambio = editBarrio !== (clienteSeleccionado.barrio || '')
  if (!direccionCambio && !barrioCambio) return undefined

  return { direccion: editDireccion, barrio: editBarrio }
}
