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
    const idx = source.indexOf('checked={soloParaEstePedido}')
    const nearby = source.slice(Math.max(0, idx - 400), idx + 100)
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
    const line = source.split('\n').find(l => l.includes('const handleSelectCliente')) || ''
    expect(line).toMatch(/setSoloParaEstePedido\(false\)/)
  })

  it('se resetea al inicializar desde pedidoInicial (modo edición)', () => {
    const idx = source.indexOf('if (!pedidoInicial) return')
    const block = source.slice(idx, idx + 200)
    expect(block).toMatch(/setSoloParaEstePedido\(false\)/)
  })
})
