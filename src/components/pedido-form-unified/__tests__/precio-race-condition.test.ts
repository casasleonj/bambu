// @tests Regresión: race condition entre la resolución async de precios
// (debounce 400ms + fetch a /api/precios/resolver) y el submit del pedido.
//
// Bug: el botón de submit solo se deshabilitaba por submitting/total<=0/
// fiado-límite, nunca por preciosLoading. Además preciosLoading solo se
// activaba DENTRO de resolverPrecios (ya iniciado el fetch), dejando una
// ventana de hasta 400ms de debounce donde el precio mostrado en pantalla
// (y el que se usaba para "Pagar completo") ya estaba desactualizado.
// El servidor recalcula el precio real de forma autoritativa, así que el
// pedido nunca queda "mal guardado" — pero el monto cobrado en efectivo
// (basado en el total stale de la UI) puede no coincidir con el total real
// persistido, generando saldo pendiente o saldo a favor sin aviso.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/components/pedido-form-unified/index.tsx'),
  'utf-8',
)

describe('FIX: preciosLoading cubre la ventana completa de debounce + fetch', () => {
  // El guard vive en applyCantidadesUpdate (extraído para reusarlo también
  // desde "Aplicar sugerencia" de patrón de consumo, ver aplicarSugerenciaConsumo)
  // y handleCantidadChange delega en él — se verifican ambas partes para
  // seguir protegiendo la regresión sin importar cuál de las dos rutas
  // modifique `cantidades`.
  it('applyCantidadesUpdate marca preciosLoading=true ANTES de agendar el debounce', () => {
    const start = source.indexOf('const applyCantidadesUpdate')
    const end = source.indexOf('const handleCantidadChange', start)
    const body = source.slice(start, end)
    expect(body).toMatch(/setPreciosLoading\(true\)/)
    // El setPreciosLoading debe ocurrir antes del setTimeout que dispara resolverPrecios
    const loadingIdx = body.indexOf('setPreciosLoading(true)')
    const timeoutIdx = body.indexOf('resolverTimeoutRef.current = setTimeout')
    expect(loadingIdx).toBeGreaterThan(-1)
    expect(timeoutIdx).toBeGreaterThan(-1)
    expect(loadingIdx).toBeLessThan(timeoutIdx)
  })

  it('handleCantidadChange y aplicarSugerenciaConsumo delegan en applyCantidadesUpdate (no duplican el guard)', () => {
    const handleStart = source.indexOf('const handleCantidadChange')
    const handleEnd = source.indexOf('const aplicarSugerenciaConsumo', handleStart)
    const handleBody = source.slice(handleStart, handleEnd)
    expect(handleBody).toContain('applyCantidadesUpdate(')
    expect(handleBody).not.toMatch(/setPreciosLoading\(true\)/)

    const sugerenciaStart = source.indexOf('const aplicarSugerenciaConsumo')
    const sugerenciaEnd = source.indexOf('const verPatronConsumo', sugerenciaStart)
    const sugerenciaBody = source.slice(sugerenciaStart, sugerenciaEnd)
    expect(sugerenciaBody).toContain('applyCantidadesUpdate(')
    expect(sugerenciaBody).not.toMatch(/setPreciosLoading\(true\)/)
  })

  it('resolverPrecios apaga preciosLoading incluso en el early-return de items vacíos', () => {
    const start = source.indexOf('const resolverPrecios = useCallback')
    const earlyReturnIdx = source.indexOf('if (items.length === 0) {', start)
    const blockEnd = source.indexOf('setPreciosLoading(true)', earlyReturnIdx)
    const earlyReturnBlock = source.slice(earlyReturnIdx, blockEnd)
    expect(earlyReturnBlock).toMatch(/setPreciosLoading\(false\)/)
  })
})

describe('FIX: el submit nunca corre mientras el precio real todavía se resuelve', () => {
  it('handleSubmit sale temprano si preciosLoading es true', () => {
    const start = source.indexOf('const handleSubmit = async')
    const end = source.indexOf('if (total <= 0)', start)
    const guardBlock = source.slice(start, end)
    expect(guardBlock).toMatch(/if\s*\(preciosLoading\)\s*\{/)
  })

  it('el botón de submit se deshabilita mientras preciosLoading es true', () => {
    const idx = source.indexOf('data-testid="submit-pedido"')
    expect(idx).toBeGreaterThan(-1)
    const disabledIdx = source.indexOf('disabled={', idx)
    const disabledEnd = source.indexOf('}', disabledIdx)
    const disabledExpr = source.slice(disabledIdx, disabledEnd)
    expect(disabledExpr).toContain('preciosLoading')
  })

  it('"Pagar completo" se deshabilita mientras preciosLoading es true (evita capturar un total stale)', () => {
    const idx = source.indexOf('onClick={pagarCompleto}')
    expect(idx).toBeGreaterThan(-1)
    const nearby = source.slice(idx, idx + 200)
    expect(nearby).toMatch(/disabled=\{preciosLoading\}/)
  })
})
