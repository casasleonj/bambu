import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AvisoUnidadesAproximadas, { unidadesAproximadasDe } from '../aviso-unidades-aproximadas'

const p = (numero: number, agua: number, hielo: number) => ({
  pedidoId: `id${numero}`,
  numero,
  fechaCreacion: '2026-11-03T14:00:00.000Z',
  unidades: { agua, hielo, botellon: 0, bolsaAgua: 0, bolsaHielo: 0 },
})

describe('AvisoUnidadesAproximadas (#650 2b)', () => {
  it('no muestra nada sin aproximados', () => {
    const { container } = render(<AvisoUnidadesAproximadas aproximadas={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('lista los pedidos y aclara que no bloquea', () => {
    render(<AvisoUnidadesAproximadas aproximadas={[p(619, 0, 12), p(700, 8, 0)]} />)
    expect(screen.getByText(/Pedido #619: 12 de hielo/)).toBeInTheDocument()
    expect(screen.getByText(/Pedido #700: 8 de agua/)).toBeInTheDocument()
    expect(screen.getByText(/No bloquea el cierre/)).toBeInTheDocument()
  })
  it('suma por producto para la línea de cada bloque', () => {
    const l = [p(1, 3, 2), p(2, 5, 0)]
    expect(unidadesAproximadasDe(l, 'agua')).toBe(8)
    expect(unidadesAproximadasDe(l, 'hielo')).toBe(2)
    expect(unidadesAproximadasDe(undefined, 'agua')).toBe(0)
  })
  it('estado de error ofrece reintentar', () => {
    const onReintentar = vi.fn()
    render(<AvisoUnidadesAproximadas error onReintentar={onReintentar} />)
    fireEvent.click(screen.getByText('Reintentar'))
    expect(onReintentar).toHaveBeenCalledOnce()
  })
})
