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
}

export function resolveActualizarCliente(
  input: ResolveActualizarClienteInput,
): { direccion: string; barrio: string } | undefined {
  const { clienteSeleccionado, canal, negocioSeleccionado, editDireccion, editBarrio } = input

  if (!clienteSeleccionado) return undefined
  if (canal !== 'DOMICILIO') return undefined
  if (negocioSeleccionado) return undefined

  const direccionCambio = editDireccion !== (clienteSeleccionado.direccion || '')
  const barrioCambio = editBarrio !== (clienteSeleccionado.barrio || '')
  if (!direccionCambio && !barrioCambio) return undefined

  return { direccion: editDireccion, barrio: editBarrio }
}
