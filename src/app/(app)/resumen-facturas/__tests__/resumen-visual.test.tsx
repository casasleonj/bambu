// @tests FacturaCard / ResumenHero — resumen consolidado: el documento que se ve es el que recibe el cliente (#977)
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FacturaCard, ResumenHero, type FacturaVisual } from '../resumen-visual'

// Intl usa espacio de no separación entre «$» y la cifra.
const plano = (t: string | null): string => (t ?? '').replace(/\s/g, ' ')

const base: FacturaVisual = {
  id: 'f1',
  numero: 'FAC-00108',
  fechaTxt: '06 nov 2026',
  total: 85_000,
  montoPagado: 40_000,
  debe: 45_000,
  estado: 'PARCIAL',
  items: [
    { producto: 'PACA_AGUA', etiqueta: 'Paca Agua', cantidad: 5, cantPedida: 5, precio: 6_000, subtotal: 30_000 },
    { producto: 'BOLSA_HIELO', etiqueta: 'Bolsa Hielo', cantidad: 8, cantPedida: 11, precio: 5_000, subtotal: 40_000 },
  ],
  pendientes: [{ producto: 'BOLSA_HIELO', etiqueta: 'Bolsa Hielo', cantidad: 3 }],
  pendienteMonto: 15_000,
  otrosAjustes: 0,
  abonos: [{ fechaTxt: '08/11/2026', monto: 40_000 }],
}

describe('FacturaCard', () => {
  it('muestra, junto al número, lo que se llevó: cantidad × producto, precio unitario y subtotal', () => {
    render(<FacturaCard factura={base} />)
    expect(screen.getByText('FAC-00108')).toBeTruthy()
    const paca = screen.getByTestId('resumen-item-FAC-00108-PACA_AGUA')
    expect(paca.textContent).toContain('5 ×')
    expect(paca.textContent).toContain('Paca Agua')
    expect(paca.textContent).toContain('6.000')
    expect(paca.textContent).toContain('30.000')
  })

  it('muestra solo la cantidad ENTREGADA y avisa lo que falta entregar sin cobrarlo como línea', () => {
    render(<FacturaCard factura={base} />)
    const hielo = screen.getByTestId('resumen-item-FAC-00108-BOLSA_HIELO')
    expect(hielo.textContent).toContain('8 ×')
    expect(hielo.textContent).not.toContain('11')
    expect(screen.getByTestId('resumen-pendiente-FAC-00108').textContent).toContain('Falta entregar: 3 × Bolsa Hielo')
    expect(screen.getByTestId('resumen-pendiente-FAC-00108').textContent).toContain('15.000')
    expect(screen.getByTestId('resumen-pendiente-FAC-00108').textContent).toContain('aún no se cobra')
  })

  it('estado en texto y porcentaje en pago parcial; los productos siempre visibles (sin desplegable)', () => {
    render(<FacturaCard factura={base} />)
    expect(screen.getByText('Pago parcial · 47%')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('muestra «Otros ajustes» solo cuando la suma de productos no cuadra', () => {
    const { rerender } = render(<FacturaCard factura={base} />)
    expect(screen.queryByTestId('resumen-otros-ajustes')).toBeNull()
    rerender(<FacturaCard factura={{ ...base, otrosAjustes: 5_000 }} />)
    expect(screen.getByTestId('resumen-otros-ajustes')).toBeTruthy()
  })

  it('abonos con fecha cuando cuadran y solo el total abonado cuando no', () => {
    const { rerender } = render(<FacturaCard factura={base} />)
    expect(plano(screen.getByTestId('resumen-abonos-FAC-00108').textContent)).toBe('Abonos: $ 40.000 el 08/11/2026.')
    rerender(<FacturaCard factura={{ ...base, abonos: null }} />)
    expect(plano(screen.getByTestId('resumen-abonos-FAC-00108').textContent)).toBe('Total abonado: $ 40.000.')
  })

  it('una anulada se ve «no suma», sin saldo ni abonos', () => {
    render(<FacturaCard factura={{ ...base, estado: 'ANULADA', montoPagado: 20_000, debe: 0 }} />)
    expect(screen.getByText('Anulada · no suma')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.queryByTestId('resumen-abonos-FAC-00108')).toBeNull()
  })

  it('sin productos entregados lo dice en vez de mostrar una tabla vacía', () => {
    render(<FacturaCard factura={{ ...base, items: [], pendientes: [] }} />)
    expect(screen.getByText('Esta factura no tiene productos entregados registrados.')).toBeTruthy()
  })
})

describe('ResumenHero', () => {
  it('destaca la cifra principal con los datos de lo consultado', () => {
    render(
      <ResumenHero
        etiqueta="Saldo que se debe"
        monto={105_000}
        tono="debe"
        nota="Suma de lo que falta por pagar en las facturas por cobrar."
        datos={[{ etiqueta: 'Facturas por cobrar', texto: '2' }, { etiqueta: 'La más antigua', texto: '03 abr 2026' }]}
      />,
    )
    expect(screen.getByTestId('resumen-hero-monto').textContent).toContain('105.000')
    expect(screen.getByText('Facturas por cobrar')).toBeTruthy()
    expect(screen.getByText('03 abr 2026')).toBeTruthy()
  })

  it('no muestra la barra pagado/facturado que mezclaba facturas de otro estado', () => {
    render(<ResumenHero etiqueta="Saldo que se debe" monto={0} tono="alDia" nota="Todo al día. No hay saldo pendiente." datos={[]} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText(/Pagado/)).toBeNull()
    expect(screen.getByText('Todo al día. No hay saldo pendiente.')).toBeTruthy()
  })
})
