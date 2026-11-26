// #1029 F1: pruebas de caracterización (RED esperado hasta F2).
// No alteran datos, cierres, producción oficial ni UI.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CierreStockBlock from '../cierre-stock-block'

const base = {
  label: 'Stock Agua',
  icon: <span />,
  ini: 100,
  prod: 50,
  vend: 30,
  perdidas: 1,
  hayProduccion: true,
}

describe('#1029 F1-A: signo y conteo tras producción registrada', () => {
  it.each([
    { fin: 100, diferencia: -19 },
    { fin: 138, diferencia: 19 },
    { fin: 119, diferencia: 0 },
  ])('muestra diferencia $diferencia cuando conteo=$fin', ({ fin, diferencia }) => {
    render(<CierreStockBlock {...base} fin={fin} />)
    if (diferencia === 0) {
      expect(screen.getByText('Cuadrado')).toBeInTheDocument()
    } else {
      expect(screen.getByText('No cuadra')).toBeInTheDocument()
      expect(screen.getByText(new RegExp(`Diferencia: ${diferencia > 0 ? '\\+' : ''}${diferencia}`))).toBeInTheDocument()
    }
  })

  it('permite un conteo provisional después de registrar producción, sin guardarla', () => {
    const onFinChange = vi.fn()
    render(<CierreStockBlock {...base} fin={119} onFinChange={onFinChange} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '130' } })
    expect(onFinChange).toHaveBeenCalledWith(130)
  })
})
