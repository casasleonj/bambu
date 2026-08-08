// @tests Regresión: no repetir el destino de entrega 2-3 veces en pantalla.
//
// Antes: NegocioSelector mostraba SIEMPRE la lista completa de opciones
// (domicilio principal + cada negocio) Y pedido-form-unified agregaba un
// banner aparte ("Envío a domicilio del cliente" / "Envío a sucursal") que
// repetía la misma decisión, además de los inputs editables de
// Dirección/Barrio mostrando el mismo texto una vez más. NegocioSelector
// ahora colapsa a un resumen de una línea (ver negocio-selector.tsx), así
// que el banner intermedio queda puramente redundante y se elimina.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/components/pedido-form-unified/index.tsx'),
  'utf-8',
)

describe('FIX: no hay banner redundante de "Envío a sucursal / domicilio"', () => {
  it('no contiene el banner de destino duplicado', () => {
    expect(source).not.toContain('Envío a sucursal')
    expect(source).not.toContain('Envío a domicilio del cliente')
  })
})
