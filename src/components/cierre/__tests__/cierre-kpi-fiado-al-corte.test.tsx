// @tests #796 fase 2 — tarjeta «Fiado» del Cierre: al corte, guardado, error y aproximado (maqueta aprobada por el PO)
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CierreKpiGrid from '../cierre-kpi-grid'
import type { CierreData } from '@/app/(app)/cierre/cierre-client/types'
import type { FiadoAlCorteDelDia } from '@/lib/fiado-al-corte-dia'

afterEach(cleanup)

const datos = (fiadoAlCorte?: FiadoAlCorteDelDia, over: Record<string, unknown> = {}) => ({
  totalVentas: 500000, cobroVentasHoy: 300000, cobroCartera: 0, fiado: 45000, valorComercialPedidosDelDia: 500000,
  fiadosDelDia: [{ pedidoId: 'p1', numero: 1, cliente: 'Cliente A', total: 45000, pagado: 0, saldo: 45000, clienteId: 'c1', promesaPago: null }],
  ...(fiadoAlCorte ? { fiadoAlCorte } : {}), ...over,
}) as unknown as CierreData
const tarjeta = () => screen.getByTestId('cierre-kpi-fiado')

describe('#796 tarjeta de fiado del Cierre', () => {
  it('día en curso (sin bloque): igual que siempre, sin chips ni «pendiente hoy»', () => {
    render(<CierreKpiGrid data={datos()} />)
    expect(tarjeta().textContent).toContain('Quedó fiado')
    expect(tarjeta().textContent).toContain('45.000')
    expect(screen.queryByTestId('fiado-chip-corte')).toBeNull()
    expect(screen.queryByTestId('fiado-pendiente-hoy')).toBeNull()
  })

  it('día pasado: «Fiado al corte» con su día, la cifra del corte y «pendiente hoy» aparte', () => {
    render(<CierreKpiGrid data={datos({ estado: 'AL_CORTE', diaCorte: '2026-11-04', corteAt: '2026-11-05T05:00:00.000Z', total: 160000, pendienteHoy: 45000, aproximados: [] })} />)
    expect(tarjeta().textContent).toContain('Fiado al corte')
    expect(screen.getByTestId('fiado-chip-corte').textContent).toMatch(/fin del 4 de nov/)
    expect(tarjeta().textContent).toContain('160.000')
    expect(tarjeta().textContent).toContain('No baja aunque hoy se cobre')
    expect(screen.getByTestId('fiado-pendiente-hoy').textContent).toContain('45.000')
    expect(screen.queryByTestId('fiado-chip-aproximado')).toBeNull()
  })

  it('con cierre guardado: su cifra guardada, la etiqueta con la hora y «pendiente hoy»; sin recalcular', () => {
    render(<CierreKpiGrid data={datos({ estado: 'GUARDADO', diaCorte: '2026-11-04', pendienteHoy: 20000 }, { fiado: 160000, fiadosDelDia: undefined, horaCierre: '2026-11-06T20:10:00.000Z' })} />)
    expect(tarjeta().textContent).toContain('160.000')
    expect(screen.getByTestId('fiado-chip-guardado').textContent).toMatch(/cierre guardado el 6 de nov/)
    expect(tarjeta().textContent).toContain('Cifra guardada al cerrar. No se recalcula.')
    expect(screen.getByTestId('fiado-pendiente-hoy').textContent).toContain('20.000')
  })

  it('aproximado: lo dice con los números de pedido y no inventa la cifra', () => {
    render(<CierreKpiGrid data={datos({ estado: 'AL_CORTE', diaCorte: '2026-11-04', total: 160000, pendienteHoy: 0, aproximados: [{ numero: 801, motivos: ['SIN_FECHA_DE_ANULACION'] }, { numero: 805, motivos: ['SIN_FECHA_DE_ANULACION'] }] })} />)
    expect(screen.getByTestId('fiado-chip-aproximado').textContent).toBe('aproximado')
    expect(screen.getByTestId('fiado-aproximado').textContent).toContain('2 pedidos sin dato completo (#801, #805)')
  })

  it('error: no muestra cifra, dice que no se cambió nada y «Reintentar» vuelve a pedirlo', () => {
    const reintentar = vi.fn()
    render(<CierreKpiGrid data={datos({ estado: 'ERROR', diaCorte: '2026-11-04' })} onReintentarFiado={reintentar} />)
    expect(tarjeta().textContent).toContain('—')
    expect(screen.getByTestId('fiado-error').textContent).toContain('No se cambió nada')
    expect(tarjeta().textContent).not.toContain('45.000')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reintentar).toHaveBeenCalledTimes(1)
  })
})
