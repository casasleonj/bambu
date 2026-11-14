// @tests #601 — «¿Cuánto efectivo debe haber en la caja?»
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import CierreEfectivoEsperado, { efectivoEsperadoDelCierre } from '../cierre-efectivo-esperado'

describe('CierreEfectivoEsperado', () => {
  it('suma base y efectivo, resta gastos y comisiones, y no cuenta lo digital (ejemplo de la maqueta)', () => {
    render(<CierreEfectivoEsperado baseDia={50000} efectivoPagos={575100} cobroCarteraEfectivo={0}
      totalGastos={215400} comisiones={258000} salarios={0} pagosDigitales={240200} />)
    const bloque = screen.getByTestId('cierre-efectivo-esperado')
    expect(within(bloque).getByTestId('efectivo-debe-haber')).toHaveTextContent(/\$\s*151\.700/)
    expect(screen.getByTestId('cierre-pagos-digitales')).toHaveTextContent(/\$\s*240\.200/)
    expect(bloque).not.toHaveTextContent('− Salarios')
  })

  it('muestra salarios y abonos en efectivo solo cuando existen, y oculta el aviso digital si no hubo', () => {
    render(<CierreEfectivoEsperado baseDia={10000} efectivoPagos={5000} cobroCarteraEfectivo={2000}
      totalGastos={1000} comisiones={500} salarios={300} pagosDigitales={0} />)
    expect(screen.getByText(/\+ Abonos en efectivo/)).toBeInTheDocument()
    expect(screen.getByText(/− Salarios/)).toBeInTheDocument()
    expect(screen.queryByTestId('cierre-pagos-digitales')).not.toBeInTheDocument()
    expect(efectivoEsperadoDelCierre({ baseDia: 10000, efectivoPagos: 5000, cobroCarteraEfectivo: 2000, totalGastos: 1000, comisiones: 500, salarios: 300 })).toBe(15200)
  })
})

describe('#646 fichas del cálculo del efectivo', () => {
  it('«Gastos» abre su lista y «Comisiones» lleva a su bloque; las fichas en cero no aparecen', () => {
    render(<CierreEfectivoEsperado baseDia={100000} efectivoPagos={465000} cobroCarteraEfectivo={0}
      totalGastos={40000} comisiones={0} salarios={0} pagosDigitales={0} />)
    expect(screen.getByRole('link', { name: /− Gastos/ }).getAttribute('href')).toBe('#cierre-gastos')
    expect(screen.queryByText(/Comisiones pagadas/)).toBeNull()
    expect(screen.getByTestId('efectivo-debe-haber')).toHaveTextContent(/\$\s*525\.000/)
  })
})

describe('#688 el efectivo inicial es la base de caja del día: el cierre solo la lee', () => {
  const props = { efectivoPagos: 0, cobroCarteraEfectivo: 0, totalGastos: 0, comisiones: 0, salarios: 0, pagosDigitales: 0 }

  it('con base muestra la ficha «Empezó con», el pie con su fuente y ningún campo', () => {
    render(<CierreEfectivoEsperado baseDia={50000} pie={<p data-testid="pie-base">Base de caja de hoy</p>} {...props} />)
    const bloque = screen.getByTestId('cierre-efectivo-esperado')
    expect(bloque).toHaveTextContent(/Empezó con\s*\$\s*50\.000/)
    expect(screen.getByTestId('pie-base')).toBeInTheDocument()
    expect(within(bloque).queryByRole('textbox')).toBeNull()
    expect(screen.queryByLabelText('Efectivo con el que empezó el día')).toBeNull()
  })

  it('sin base no inventa un valor: muestra «—», oculta las fichas y deja el aviso (pie)', () => {
    render(<CierreEfectivoEsperado baseDia={0} sinBase pie={<p data-testid="aviso-falta">Falta la base de caja de hoy</p>} {...props} efectivoPagos={130000} />)
    expect(screen.getByTestId('efectivo-debe-haber')).toHaveTextContent('—')
    expect(screen.getByTestId('cierre-efectivo-esperado')).not.toHaveTextContent('Empezó con')
    expect(screen.getByTestId('cierre-efectivo-esperado')).not.toHaveTextContent('Cobrado en efectivo')
    expect(screen.getByTestId('aviso-falta')).toBeInTheDocument()
  })
})
