import { describe, it, expect } from 'vitest'
import { resolveActualizarCliente } from '../resolve-actualizar-cliente'

describe('resolveActualizarCliente', () => {
  const cliente = { direccion: 'Calle 1', barrio: 'Centro' }

  it('no envía actualización cuando no hay cliente seleccionado', () => {
    expect(
      resolveActualizarCliente({
        clienteSeleccionado: null,
        canal: 'DOMICILIO',
        negocioSeleccionado: null,
        editDireccion: 'Calle 2',
        editBarrio: 'Norte',
      }),
    ).toBeUndefined()
  })

  it('no envía actualización en canal PUNTO', () => {
    expect(
      resolveActualizarCliente({
        clienteSeleccionado: cliente,
        canal: 'PUNTO',
        negocioSeleccionado: null,
        editDireccion: 'Calle 2',
        editBarrio: 'Norte',
      }),
    ).toBeUndefined()
  })

  it('no envía actualización cuando la dirección/barrio no cambiaron', () => {
    expect(
      resolveActualizarCliente({
        clienteSeleccionado: cliente,
        canal: 'DOMICILIO',
        negocioSeleccionado: null,
        editDireccion: 'Calle 1',
        editBarrio: 'Centro',
      }),
    ).toBeUndefined()
  })

  it('envía actualización cuando el cliente edita su propia dirección sin negocio seleccionado', () => {
    expect(
      resolveActualizarCliente({
        clienteSeleccionado: cliente,
        canal: 'DOMICILIO',
        negocioSeleccionado: null,
        editDireccion: 'Calle 2',
        editBarrio: 'Norte',
      }),
    ).toEqual({ direccion: 'Calle 2', barrio: 'Norte' })
  })

  it('REGRESIÓN: NUNCA envía actualización cuando hay un negocio seleccionado, aunque la dirección visible difiera de la del cliente', () => {
    // Este es exactamente el escenario del bug: el usuario elige un negocio/sucursal
    // como destino de entrega. editDireccion/editBarrio ahora muestran la dirección
    // del NEGOCIO, no una edición de la dirección del cliente. Antes del fix, esto
    // sobreescribía silenciosamente Cliente.direccion con la dirección del negocio.
    expect(
      resolveActualizarCliente({
        clienteSeleccionado: cliente,
        canal: 'DOMICILIO',
        negocioSeleccionado: 'negocio-123',
        editDireccion: 'Dirección del negocio 456',
        editBarrio: 'Barrio del negocio',
      }),
    ).toBeUndefined()
  })

  it('trata null/undefined en direccion/barrio del cliente como string vacío', () => {
    expect(
      resolveActualizarCliente({
        clienteSeleccionado: { direccion: null, barrio: null },
        canal: 'DOMICILIO',
        negocioSeleccionado: null,
        editDireccion: '',
        editBarrio: '',
      }),
    ).toBeUndefined()
  })
})
