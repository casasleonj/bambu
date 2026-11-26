import { describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { dateRangeForDay } from '../date-helpers'
import { leerComparacionArrastreBackend } from '../leer-comparacion-arrastre-backend'
import { leerStockArrastreDiagnostico } from '../leer-stock-arrastre-diagnostico'
import { resolverStockInicial } from '../stock-inicial'
import { diagnosticarArrastre } from '../stock-arrastre-diagnostico'

vi.mock('../leer-stock-arrastre-diagnostico', () => ({ leerStockArrastreDiagnostico: vi.fn() }))
vi.mock('../stock-inicial', () => ({ resolverStockInicial: vi.fn() }))

describe('F2-B lector de comparación consistente', () => {
  it('lee cierre, cálculo legado y evidencia en la misma transacción sin escribir', async () => {
    const fecha = (dia: string) => dateRangeForDay(dia).gte
    const d = diagnosticarArrastre({
      diaObjetivo: '2026-08-04',
      cierre: { fecha: fecha('2026-08-01'), stock: { PACA_AGUA: 20, PACA_HIELO: 0, BOTELLON: null } },
      producciones: [], entregas: { PACA_AGUA: 5, PACA_HIELO: 0, BOTELLON: 0 }, entregasAproximadas: 0,
    })
    vi.mocked(leerStockArrastreDiagnostico).mockResolvedValue(d)
    vi.mocked(resolverStockInicial).mockResolvedValue({ stockIniAgua: 20, stockIniHielo: 0, stockIniBotellon: 0 })
    const findUnique = vi.fn(async () => ({ necesitaValidacion: false }))
    const findMany = vi.fn(async () => [{
      id: 'm', producto: 'PACA_AGUA', tipo: 'RETORNO', cantidad: 2, origen: 'CLIENTE', destino: 'INSPECCION',
      _count: { sustitucionRecepcion: 1, sustitucionEntrega: 0 },
    }])
    const tx = { cierreDia: { findUnique }, embarqueMovimiento: { findMany } }
    const transaction = vi.fn(async (run: (t: typeof tx) => Promise<unknown>) => run(tx))
    const db = { $transaction: transaction } as unknown as Parameters<typeof leerComparacionArrastreBackend>[0]
    const res = await leerComparacionArrastreBackend(db, '2026-08-04')
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
    expect(leerStockArrastreDiagnostico).toHaveBeenCalledWith(tx, '2026-08-04')
    expect(resolverStockInicial).toHaveBeenCalledWith(tx, fecha('2026-08-04'))
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { fecha: fecha('2026-08-01') } }))
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdAt: { gte: fecha('2026-08-02'), lt: fecha('2026-08-04') } } }))
    expect(res.productos[0]).toMatchObject({ esperadoParcial: 15, diferenciaConActual: -5,
      evidencia: [{ id: 'm', clasificacion: 'REQUIERE_CONCILIACION' }] })
  })
})
