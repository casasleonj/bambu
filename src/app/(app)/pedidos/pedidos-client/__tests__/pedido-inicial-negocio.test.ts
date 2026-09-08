// @tests Regresión: pedidoInicial.cliente.direccion usaba zonaCli/barrioCli
// (ya resueltos con prioridad negocio) como si fueran la dirección propia
// del cliente — corrompía la opción "domicilio principal" al editar un
// pedido que tenía negocioId. Ahora usa el registro real del cliente ya
// cargado en memoria, y pasa la dirección del negocio por separado.
//
// Composición C4: el modal de editar ahora tiene DOS ramas — `PedidosWorkspace`
// (hubMode) y `PedidoFormUnified` (legacy). La invariante aplica a ambas.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/app/(app)/pedidos/pedidos-client/index.tsx'),
  'utf-8',
)

// bloque legacy (PedidoFormUnified) del modal de editar — anclado en su `key`
const legacyIdx = source.indexOf('pedidoInicial={{', source.indexOf('`edit-${pedidoEditando.id}`'))
const legacyBlock = source.slice(legacyIdx, source.indexOf('}}', legacyIdx))

// bloque nuevo (PedidosWorkspace) del modal de editar — anclado en su `key`
const wsIdx = source.indexOf('pedidoInicial={{', source.indexOf('`edit-ws-${pedidoEditando.id}`'))
const wsBlock = source.slice(wsIdx, source.indexOf('}}', wsIdx))

describe('FIX: pedidoInicial no mezcla la dirección resuelta del negocio con la del cliente', () => {
  it('busca el cliente real en la lista ya cargada (clienteRaw) en vez de reusar zonaCli', () => {
    expect(source).toMatch(/const clienteRaw = clientes\.find\(c => c\.id === pedidoEditando\.clienteId\)/)
  })

  it('la dirección del cliente prioriza clienteRaw sobre zonaCli (ambas ramas)', () => {
    expect(legacyBlock).toMatch(/direccion:\s*clienteRaw\?\.direccion\s*\?\?\s*pedidoEditando\.zonaCli/)
    expect(legacyBlock).toMatch(/barrio:\s*clienteRaw\?\.barrio\s*\?\?\s*pedidoEditando\.barrioCli/)
    expect(wsBlock).toMatch(/clienteDireccion:\s*clienteRaw\?\.direccion\s*\?\?\s*pedidoEditando\.zonaCli/)
    expect(wsBlock).toMatch(/clienteBarrio:\s*clienteRaw\?\.barrio\s*\?\?\s*pedidoEditando\.barrioCli/)
  })

  it('pasa negocioDireccion/negocioBarrio por separado, solo cuando hay negocioId (ambas ramas)', () => {
    for (const block of [legacyBlock, wsBlock]) {
      expect(block).toMatch(/negocioDireccion:\s*pedidoEditando\.negocioId\s*\?\s*pedidoEditando\.zonaCli\s*:\s*null/)
      expect(block).toMatch(/negocioBarrio:\s*pedidoEditando\.negocioId\s*\?\s*pedidoEditando\.barrioCli\s*:\s*null/)
    }
  })
})
