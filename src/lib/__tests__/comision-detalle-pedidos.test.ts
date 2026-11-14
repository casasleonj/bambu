// @tests #622 — detalle por pedido de «Ver entregas y cálculo»: parciales y pedidos que se completan otro día.
import { describe, expect, it } from 'vitest'
import { detallePorDia, type EventoDia } from '../comision-detalle-pedidos'

const R = 'rep-1', OTRO = 'rep-2'
const u = (agua = 0, hielo = 0, botellon = 0) => ({ agua, hielo, botellon })
const ev = (dia: string, agua: number, repartidorId: string | null = R, extra: Partial<EventoDia> = {}): EventoDia =>
  ({ dia, repartidorId, cantidades: [{ producto: 'PACA_AGUA', cantidad: agua }], fuente: 'AUDITORIA', ...extra })
const solo = (...dias: string[]) => (d: string) => dias.includes(d)

describe('#622 detalle por día', () => {
  it('parcial de un solo día: 3 de 10, pendiente 7, no está completo', () => {
    const r = detallePorDia({ pedido: u(10), entregadoActual: u(3), eventos: [ev('2026-11-05', 3)], trabajadorId: R, esDiaPropio: solo('2026-11-05'), unidadesComision: u(3) })
    expect(r.detalle).toBe('POR_DIA')
    expect(r.alDia).toEqual(u(3))
    expect(r.pendiente).toEqual(u(7))
    expect(r.completoAqui).toBe(false)
    expect(r.completadoDespues).toBeUndefined()
    expect(r.dias).toEqual([{ dia: '2026-11-05', unidades: u(3), propia: true }])
  })

  it('se completa hoy: ayer 5 y hoy 5 → hoy cuenta 5, el pedido queda 10 de 10 y «completó aquí»', () => {
    const r = detallePorDia({ pedido: u(10), entregadoActual: u(10), eventos: [ev('2026-11-04', 5), ev('2026-11-05', 5)], trabajadorId: R, esDiaPropio: solo('2026-11-05'), unidadesComision: u(5) })
    expect(r.detalle).toBe('POR_DIA')
    expect(r.alDia).toEqual(u(10))
    expect(r.pendiente).toEqual(u(0))
    expect(r.completoAqui).toBe(true)
    expect(r.dias).toEqual([
      { dia: '2026-11-04', unidades: u(5), propia: false }, // lo de ayer NO es de esta comisión
      { dia: '2026-11-05', unidades: u(5), propia: true },
    ])
  })

  it('el cierre de AYER del mismo pedido: 5 de 10 a ese día; no figura completo y avisa que se completó después', () => {
    const r = detallePorDia({ pedido: u(10), entregadoActual: u(10), eventos: [ev('2026-11-04', 5), ev('2026-11-05', 5)], trabajadorId: R, esDiaPropio: solo('2026-11-04'), unidadesComision: u(5) })
    expect(r.alDia).toEqual(u(5))
    expect(r.pendiente).toEqual(u(5))
    expect(r.completoAqui).toBe(false)
    expect(r.completadoDespues).toBe('2026-11-05')
    expect(r.dias).toEqual([{ dia: '2026-11-04', unidades: u(5), propia: true }]) // lo posterior no se suma a ese día
  })

  it('sigue parcial hoy: ayer 3, hoy 2 → lleva 5 de 10, pendiente 5', () => {
    const r = detallePorDia({ pedido: u(10), entregadoActual: u(5), eventos: [ev('2026-11-04', 3), ev('2026-11-05', 2)], trabajadorId: R, esDiaPropio: solo('2026-11-05'), unidadesComision: u(2) })
    expect(r.alDia).toEqual(u(5))
    expect(r.pendiente).toEqual(u(5))
    expect(r.completoAqui).toBe(false)
  })

  it('pedido hecho ayer y entregado todo hoy: completo hoy, sin entregas de ayer', () => {
    const r = detallePorDia({ pedido: u(6), entregadoActual: u(6), eventos: [ev('2026-11-05', 6)], trabajadorId: R, esDiaPropio: solo('2026-11-05'), unidadesComision: u(6) })
    expect(r.completoAqui).toBe(true)
    expect(r.dias).toEqual([{ dia: '2026-11-05', unidades: u(6), propia: true }])
  })

  it('dos personas el mismo día: cada una ve lo suyo y lo de la otra aparte; el acumulado las suma', () => {
    const r = detallePorDia({ pedido: u(10), entregadoActual: u(7), eventos: [ev('2026-11-05', 3), ev('2026-11-05', 4, OTRO)], trabajadorId: R, esDiaPropio: solo('2026-11-05'), unidadesComision: u(3) })
    expect(r.alDia).toEqual(u(7))
    expect(r.pendiente).toEqual(u(3))
    expect(r.dias).toEqual([
      { dia: '2026-11-05', unidades: u(3), propia: true },
      { dia: '2026-11-05', unidades: u(4), propia: false },
    ])
  })

  it('varios productos: completo solo cuando todos los pedidos de reparto están cubiertos', () => {
    const multi: EventoDia = { dia: '2026-11-05', repartidorId: R, fuente: 'AUDITORIA', cantidades: [{ producto: 'PACA_AGUA', cantidad: 6 }, { producto: 'PACA_HIELO', cantidad: 1 }] }
    const r = detallePorDia({ pedido: u(6, 2), entregadoActual: u(6, 1), eventos: [multi], trabajadorId: R, esDiaPropio: solo('2026-11-05'), unidadesComision: u(6, 1) })
    expect(r.completoAqui).toBe(false)
    expect(r.pendiente).toEqual(u(0, 1))
  })

  describe('sin inventar: SIN_DETALLE', () => {
    const base = { pedido: u(10), trabajadorId: R, esDiaPropio: solo('2026-11-05') }
    it('sin entregas por día guardadas (registro anterior)', () => {
      expect(detallePorDia({ ...base, entregadoActual: u(4), eventos: [], unidadesComision: u(4) }).detalle).toBe('SIN_DETALLE')
    })
    it('un evento histórico o con cantidades desconocidas', () => {
      expect(detallePorDia({ ...base, entregadoActual: u(4), eventos: [ev('2026-11-05', 4, R, { fuente: 'HISTORICO' })], unidadesComision: u(4) }).detalle).toBe('SIN_DETALLE')
      expect(detallePorDia({ ...base, entregadoActual: u(4), eventos: [ev('2026-11-05', 4, R, { cantidades: null })], unidadesComision: u(4) }).detalle).toBe('SIN_DETALLE')
      expect(detallePorDia({ ...base, entregadoActual: u(4), eventos: [ev('2026-11-05', 4, R, { incompleto: true })], unidadesComision: u(4) }).detalle).toBe('SIN_DETALLE')
    })
    it('si los eventos no suman el acumulado del pedido', () => {
      expect(detallePorDia({ ...base, entregadoActual: u(5), eventos: [ev('2026-11-05', 4)], unidadesComision: u(4) }).detalle).toBe('SIN_DETALLE')
    })
    it('si el detalle por día no reproduce lo que el dinero cuenta (el dinero manda)', () => {
      expect(detallePorDia({ ...base, entregadoActual: u(4), eventos: [ev('2026-11-05', 4)], unidadesComision: u(3) }).detalle).toBe('SIN_DETALLE')
    })
  })
})
