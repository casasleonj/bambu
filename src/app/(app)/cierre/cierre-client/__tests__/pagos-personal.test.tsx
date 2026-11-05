// @tests #646 (PR B) — «Pagos al personal»: resumen del día, una tarjeta por persona con su rol y estado, un solo aviso de
// lo pendiente y la misma lógica de pago de siempre.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PagosPersonal, resumenPagosPersonal } from '../pagos-personal'
import type { CierreData } from '../types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const fetchMock = vi.fn()

const carlos = { trabajadorId: 'c1', nombre: 'Carlos Pérez', total: 35000, pagado: 0, pendiente: 35000 }
const luis = { trabajadorId: 's1', nombre: 'Luis Gómez', total: 50000, pagado: 50000, pendiente: 0 }
const pedro = { trabajadorId: 'p1', nombre: 'Pedro Ruiz', total: 20000, pagado: 0, pendiente: 20000, revisiones: [{ motivo: 'Entrega sin cobrar', embarqueId: 'e1' }] }
const sueldo = { trabajadorId: 'a1', nombre: 'Lilia Castilla', fecha: '2026-11-05', monto: 900000, fueraDeCaja: true }

const datos = (over: Record<string, unknown> = {}) => ({
  comisionesAuto: { total: 50000, repartidores: [carlos], selladores: [luis] },
  sueldosQueTocan: [sueldo],
  ...over,
}) as unknown as CierreData

function montar(data: CierreData | null, over: Partial<React.ComponentProps<typeof PagosPersonal>> = {}) {
  const onPagado = vi.fn()
  render(<PagosPersonal data={data} fecha="2026-11-05" puedePagar diaCerrado={false} onPagado={onPagado} {...over} />)
  return { onPagado }
}

beforeEach(() => { vi.clearAllMocks(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })

describe('resumenPagosPersonal', () => {
  it('suma comisiones y sueldos: del día, pagado y pendiente', () => {
    const r = resumenPagosPersonal(datos())
    expect(r.delDia).toBe(35000 + 50000 + 900000)
    expect(r.pagado).toBe(50000)
    expect(r.pendiente).toBe(35000 + 900000)
    expect(r.hayAlgo).toBe(true)
    expect(r.hayComisionPendiente).toBe(true)
  })
  it('sin nada no hay nada que mostrar', () => {
    expect(resumenPagosPersonal(null).hayAlgo).toBe(false)
    expect(resumenPagosPersonal(datos({ comisionesAuto: { total: 0, repartidores: [], selladores: [] }, sueldosQueTocan: [] })).hayAlgo).toBe(false)
  })
})

describe('PagosPersonal', () => {
  it('muestra el resumen y una tarjeta por persona con su rol y su estado', () => {
    montar(datos())
    expect(screen.getByTestId('pagos-personal-del-dia')).toHaveTextContent(/\$\s*985\.000/)
    expect(screen.getByTestId('pagos-personal-pagado')).toHaveTextContent(/\$\s*50\.000/)
    expect(screen.getByTestId('pagos-personal-pendiente')).toHaveTextContent(/\$\s*935\.000/)
    expect(screen.getByTestId('comision-c1')).toHaveTextContent('Repartidor')
    expect(screen.getByTestId('comision-c1')).toHaveTextContent('Pendiente')
    expect(screen.getByTestId('comision-s1')).toHaveTextContent('Sellador')
    expect(screen.getByTestId('comision-s1')).toHaveTextContent('Pagado')
    expect(screen.getByTestId('sueldo-a1-2026-11-05')).toHaveTextContent('por fuera de la caja')
  })

  it('un solo aviso de lo pendiente para todos los bloques', () => {
    montar(datos())
    expect(screen.getAllByTestId('comisiones-aviso-pendiente')).toHaveLength(1)
    expect(screen.getByTestId('comisiones-aviso-pendiente')).toHaveTextContent('se paga con la nómina')
  })

  it('«Por conciliar» no tiene botón de pagar y se avisa que lo revise un administrador', () => {
    montar(datos({ comisionesAuto: { total: 0, repartidores: [pedro], selladores: [] }, sueldosQueTocan: [] }))
    expect(screen.getByTestId('comision-p1')).toHaveTextContent('Por conciliar')
    expect(screen.queryByTestId('pagar-comision-p1')).toBeNull()
    expect(screen.getByTestId('comision-p1')).toHaveTextContent('Un administrador debe revisar')
  })

  it('sin nada dice «Sin comisiones ni sueldos este día» y no muestra el resumen', () => {
    montar(datos({ comisionesAuto: { total: 0, repartidores: [], selladores: [] }, sueldosQueTocan: [] }))
    expect(screen.getByTestId('pagos-personal-vacio')).toHaveTextContent('Sin comisiones ni sueldos este día.')
    expect(screen.queryByTestId('pagos-personal')).toBeNull()
  })

  it('solo muestra los bloques que tienen algo (sin sellador ni sueldos no hay bloques vacíos)', () => {
    montar(datos({ comisionesAuto: { total: 0, repartidores: [carlos], selladores: [] }, sueldosQueTocan: [] }))
    expect(screen.getByTestId('comisiones-repartidores')).toBeInTheDocument()
    expect(screen.queryByTestId('comisiones-selladores')).toBeNull()
    expect(screen.queryByTestId('sueldos-que-tocan')).toBeNull()
    expect(screen.queryByTestId('comisiones-vacio')).toBeNull()
    expect(screen.queryByTestId('sueldos-vacio')).toBeNull()
  })

  it('pagar sigue usando el mismo endpoint, la confirmación y el monto esperado', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    const { onPagado } = montar(datos({ sueldosQueTocan: [] }))
    fireEvent.click(screen.getByTestId('pagar-comision-c1'))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, ya le pagué' }))
    await waitFor(() => expect(onPagado).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/nomina/dia/pagar')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ trabajadorId: 'c1', fecha: '2026-11-05', montoEsperado: 35000, concepto: 'REPARTO' })
  })

  it('quien no puede pagar ve el estado pero no el botón, y con el día cerrado queda de solo lectura', () => {
    const { unmount } = render(<PagosPersonal data={datos()} fecha="2026-11-05" puedePagar={false} diaCerrado={false} onPagado={vi.fn()} />)
    expect(screen.queryByTestId('pagar-comision-c1')).toBeNull()
    expect(screen.queryByTestId('pagar-sueldo-a1')).toBeNull()
    expect(screen.getByTestId('comisiones-aviso-pendiente')).toHaveTextContent('Un administrador debe pagar')
    unmount()
    render(<PagosPersonal data={datos()} fecha="2026-11-05" puedePagar diaCerrado onPagado={vi.fn()} />)
    expect(screen.queryByTestId('pagar-comision-c1')).toBeNull()
    expect(within(screen.getByTestId('pagos-personal')).getByTestId('comisiones-aviso-pendiente')).toHaveTextContent('no salió de la caja de este día')
  })
})
