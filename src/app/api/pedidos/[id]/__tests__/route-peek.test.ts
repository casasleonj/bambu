// @tests Fase 4b del Pedido Hub — GET /api/pedidos/[id] extendido con los datos
// que la capa 2 del peek necesita (blueprint §9.2). Aditivo, solo lectura.
// Guardrail estático sobre el fuente (la ruta ya está cubierta por E2E y por
// los tests de PUT; acá solo verificamos el shape del GET y que no baja guards).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(process.cwd(), 'src/app/api/pedidos/[id]/route.ts'), 'utf-8')
const getBlock = src.slice(
  src.indexOf('export async function GET'),
  src.indexOf('export async function PUT'),
)

describe('GET /api/pedidos/[id] — peek (Fase 4b)', () => {
  it('el GET incluye pendienteN2 / embarqueResumen / pedidosVinculados / casosAbiertos / entregaResumen', () => {
    expect(getBlock).toMatch(/pendienteN2/)
    expect(getBlock).toMatch(/embarqueResumen/)
    expect(getBlock).toMatch(/pedidosVinculados/)
    expect(getBlock).toMatch(/casosAbiertos/)
    expect(getBlock).toMatch(/entregaResumen/)
  })

  it('entregaResumen (Fase 7-ii) es null salvo estadoEntrega ENTREGADO, y no hace queries nuevas', () => {
    expect(getBlock).toMatch(/estadoEntrega === 'ENTREGADO'/)
    // los campos vienen del selfRow existente, no de un findUnique nuevo
    expect(getBlock).toMatch(/select:\s*\{\s*pedidoOrigenId:\s*true,\s*estadoEntrega:\s*true,\s*fechaEntrega:\s*true,\s*fotoEntrega:\s*true,\s*gpsLat:\s*true,\s*gpsLng:\s*true\s*\}/)
  })

  it('sigue exigiendo requireOwnership (no baja el guard)', () => {
    expect(getBlock).toMatch(/requireOwnership\('pedido'/)
  })

  it('los datos nuevos son de LECTURA — sin use cases de escritura ni $transaction en el GET', () => {
    expect(getBlock).not.toMatch(/\$transaction/)
    expect(getBlock).not.toMatch(/actualizarPedidoUseCase|anularPedidoUseCase|cancelarPedidoUseCase/)
    expect(getBlock).not.toMatch(/withAdvisoryLock/)
  })

  it('pendienteN2 se lee de ObligacionPendiente por pedidoId', () => {
    expect(getBlock).toMatch(/obligacionPendiente\.findUnique/)
    expect(getBlock).toMatch(/where:\s*\{\s*pedidoId/)
  })

  it('casosAbiertos filtra por status ABIERTO/EN_PROCESO', () => {
    expect(getBlock).toMatch(/caso\.findMany/)
    expect(getBlock).toMatch(/status:\s*\{\s*in:\s*\[\s*['"]ABIERTO['"]/)
  })
})
