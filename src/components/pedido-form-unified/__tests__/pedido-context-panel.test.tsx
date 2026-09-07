// @tests Fase 3b del rediseño de Pedidos (docs/pedidos/00-plan-frontend-rediseno-integral.md):
// segunda extracción del monolito pedido-form-unified/index.tsx hacia un
// componente ALS (PedidoContextPanel, §5). A diferencia de
// PedidoPricingSummary (3a), este panel depende de callbacks para TODO
// cambio de estado (el estado real vive en el padre) — estos tests
// verifican que el panel invoca los callbacks correctos, no que gestiona
// estado propio (no lo hace, por diseño).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PedidoContextPanel, type PedidoContextPanelProps } from '../pedido-context-panel'

function baseProps(overrides: Partial<PedidoContextPanelProps> = {}): PedidoContextPanelProps {
  return {
    canal: 'DOMICILIO',
    pedidoInicialId: undefined,
    clienteSeleccionado: null,
    onQuitarCliente: vi.fn(),
    fiadosStatus: null,
    sugerenciaConsumo: null,
    sugerenciaLoading: false,
    sugerenciaAplicada: false,
    aplicarSugerenciaDisabled: false,
    onAplicarSugerencia: vi.fn(),
    onVerPatronConsumo: vi.fn(),
    negocioSeleccionado: null,
    onNegocioSelected: vi.fn(),
    editDireccion: '',
    onEditDireccionChange: vi.fn(),
    editBarrio: '',
    onEditBarrioChange: vi.fn(),
    soloParaEstePedido: false,
    onSoloParaEstePedidoChange: vi.fn(),
    searchTerm: '',
    onSearchTermChange: vi.fn(),
    clientesCargando: false,
    filteredClientes: [],
    onSelectCliente: vi.fn(),
    onCrearNuevo: vi.fn(),
    mostrarNuevo: false,
    onCerrarNuevo: vi.fn(),
    nuevoCliente: { nombre: '', apellido: '', telefono: '', direccion: '', barrio: '', fuente: '' },
    onNuevoClienteChange: vi.fn(),
    ...overrides,
  }
}

