import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Anti-regresión: el patrón de consumo (frecuenciaSugerida/productosSugeridos,
 * calculado en GET /api/clientes/[id]) se muestra siempre como banner de solo
 * lectura, pero aplicar cantidades es SIEMPRE una acción explícita del
 * usuario ("Aplicar sugerencia"). Nunca debe auto-rellenar `cantidades` — este
 * es un ERP con dinero y despachos reales; pre-llenar cantidades sin que el
 * operador lo pida puede terminar en un pedido/cobro que el cliente no pidió.
 */
describe('pedido-form-unified: patrón de consumo es opt-in', () => {
  const sourcePath = resolve(__dirname, '../index.tsx')
  const source = readFileSync(sourcePath, 'utf-8')

  it('el efecto que consume pedidoInicial nunca llama a setCantidades con productosSugeridos', () => {
    const start = source.indexOf('useEffect(() => {\n    if (!pedidoInicial) return')
    const end = source.indexOf('const getPrecioBase', start)
    expect(start).toBeGreaterThan(-1)
    const body = source.slice(start, end)

    // Sí debe poblar el banner (solo lectura)...
    expect(body).toContain('setSugerenciaConsumo(')
    // ...pero NUNCA debe tocar `cantidades` a partir de productosSugeridos.
    // El único setCantidades de este efecto es el de los items del pedido
    // editado/inicial (cantidadesIniciales), no de la sugerencia.
    const setCantidadesCalls = body.match(/setCantidades\(([^)]*)\)/g) || []
    for (const call of setCantidadesCalls) {
      expect(call).not.toMatch(/sugerencia|productosSugeridos/i)
    }
  })

  it('aplicarSugerenciaConsumo (el único call site que aplica la sugerencia) requiere invocación explícita, no corre dentro de un useEffect', () => {
    const start = source.indexOf('const aplicarSugerenciaConsumo')
    const end = source.indexOf('const verPatronConsumo', start)
    expect(start).toBeGreaterThan(-1)
    const body = source.slice(start, end)
    expect(body).toContain('applyCantidadesUpdate(')
    expect(body).toContain('setSugerenciaAplicada(true)')
  })

  it('el botón "Aplicar sugerencia" es un <button type="button"> explícito, no se auto-dispara', () => {
    const idx = source.indexOf('aplicar-sugerencia-btn')
    expect(idx).toBeGreaterThan(-1)
    const nearby = source.slice(idx - 300, idx + 300)
    expect(nearby).toContain('onClick={aplicarSugerenciaConsumo}')
    expect(nearby).toContain("type=\"button\"")
  })

  it('el botón "Aplicar sugerencia" se deshabilita hasta que productosConfig cargue', () => {
    const idx = source.indexOf('aplicar-sugerencia-btn')
    const nearby = source.slice(idx, idx + 400)
    expect(nearby).toContain('disabled={productosConfig.length === 0}')
  })

  it('la revalidación silenciosa de dirección/barrio solo corre para pedido NUEVO (no en edición)', () => {
    const idx = source.indexOf('fetchClienteDetailFresh<{ id: string; telefono: string')
    expect(idx).toBeGreaterThan(-1)
    const before = source.slice(Math.max(0, idx - 400), idx)
    expect(before).toContain('!pedidoInicial.id')
  })

  it('handleSelectCliente y "quitar cliente" resetean el estado de sugerencia al cambiar/quitar cliente', () => {
    const selectStart = source.indexOf('const handleSelectCliente')
    const selectEnd = source.indexOf('const handleCrearNuevo', selectStart)
    const selectBody = source.slice(selectStart, selectEnd)
    expect(selectBody).toContain('setSugerenciaConsumo(null)')

    const quitarIdx = source.indexOf('title="Quitar cliente"')
    expect(quitarIdx).toBeGreaterThan(-1)
    const before = source.slice(Math.max(0, quitarIdx - 600), quitarIdx)
    expect(before).toContain('setSugerenciaConsumo(null)')
  })

  it('la selección manual de cliente (verPatronConsumo) no se dispara automáticamente: requiere clic', () => {
    const idx = source.indexOf('const verPatronConsumo')
    expect(idx).toBeGreaterThan(-1)
    // No debe existir un useEffect que llame a verPatronConsumo automáticamente.
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*verPatronConsumo/)
    const buttonIdx = source.indexOf('onClick={verPatronConsumo}')
    expect(buttonIdx).toBeGreaterThan(-1)
  })
})
