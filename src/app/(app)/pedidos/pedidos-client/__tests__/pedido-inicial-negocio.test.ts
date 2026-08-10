// @tests Regresión: pedidoInicial.cliente.direccion usaba zonaCli/barrioCli
// (ya resueltos con prioridad negocio) como si fueran la dirección propia
// del cliente — corrompía la opción "domicilio principal" al editar un
// pedido que tenía negocioId. Ahora usa el registro real del cliente ya
// cargado en memoria, y pasa la dirección del negocio por separado.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/app/(app)/pedidos/pedidos-client/index.tsx'),
  'utf-8',
)

describe('FIX: pedidoInicial no mezcla la dirección resuelta del negocio con la del cliente', () => {
  const idx = source.indexOf('pedidoInicial={{')
  const end = source.indexOf('}}', idx)
  const block = source.slice(idx, end)

  it('busca el cliente real en la lista ya cargada (clienteRaw) en vez de reusar zonaCli', () => {
    expect(source).toMatch(/const clienteRaw = clientes\.find\(c => c\.id === pedidoEditando\.clienteId\)/)
  })

  it('cliente.direccion prioriza clienteRaw sobre zonaCli', () => {
    expect(block).toMatch(/direccion:\s*clienteRaw\?\.direccion\s*\?\?\s*pedidoEditando\.zonaCli/)
    expect(block).toMatch(/barrio:\s*clienteRaw\?\.barrio\s*\?\?\s*pedidoEditando\.barrioCli/)
  })

  it('pasa negocioDireccion/negocioBarrio por separado, solo cuando hay negocioId', () => {
    expect(block).toMatch(/negocioDireccion:\s*pedidoEditando\.negocioId\s*\?\s*pedidoEditando\.zonaCli\s*:\s*null/)
    expect(block).toMatch(/negocioBarrio:\s*pedidoEditando\.negocioId\s*\?\s*pedidoEditando\.barrioCli\s*:\s*null/)
  })
})