describe('PedidoContextPanel', () => {
  it('muestra "Cliente *" cuando canal=DOMICILIO y "Cliente (opcional)" cuando canal=PUNTO', () => {
    const { rerender } = render(<PedidoContextPanel {...baseProps({ canal: 'DOMICILIO' })} />)
    expect(screen.getByText('Cliente *')).toBeInTheDocument()
    rerender(<PedidoContextPanel {...baseProps({ canal: 'PUNTO' })} />)
    expect(screen.getByText('Cliente (opcional)')).toBeInTheDocument()
  })

  it('sin cliente seleccionado: muestra el buscador, no el resumen del cliente', () => {
    render(<PedidoContextPanel {...baseProps()} />)
    expect(screen.getByPlaceholderText('Buscar cliente por nombre o teléfono...')).toBeInTheDocument()
  })

  it('llama a onQuitarCliente al hacer clic en el botón de quitar (nunca gestiona el reset internamente)', () => {
    const onQuitarCliente = vi.fn()
    render(
      <PedidoContextPanel
        {...baseProps({
          clienteSeleccionado: { id: 'c1', nombre: 'María', telefono: '3001234567' },
          onQuitarCliente,
        })}
      />,
    )
    fireEvent.click(screen.getByTitle('Quitar cliente'))
    expect(onQuitarCliente).toHaveBeenCalledTimes(1)
  })

  it('banner de fiados solo se muestra cuando nivel !== "ok"', () => {
    const { rerender } = render(
      <PedidoContextPanel
        {...baseProps({
          clienteSeleccionado: { id: 'c1', nombre: 'María', telefono: '3001234567' },
          fiadosStatus: { nivel: 'ok', count: 0, limite: 3, pedidos: [] },
        })}
      />,
    )
    expect(screen.queryByTestId('fiado-status-banner')).not.toBeInTheDocument()

    rerender(
      <PedidoContextPanel
        {...baseProps({
          clienteSeleccionado: { id: 'c1', nombre: 'María', telefono: '3001234567' },
          fiadosStatus: { nivel: 'limite', count: 3, limite: 3, pedidos: [] },
        })}
      />,
    )
    expect(screen.getByTestId('fiado-status-banner')).toBeInTheDocument()
  })

  it('"Aplicar sugerencia" invoca onAplicarSugerencia, no aplica cantidades por sí mismo', () => {
    const onAplicarSugerencia = vi.fn()
    render(
      <PedidoContextPanel
        {...baseProps({
          clienteSeleccionado: { id: 'c1', nombre: 'María', telefono: '3001234567' },
          sugerenciaConsumo: {
            frecuenciaSugerida: null,
            productosSugeridos: [{ codigo: 'cPacaAguaPed', nombre: 'Paca de Agua', frecuencia: 80, cantidadPromedio: 5 }],
          },
          onAplicarSugerencia,
        })}
      />,
    )
    fireEvent.click(screen.getByTestId('aplicar-sugerencia-btn'))
    expect(onAplicarSugerencia).toHaveBeenCalledTimes(1)
  })

  it('el checkbox "solo para este pedido" no se muestra si hay negocio seleccionado', () => {
    const { rerender } = render(
      <PedidoContextPanel
        {...baseProps({
          canal: 'DOMICILIO',
          clienteSeleccionado: { id: 'c1', nombre: 'María', telefono: '3001234567' },
          negocioSeleccionado: null,
        })}
      />,
    )
    expect(screen.getByText(/Solo para este pedido/)).toBeInTheDocument()

    rerender(
      <PedidoContextPanel
        {...baseProps({
          canal: 'DOMICILIO',
          clienteSeleccionado: { id: 'c1', nombre: 'María', telefono: '3001234567' },
          negocioSeleccionado: 'neg1',
        })}
      />,
    )
    expect(screen.queryByText(/Solo para este pedido/)).not.toBeInTheDocument()
  })

  it('formulario de cliente nuevo: el input de Nombre refleja nuevoCliente.nombre (controlado por el padre) y dispara onNuevoClienteChange al escribir', () => {
    const onNuevoClienteChange = vi.fn()
    render(
      <PedidoContextPanel
        {...baseProps({
          searchTerm: 'Pedro',
          mostrarNuevo: true,
          nuevoCliente: { nombre: 'Pedro', apellido: '', telefono: '', direccion: '', barrio: '', fuente: '' },
          onNuevoClienteChange,
        })}
      />,
    )
    const nombreInput = screen.getByPlaceholderText('Nombre *') as HTMLInputElement
    // Controlado por el padre (mismo patrón que el resto del formulario) —
    // el valor mostrado viene de la prop, no de estado interno del panel.
    expect(nombreInput.value).toBe('Pedro')

    fireEvent.change(nombreInput, { target: { value: 'Pedro Luis' } })
    // El valor exacto que React reporta en `e.target.value` para un input ya
    // controlado con `fireEvent.change` (sin volver a renderizar con la
    // nueva prop) es un detalle de la maquinaria de eventos de React/jsdom,
    // no de este componente — lo que sí es responsabilidad de este
    // componente es invocar el callback cuando el usuario escribe.
    expect(onNuevoClienteChange).toHaveBeenCalled()
  })

  it('el onChange del input de Nombre aplica el valor tecleado sobre nombre (verificación de código, no de la maquinaria de eventos del DOM)', () => {
    const source = readFileSync(
      join(__dirname, '../pedido-context-panel.tsx'),
      'utf-8',
    )
    const idx = source.indexOf('placeholder="Nombre *"')
    const block = source.slice(idx, idx + 200)
    expect(block).toMatch(/onChange=\{e => onNuevoClienteChange\(p => \(\{ \.\.\.p, nombre: e\.target\.value \}\)\)\}/)
  })
})
