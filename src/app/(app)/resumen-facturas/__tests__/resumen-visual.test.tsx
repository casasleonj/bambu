// @tests FacturaCard / ResumenHero — resumen consolidado visual (#867)
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FacturaCard, ResumenHero, type FacturaVisual } from '../resumen-visual'

const base: FacturaVisual = {
  id: 'f1',
  numero: 'FAC-00108',
  fechaTxt: '06 nov 2026',
  total: 85_000,
  montoPagado: 40_000,
  saldo: 45_000,
  estado: 'PARCIAL',
  items: [
    { producto: 'PACA_AGUA', etiqueta: 'Paca Agua', cantidad: 5, cantEntrega: 5, precio: 6_000, subtotal: 30_000 },
    { producto: 'BOLSA_HIELO', etiqueta: 'Bolsa Hielo', cantidad: 11, cantEntrega: 8, precio: 5_000, subtotal: 55_000 },
  ],
  otrosAjustes: 0,
}

describe('FacturaCard', () => {
  it('muestra el estado en texto y oculta los productos hasta abrir', () => {
    render(<FacturaCard factura={base} />)
    expect(screen.getByText('Parcial · debe')).toBeTruthy()
    expect(screen.queryByText('Paca Agua')).toBeNull()
    const boton = screen.getByRole('button')
    expect(boton.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(boton)
    expect(boton.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Paca Agua')).toBeTruthy()
    expect(screen.getByText('Bolsa Hielo')).toBeTruthy()
    expect(screen.getByText('× 11')).toBeTruthy()
  })

  it('avisa cuando se entregó menos de lo facturado', () => {
    render(<FacturaCard factura={base} abiertaInicial />)
    expect(screen.getByText('entregadas 8')).toBeTruthy()
  })

  it('muestra «Otros ajustes» solo cuando la suma de productos no cuadra', () => {
    const { rerender } = render(<FacturaCard factura={base} abiertaInicial />)
    expect(screen.queryByTestId('resumen-otros-ajustes')).toBeNull()
    rerender(<FacturaCard factura={{ ...base, otrosAjustes: 5_000 }} abiertaInicial />)
    expect(screen.getByTestId('resumen-otros-ajustes')).toBeTruthy()
  })

  it('una anulada se ve «no suma», sin saldo ni porcentaje pagado', () => {
    render(<FacturaCard factura={{ ...base, estado: 'ANULADA', montoPagado: 20_000, saldo: 0 }} abiertaInicial />)
    expect(screen.getByText('Anulada · no suma')).toBeTruthy()
    expect(screen.getByText('No aplica')).toBeTruthy()
    expect(screen.getByText('Anulada: no suma a ventas ni a la deuda.')).toBeTruthy()
    expect(screen.queryByText(/% pagado/)).toBeNull()
  })

  it('sin productos registrados lo dice en vez de mostrar una tabla vacía', () => {
    render(<FacturaCard factura={{ ...base, items: [] }} abiertaInicial />)
    expect(screen.getByText('Esta factura no tiene productos registrados.')).toBeTruthy()
  })
})

describe('ResumenHero', () => {
  it('destaca el saldo y nombra las facturas que lo componen', () => {
    render(
      <ResumenHero
        soloAnuladas={false}
        totales={{ total: 265_000, totalPagado: 160_000, saldo: 105_000, count: 3 }}
        anuladasTotal={50_000}
        conSaldo={[{ numero: 'FAC-00108', saldo: 45_000 }, { numero: 'FAC-00112', saldo: 60_000 }]}
      />,
    )
    expect(screen.getByTestId('resumen-hero-monto').textContent).toContain('105.000')
    expect(screen.getByText(/2 facturas con saldo: FAC-00108/)).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Pagado 60 por ciento' })).toBeTruthy()
  })

  it('con todo pagado dice que está al día', () => {
    render(
      <ResumenHero
        soloAnuladas={false}
        totales={{ total: 100_000, totalPagado: 100_000, saldo: 0, count: 1 }}
        anuladasTotal={0}
        conSaldo={[]}
      />,
    )
    expect(screen.getByText('Todo al día. No hay saldo pendiente.')).toBeTruthy()
  })

  it('en la pestaña Anuladas muestra el importe histórico y no una barra de cobranza', () => {
    render(
      <ResumenHero
        soloAnuladas
        totales={{ total: 0, totalPagado: 0, saldo: 0, count: 0 }}
        anuladasTotal={50_000}
        conSaldo={[]}
      />,
    )
    expect(screen.getByText('Anuladas (no suman)')).toBeTruthy()
    expect(screen.getByTestId('resumen-hero-monto').textContent).toContain('50.000')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
