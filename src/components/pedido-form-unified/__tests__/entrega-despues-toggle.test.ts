// @tests ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001 — toggle "entregar después"
// en el form de venta rápida.
//
// Contrato:
// - Gated por NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR: sin el flag, ni el
//   toggle ni el campo `entregado` aparecen (UI vieja intacta).
// - Solo para venta rápida (canal === 'PUNTO') y solo al crear (no en edición).
// - Default = "entregar ahora"; el state arranca en false.
// - Se resetea a false al cambiar el canal a DOMICILIO.
// - En el submit se envía `entregado: false` SOLO cuando flag + PUNTO + toggle;
//   en cualquier otro caso `undefined` (comportamiento histórico).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/components/pedido-form-unified/index.tsx'),
  'utf-8',
)

describe('FIX: toggle "entregar después" — flag-gated, solo venta rápida', () => {
  it('el flag se lee a nivel de módulo desde NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR', () => {
    expect(source).toMatch(
      /const VENTA_RUTA_ENTREGA_POSTERIOR_ON\s*=\s*\n?\s*process\.env\.NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR === 'true'/,
    )
  })

  it('el state arranca en false (entregar ahora por defecto)', () => {
    expect(source).toMatch(/const \[entregarDespues, setEntregarDespues\] = useState\(false\)/)
  })

  it('el bloque de UI está gated por flag + canal PUNTO + no-edición', () => {
    const idx = source.indexOf('data-testid="entrega-despues"')
    expect(idx).toBeGreaterThan(-1)
    const nearby = source.slice(Math.max(0, idx - 900), idx)
    expect(nearby).toMatch(/VENTA_RUTA_ENTREGA_POSTERIOR_ON && canal === 'PUNTO' && !pedidoInicial\?\.id/)
  })

  it('se resetea a false al cambiar de canal a algo que no es PUNTO', () => {
    const idx = source.indexOf('const handleToggleCanal')
    const block = source.slice(idx, source.indexOf('handleSubmit', idx))
    expect(block).toMatch(/if \(nuevoCanal !== 'PUNTO'\) setEntregarDespues\(false\)/)
  })

  it('en el submit, `entregado: false` solo con flag + PUNTO + toggle; si no, undefined', () => {
    const idx = source.indexOf('const data: PedidoUnifiedData = {')
    const block = source.slice(idx, source.indexOf('await onSubmit(data)', idx))
    expect(block).toMatch(
      /entregado:\s*\n?\s*VENTA_RUTA_ENTREGA_POSTERIOR_ON && canal === 'PUNTO' && entregarDespues\s*\n?\s*\?\s*false\s*\n?\s*:\s*undefined/,
    )
  })

  it('PedidoUnifiedData declara `entregado?: boolean`', () => {
    expect(source).toMatch(/entregado\?:\s*boolean/)
  })
})
