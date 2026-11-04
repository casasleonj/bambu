// @tests #601 — «¿Cuánto efectivo debe haber en la caja?»
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import CierreEfectivoEsperado, { efectivoEsperadoDelCierre } from '../cierre-efectivo-esperado'

describe('CierreEfectivoEsperado', () => {
  it('suma base y efectivo, resta gastos y comisiones, y no cuenta lo digital (ejemplo de la maqueta)', () => {
    render(<CierreEfectivoEsperado baseDia={50000} efectivoPagos={575100} cobroCarteraEfectivo={0}
      totalGastos={215400} comisiones={258000} salarios={0} pagosDigitales={240200} />)
    const bloque = screen.getByTestId('cierre-efectivo-esperado')
    expect(within(bloque).getByText('Efectivo que debe haber en caja').closest('div')).toHaveTextContent(/\$\s*151\.700/)
    expect(screen.getByTestId('cierre-pagos-digitales')).toHaveTextContent(/\$\s*240\.200/)
    expect(within(bloque).queryByText('− Salarios')).not.toBeInTheDocument()
  })

  it('muestra salarios y abonos en efectivo solo cuando existen, y oculta el aviso digital si no hubo', () => {
    render(<CierreEfectivoEsperado baseDia={10000} efectivoPagos={5000} cobroCarteraEfectivo={2000}
      totalGastos={1000} comisiones={500} salarios={300} pagosDigitales={0} />)
    expect(screen.getByText('+ Abonos a deudas en efectivo')).toBeInTheDocument()
    expect(screen.getByText('− Salarios')).toBeInTheDocument()
    expect(screen.queryByTestId('cierre-pagos-digitales')).not.toBeInTheDocument()
    expect(efectivoEsperadoDelCierre({ baseDia: 10000, efectivoPagos: 5000, cobroCarteraEfectivo: 2000, totalGastos: 1000, comisiones: 500, salarios: 300 })).toBe(15200)
  })
})
