// @tests #446 (épica #447, Fase C) — cierre V2: «cambios» de solo lectura = Σ sustituciones.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CambiosRegistrados } from '../cambios-registrados'
import { cambiosPorProducto, destinoDeCambio, type SustitucionCierre } from '../cierre-logic'

const sust = (over: Partial<SustitucionCierre> & { producto?: string; cantidad?: number } = {}): SustitucionCierre => ({
  id: over.id ?? 's1',
  pedidoId: over.pedidoId ?? null,
  clienteId: over.clienteId ?? null,
  movimientoEntrega: { producto: over.producto ?? 'PACA_AGUA', cantidad: over.cantidad ?? 1 },
  movimientoRecepcion: over.movimientoRecepcion ?? null,
  cliente: over.cliente ?? null,
  pedido: over.pedido ?? null,
})

describe('cambiosPorProducto / destinoDeCambio', () => {
  it('suma por producto', () => {
    expect(cambiosPorProducto([sust({ cantidad: 2 }), sust({ id: 's2', cantidad: 1 }), sust({ id: 's3', producto: 'BOTELLON', cantidad: 4 })]))
      .toEqual({ PACA_AGUA: 3, BOTELLON: 4 })
    expect(cambiosPorProducto([])).toEqual({})
  })
  it('destino en palabras', () => {
    expect(destinoDeCambio(sust({ pedido: { numero: 12 } }))).toBe('Pedido #12')
    expect(destinoDeCambio(sust({ cliente: { nombre: 'Ana', apellido: 'Ruiz' } }))).toBe('Ana Ruiz (sin pedido en la ruta)')
    expect(destinoDeCambio(sust())).toBe('Sin destino registrado')
  })
})

describe('CambiosRegistrados', () => {
  it('lista los cambios con destino y motivo, y enlaza a registrar', () => {
    render(
      <CambiosRegistrados
        embarqueId="e1"
        cargando={false}
        error={false}
        onReintentar={() => undefined}
        sustituciones={[sust({ cantidad: 2, pedido: { numero: 7 }, movimientoRecepcion: { metadata: { motivoDetalle: 'botella rota' } } })]}
      />,
    )
    expect(screen.getByTestId('cambio-item').textContent).toContain('Pedido #7')
    expect(screen.getByTestId('cambio-item').textContent).toContain('botella rota')
    expect(screen.getByTestId('cambios-registrar-link').getAttribute('href')).toBe('/embarques/e1')
  })
  it('vacío: dice que no hubo cambios', () => {
    render(<CambiosRegistrados embarqueId="e1" cargando={false} error={false} onReintentar={() => undefined} sustituciones={[]} />)
    expect(screen.getByTestId('cambios-vacio')).toBeTruthy()
  })
  it('error: ofrece reintentar', () => {
    const onReintentar = vi.fn()
    render(<CambiosRegistrados embarqueId="e1" cargando={false} error onReintentar={onReintentar} sustituciones={[]} />)
    fireEvent.click(screen.getByText('Reintentar'))
    expect(onReintentar).toHaveBeenCalled()
  })
})
