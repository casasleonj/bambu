import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PedidoExceptionPanel, remanentePorProducto } from '../pedido-exception-panel'

const pedido = (over: Record<string, unknown> = {}) => ({
  id: 'p1', numero: 1, clienteId: 'c1', estadoEntrega: 'NO_ENTREGADO',
  items: [
    { producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 15, precio: 3000, subtotal: 60000 },
    { producto: 'BOTELLON', cantPedido: 2, cantEntrega: 2, precio: 8000, subtotal: 16000 },
  ],
  total: 76000, totalPagado: 0, saldo: 76000,
  ...over,
}) as never

const layer2 = (over: Record<string, unknown> = {}) => ({
  pendienteN2: null, embarqueResumen: null, pedidosVinculados: [], casosAbiertos: [],
  ...over,
}) as never

describe('remanentePorProducto', () => {
  it('devuelve solo los items con remanente > 0', () => {
    const r = remanentePorProducto(pedido())
    expect(r).toEqual([{ producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 15, remanente: 5 }])
  })
})

describe('PedidoExceptionPanel — F5-i (display)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true, accion: 'gestionar', remanente: 5,
        diferencial: { valorHistorico: 15000, valorActual: 15000, diferencial: 0 },
        consecuencia: { pedidoTotalAntes: 76000, pedidoTotalDespues: 76000, pedidoSaldoAntes: 76000, pedidoSaldoDespues: 76000, clienteSaldoFavorAntes: 0, clienteSaldoFavorDespues: 0, tipo: 'sin_ajuste' },
        allowedActions: ['gestionar'], warnings: [],
      }),
    })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sin remanente y sin obligación → no renderiza nada', () => {
    const p = pedido({ items: [{ producto: 'PACA_AGUA', cantPedido: 5, cantEntrega: 5, precio: 3000, subtotal: 15000 }] })
    const { container } = render(<PedidoExceptionPanel pedido={p} layer2={layer2()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('remanente sin obligación → ofrece las 3 opciones de la frontera (P4), no asume ninguna', () => {
    render(
      <PedidoExceptionPanel
        pedido={pedido()} layer2={layer2()}
        onMutado={vi.fn()} onNuevaDemanda={vi.fn()} onVentaLibre={vi.fn()}
      />,
    )
    expect(screen.getByTestId('n2-remanente-PACA_AGUA')).toHaveTextContent('5 paca agua · entregado 15 de 20')
    expect(screen.getByTestId('n2-cta-completar')).toBeInTheDocument()
    expect(screen.getByTestId('n2-cta-nueva-demanda')).toBeInTheDocument()
    expect(screen.getByTestId('n2-cta-venta-libre')).toBeInTheDocument()
    expect(screen.getByTestId('n2-frontera')).toHaveTextContent(/no lo asume/)
  })

  it('"Completar" abre el formulario inline; "Nueva demanda"/"Venta libre" son callbacks', () => {
    const onNuevaDemanda = vi.fn(); const onVentaLibre = vi.fn()
    render(<PedidoExceptionPanel pedido={pedido()} layer2={layer2()} onMutado={vi.fn()} onNuevaDemanda={onNuevaDemanda} onVentaLibre={onVentaLibre} />)
    fireEvent.click(screen.getByTestId('n2-cta-nueva-demanda'))
    fireEvent.click(screen.getByTestId('n2-cta-venta-libre'))
    expect(onNuevaDemanda).toHaveBeenCalledOnce()
    expect(onVentaLibre).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByTestId('n2-cta-completar'))
    expect(screen.getByTestId('completar-pendiente-form')).toBeInTheDocument()
  })

  it('sin onMutado → no muestra el CTA "Completar" (modo display puro)', () => {
    render(<PedidoExceptionPanel pedido={pedido()} layer2={layer2()} onNuevaDemanda={vi.fn()} />)
    expect(screen.queryByTestId('n2-cta-completar')).not.toBeInTheDocument()
    expect(screen.getByTestId('n2-cta-nueva-demanda')).toBeInTheDocument()
  })

  it('pedido CANCELADO con remanente → no ofrece gestión, explica el cierre', () => {
    render(<PedidoExceptionPanel pedido={pedido({ estadoEntrega: 'CANCELADO' })} layer2={layer2()} onMutado={vi.fn()} />)
    expect(screen.queryByTestId('n2-cta-completar')).not.toBeInTheDocument()
    expect(screen.getByTestId('pedido-exception-panel')).toHaveTextContent(/no admite gestión/)
  })

  it('con obligación ABIERTA normal → panel neutro, lista actividades por separado', () => {
    const l2 = layer2({
      pendienteN2: {
        id: 'o1', producto: 'PACA_AGUA', remanente: 5, estado: 'ABIERTA',
        actividades: [
          { id: 'a1', tipo: 'ENTREGA', cantidad: 3, cantidadCumplida: 0, estado: 'ASIGNADA', modo: 'DOMICILIO', embarqueId: null },
          { id: 'a2', tipo: 'ENTREGA', cantidad: 2, cantidadCumplida: 0, estado: 'EN_PROGRESO', modo: 'PUNTO', embarqueId: 'e1' },
        ],
      },
    })
    render(<PedidoExceptionPanel pedido={pedido()} layer2={l2} />)
    expect(screen.getByTestId('n2-naturaleza-normal')).toBeInTheDocument()
    expect(screen.getByTestId('n2-actividad-a1')).toHaveTextContent(/3 paca agua .* domicilio .* asignada/)
    expect(screen.getByTestId('n2-actividad-a2')).toHaveTextContent(/2 paca agua .* punto .* en_progreso/)
  })

  it('con obligación sobre pedido CANCELADO → naturaleza inconsistencia (ámbar + ⚠)', () => {
    const l2 = layer2({ pendienteN2: { id: 'o1', producto: 'PACA_AGUA', remanente: 5, estado: 'ABIERTA', actividades: [] } })
    render(<PedidoExceptionPanel pedido={pedido({ estadoEntrega: 'CANCELADO' })} layer2={l2} />)
    expect(screen.getByTestId('n2-naturaleza-inconsistencia')).toHaveTextContent('⚠')
  })

  it('F5-i NO muta: sin onActividadAccion no muestra botones de actividad', () => {
    const l2 = layer2({
      pendienteN2: { id: 'o1', producto: 'PACA_AGUA', remanente: 5, estado: 'ABIERTA', actividades: [{ id: 'a1', tipo: 'ENTREGA', cantidad: 5, cantidadCumplida: 0, estado: 'ASIGNADA', modo: 'DOMICILIO', embarqueId: null }] },
    })
    render(<PedidoExceptionPanel pedido={pedido()} layer2={l2} />)
    expect(screen.queryByTestId('n2-actividad-a1-liberar')).not.toBeInTheDocument()
  })
})
