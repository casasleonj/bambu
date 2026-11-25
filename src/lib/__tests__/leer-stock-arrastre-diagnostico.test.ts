import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dateRangeForDay } from '../date-helpers'
import { unidadesEntregadasDelDia } from '../unidades-entregadas-dia'
import { leerStockArrastreDiagnostico } from '../leer-stock-arrastre-diagnostico'

vi.mock('../unidades-entregadas-dia', () => ({ unidadesEntregadasDelDia: vi.fn() }))
const leerEntregas = vi.mocked(unidadesEntregadasDelDia)
const fecha = (dia: string) => dateRangeForDay(dia).gte
type Db = Parameters<typeof leerStockArrastreDiagnostico>[0]
function fuente(cierre: { fecha: Date; stockFinAgua: number; stockFinHielo: number; stockFinBotellon: number | null } | null) {
  const findFirst = vi.fn(async () => cierre)
  const findMany = vi.fn(async () => [{
    id: 'turno-a', fecha: fecha('2026-08-02'), createdAt: fecha('2026-08-05'),
    items: [{ producto: 'PACA_AGUA', producido: 20, rotas: 1, filtradas: 2, consumoInterno: 0, stockFinFisico: 0 }],
  }])
  const db = { cierreDia: { findFirst }, produccion: { findMany } } as unknown as Db
  return { db, findFirst, findMany }
}
const cierre = { fecha: fecha('2026-08-01'), stockFinAgua: 100, stockFinHielo: 0, stockFinBotellon: null }

describe('F2-A lector de diagnóstico', () => {
  beforeEach(() => {
    leerEntregas.mockReset()
    leerEntregas.mockResolvedValue({ agua: 12, hielo: 0, botellon: 0, bolsaAgua: 0, bolsaHielo: 0, aproximados: [] })
  })
  it('usa la fecha efectiva y el intervalo completo, no el día de registro ni solo hoy', async () => {
    const { db, findFirst, findMany } = fuente(cierre)
    const res = await leerStockArrastreDiagnostico(db, '2026-08-04')
    const desde = fecha('2026-08-02')
    const hasta = fecha('2026-08-04')
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { fecha: { lt: hasta } } }))
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { fecha: { gte: desde, lt: hasta } } }))
    expect(leerEntregas).toHaveBeenCalledExactlyOnceWith(db, { desde, hasta })
    expect(res.productos[0]).toMatchObject({ saldoParcial: 105, produccionNeta: 17, entregadas: 12,
      conteos: [{ fecha: '2026-08-02', cantidad: 0, alcance: 'NO_VERIFICADO' }] })
  })
  it('un cierre inmediato conserva su saldo y no vuelve a aplicar movimientos', async () => {
    const { db, findMany } = fuente(cierre)
    const res = await leerStockArrastreDiagnostico(db, '2026-08-02')
    expect(res.productos[0]).toMatchObject({ saldoParcial: 100, calidad: 'CIERRE_PREVIO' })
    expect(findMany).not.toHaveBeenCalled()
    expect(leerEntregas).not.toHaveBeenCalled()
  })
  it('sin ancla fechada no inventa saldo ni lee un intervalo arbitrario', async () => {
    const { db, findMany } = fuente(null)
    const res = await leerStockArrastreDiagnostico(db, '2026-08-04')
    expect(res.productos[0]).toMatchObject({ saldoParcial: null, calidad: 'SIN_ANCLA' })
    expect(findMany).not.toHaveBeenCalled()
    expect(leerEntregas).not.toHaveBeenCalled()
  })
})
