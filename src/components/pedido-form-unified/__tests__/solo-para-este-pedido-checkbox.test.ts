// @tests Regresión: el checkbox "solo para este pedido" debe:
// - Existir, desmarcado por defecto (preserva el comportamiento actual).
// - Solo mostrarse cuando NO hay negocio seleccionado (con negocio, la
//   persistencia ya está bloqueada incondicionalmente, el checkbox sería
//   ruido sin efecto).
// - Resetearse en cada punto donde se resetea el resto del estado de
//   dirección (quitar cliente, cambiar cliente, init de edición).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/components/pedido-form-unified/index.tsx'),
  'utf-8',
)
// Fase 3b: el checkbox se extrajo a PedidoContextPanel — mismo JSX exacto
// (mismo nombre de prop, sin renombrar), solo cambió de archivo.
const contextPanelSource = readFileSync(
  join(process.cwd(), 'src/components/pedido-form-unified/pedido-context-panel.tsx'),
  'utf-8',
)

describe('FIX: checkbox "solo para este pedido" — default false, visible solo sin negocio', () => {
  it('el state arranca en false', () => {
    expect(source).toMatch(/const \[soloParaEstePedido, setSoloParaEstePedido\] = useState\(false\)/)
  })

  it('se pasa a resolveActualizarCliente en el submit', () => {
    const idx = source.indexOf('resolveActualizarCliente({')
    const block = source.slice(idx, source.indexOf('})', idx))
    expect(block).toMatch(/soloParaEstePedido,/)
  })

  it('el checkbox en el JSX solo se renderiza cuando !negocioSeleccionado', () => {
    const idx = contextPanelSource.indexOf('checked={soloParaEstePedido}')
    expect(idx).toBeGreaterThan(-1)
    const nearby = contextPanelSource.slice(Math.max(0, idx - 400), idx + 100)
    expect(nearby).toMatch(/!negocioSeleccionado\s*&&/)
    expect(nearby).toMatch(/type="checkbox"/)
  })

  it('se resetea al quitar el cliente seleccionado (botón "Quitar cliente")', () => {
    // Hay dos setClienteSeleccionado(null) en el archivo (handleCrearNuevo y
    // el botón "Quitar cliente") — se ancla en el bloque único del botón,
    // identificado por setEditDireccion(''), que solo aparece ahí.
    const idx = source.indexOf("setEditDireccion('')")
    const block = source.slice(Math.max(0, idx - 400), idx + 200)
    expect(block).toMatch(/setClienteSeleccionado\(null\)/)
    expect(block).toMatch(/setSoloParaEstePedido\(false\)/)
  })

  it('se resetea al seleccionar un cliente nuevo', () => {
    const idx = source.indexOf('const handleSelectCliente')
    const block = source.slice(idx, source.indexOf('handleCrearNuevo', idx))
    expect(block).toMatch(/setSoloParaEstePedido\(false\)/)
  })

  it('se resetea al inicializar desde pedidoInicial (modo edición)', () => {
    const idx = source.indexOf('if (!pedidoInicial) return')
    const block = source.slice(idx, idx + 200)
    expect(block).toMatch(/setSoloParaEstePedido\(false\)/)
  })
})
