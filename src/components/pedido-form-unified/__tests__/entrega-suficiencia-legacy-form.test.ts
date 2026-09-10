// @tests BUG DE PRODUCCIÓN + BRECHA PLAN↔CÓDIGO — el form legacy de creación
// de pedido DOMICILIO exigía `direccion` + `barrio` con una segunda autoridad
// hardcodeada, ignorando `resolverEntrega()` (F-ENTREGA). Un cliente/negocio
// con ubicación utilizable (coords o link resoluble) quedaba bloqueado.
//
// Contrato del fix:
// - El form NO re-implementa la regla de suficiencia. La autoridad es el
//   dominio (`resolverEntrega`), re-validado en POST /api/pedidos → 422
//   ENTREGA_INSUFICIENTE (mensaje accionable, mostrado por useCrearPedido).
// - handleSubmit NO exige `editDireccion && editBarrio` para el cliente
//   seleccionado.
// - Única excepción: el alta de cliente nuevo desde este form no tiene campo
//   de ubicación → pide una dirección escrita (Vía B); el barrio NO se exige.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/components/pedido-form-unified/index.tsx'),
  'utf-8',
)

describe('FIX: el form legacy delega la suficiencia de entrega en el dominio', () => {
  it('handleSubmit YA NO exige "dirección Y barrio" para el cliente seleccionado', () => {
    expect(source).not.toMatch(/clienteSeleccionado && \(!editDireccion \|\| !editBarrio\)/)
    expect(source).not.toMatch(/Dirección y barrio son obligatorios para envío a domicilio/)
  })

  it('para el cliente NUEVO inline exige solo dirección (Vía B), no barrio', () => {
    const idx = source.indexOf('const handleSubmit')
    const block = source.slice(idx, source.indexOf('setSubmitting(true)', idx))
    expect(block).toMatch(/canal === 'DOMICILIO' && mostrarNuevo && !nuevoCliente\.direccion/)
    // no vuelve a aparecer el AND con barrio para el cliente nuevo
    expect(block).not.toMatch(/!nuevoCliente\.direccion \|\| !nuevoCliente\.barrio/)
  })

  it('el comentario deja explícito que la autoridad es `resolverEntrega` / el 422 del backend', () => {
    const idx = source.indexOf('const handleSubmit')
    const block = source.slice(idx, source.indexOf('setSubmitting(true)', idx))
    expect(block).toMatch(/resolverEntrega/)
    expect(block).toMatch(/ENTREGA_INSUFICIENTE/)
  })
})
