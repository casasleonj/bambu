// @tests Step 7b — snapshot de dirección puntual del pedido
// (Pedido.direccionEntrega/barrioEntrega).
//
// Contrato: el texto tipeado en el form SIEMPRE se envía (independiente del
// checkbox "solo para este pedido"), pero solo se persiste como snapshot
// propio del pedido cuando difiere de la dirección resuelta en vivo
// (pickDireccionTexto: negocio gana, fallback cliente). Si coincide, no se
// guarda nada — evita duplicar en cada pedido un dato que ya está reflejado
// por la resolución normal.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const crearPath = join(
  process.cwd(),
  'src/modules/pedidos/application/use-cases/CrearPedidoUseCase.ts',
)
const crearSource = readFileSync(crearPath, 'utf-8')

describe('CrearPedidoUseCase: snapshot de dirección puntual', () => {
  it('importa pickDireccionTexto (regla única, no lógica duplicada)', () => {
    expect(crearSource).toMatch(/import \{ pickDireccionTexto \} from '@\/lib\/geo\/pedido-direccion'/)
  })

  it('solo calcula el snapshot si input trae direccionEntrega o barrioEntrega', () => {
    expect(crearSource).toMatch(/if \(input\.direccionEntrega \|\| input\.barrioEntrega\) \{/)
  })

  it('compara el texto tipeado contra la dirección resuelta (sin override) antes de decidir persistir', () => {
    const idx = crearSource.indexOf('const resuelta = pickDireccionTexto({')
    expect(idx).toBeGreaterThan(-1)
    const block = crearSource.slice(idx, idx + 300)
    // No debe pasarse overrideDireccion/overrideBarrio acá — se compara
    // contra la resolución SIN override, si no la comparación sería siempre
    // igual a sí misma.
    expect(block).not.toMatch(/overrideDireccion/)
    expect(block).toMatch(/cliente:\s*\{\s*direccion:\s*cliente\.direccion,\s*barrio:\s*cliente\.barrio\s*\}/)
    expect(block).toMatch(/negocio:\s*negocioParaDireccion/)
  })

  it('el negocio para la resolución se busca vía findNegocioById cuando hay negocioId', () => {
    expect(crearSource).toMatch(/findNegocioById\(input\.negocioId,\s*tx\)/)
  })

  it('solo asigna el snapshot cuando el texto tipeado difiere de la dirección resuelta', () => {
    const idx = crearSource.indexOf('const resuelta = pickDireccionTexto({')
    const ifIdx = crearSource.indexOf('if (', idx)
    const block = crearSource.slice(ifIdx, ifIdx + 300)
    expect(block).toMatch(/\(input\.direccionEntrega \|\| ''\)\s*!==\s*resuelta\.direccion/)
    expect(block).toMatch(/\(input\.barrioEntrega \|\| ''\)\s*!==\s*resuelta\.barrio/)
  })

  it('el snapshot se pasa a Pedido.create', () => {
    const idx = crearSource.indexOf('Pedido.create({')
    const block = crearSource.slice(idx, crearSource.indexOf('})', idx))
    expect(block).toMatch(/direccionEntrega:\s*direccionEntregaSnapshot/)
    expect(block).toMatch(/barrioEntrega:\s*barrioEntregaSnapshot/)
  })

  it('si actualizarCliente corre, el objeto cliente en memoria se actualiza ANTES del snapshot (evita comparar contra el valor viejo)', () => {
    const updateIdx = crearSource.indexOf('await this.clienteRepo.updateDireccion(')
    const snapshotIdx = crearSource.indexOf('// 3b. Snapshot')
    const mutationIdx = crearSource.indexOf('cliente.direccion = input.actualizarCliente.direccion')
    expect(updateIdx).toBeGreaterThan(-1)
    expect(snapshotIdx).toBeGreaterThan(-1)
    expect(mutationIdx).toBeGreaterThan(updateIdx)
    expect(mutationIdx).toBeLessThan(snapshotIdx)
  })
})

// ActualizarPedidoUseCase: su contrato de snapshot (preservar, recalcular solo si
// viene explícito, limpiar si coincide, edición parcial, cerrado) se verifica por
// COMPORTAMIENTO en ActualizarPedidoUseCase.test.ts y contra Postgres en
// integration/pedido-put-contrato.test.ts — ya no por regex sobre el código fuente.
