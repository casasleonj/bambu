// @tests #645 — bloque de stock del cierre: Inicial + Producido − Vendido − Pérdidas = Esperado; sin campos manuales de
// inicial/producción; el conteo final se digita solo si el día no tiene producción registrada.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CierreStockBlock from '../cierre-stock-block'

const base = { label: 'Stock Agua', icon: <span />, ini: 40, prod: 60, vend: 25, perdidas: 2, fin: 73 }

describe('CierreStockBlock (#645)', () => {
  it('calcula el esperado con las pérdidas y marca «Cuadrado»', () => {
    render(<CierreStockBlock {...base} hayProduccion />)
    expect(screen.getByText('Cuadrado')).toBeInTheDocument()
    expect(screen.getByText('73', { selector: 'span.font-bold' })).toBeInTheDocument()
  })
  it('marca «No cuadra» con la diferencia', () => {
    render(<CierreStockBlock {...base} fin={70} hayProduccion />)
    expect(screen.getByText('No cuadra')).toBeInTheDocument()
    expect(screen.getByText(/Diferencia: -3/)).toBeInTheDocument()
  })
  it('con producción registrada el conteo final es de solo lectura y no hay campos manuales de inicial ni producción', () => {
    render(<CierreStockBlock {...base} hayProduccion />)
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByText('Stock Inicial')).toBeNull()
    expect(screen.queryByText('Producción hoy')).toBeNull()
  })
  it('sin producción avisa que falta y deja digitar el conteo final', () => {
    const onFin = vi.fn()
    render(<CierreStockBlock {...base} prod={0} perdidas={0} fin={0} hayProduccion={false} onFinChange={onFin} />)
    expect(screen.getByTestId('stock-falta-produccion')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '15' } })
    expect(onFin).toHaveBeenCalledWith(15)
  })
  it('«ese día no se produjo» quita el aviso de falta', () => {
    render(<CierreStockBlock {...base} prod={0} perdidas={0} fin={15} hayProduccion={false} sinProduccion onFinChange={vi.fn()} />)
    expect(screen.queryByTestId('stock-falta-produccion')).toBeNull()
    expect(screen.getByText('Cuadrado')).toBeInTheDocument()
  })
})
