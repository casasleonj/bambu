import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mock = vi.hoisted(() => ({
  cierre: vi.fn(), config: vi.fn(), producciones: vi.fn(), embarques: vi.fn(), ventas: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  cierreDia: { findFirst: mock.cierre }, config: { findMany: mock.config },
  produccion: { findMany: mock.producciones }, embarque: { findMany: mock.embarques },
} }))
vi.mock('@/lib/auth-check', () => ({ requirePermission: vi.fn(async () => ({ user: { role: 'ADMIN' } })) }))
vi.mock('@/lib/ventas', () => ({ getVentasDelDia: mock.ventas }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
import { GET } from '../route'

describe('#668 — inicial del día separado de producción previa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.cierre.mockResolvedValue({ stockFinAgua: 138, stockFinHielo: 3, stockFinBotellon: 0 })
    mock.config.mockResolvedValue([])
    mock.embarques.mockResolvedValue([])
    mock.ventas.mockResolvedValue({ aguaVendida: 314, hieloVendido: 4, botellonVendido: 2 })
    mock.producciones.mockResolvedValue([{ items: [
      { producto: 'PACA_AGUA', producido: 500, rotas: 0, filtradas: 0, consumoInterno: 0 },
      { producto: 'PACA_HIELO', producido: 50, rotas: 0, filtradas: 0, consumoInterno: 0 },
      { producto: 'BOTELLON', producido: 2, rotas: 0, filtradas: 0, consumoInterno: 0 },
    ] }])
  })

  it('el día 5 empieza con 138/3/0; 638/53/2 es la base acumulada para otro registro', async () => {
    const res = await GET(new NextRequest('http://localhost/api/produccion/preview?fecha=2026-11-05'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stockInicialDia).toEqual({ stockIniAgua: 138, stockIniHielo: 3, stockIniBotellon: 0 })
    // Mantiene contrato de clientes anteriores: acumulado para una producción adicional.
    expect(body).toMatchObject({ stockIniAgua: 638, stockIniHielo: 53, stockIniBotellon: 2 })
    expect(mock.cierre).toHaveBeenCalledWith(expect.objectContaining({
      where: { fecha: { lt: new Date('2026-11-05T05:00:00Z') } },
    }))
  })

  it('sin producción previa el inicial y la base para el registro coinciden', async () => {
    mock.producciones.mockResolvedValue([])
    const body = await (await GET(new NextRequest('http://localhost/api/produccion/preview?fecha=2026-11-05'))).json()
    expect(body.stockInicialDia).toEqual({ stockIniAgua: 138, stockIniHielo: 3, stockIniBotellon: 0 })
    expect(body.stockIniAgua).toBe(138)
    expect(body.stockIniHielo).toBe(3)
  })

  it('pérdidas de producciones previas se descuentan una vez sin alterar el inicial', async () => {
    mock.producciones.mockResolvedValue([{ items: [
      { producto: 'PACA_AGUA', producido: 500, rotas: 2, filtradas: 100, consumoInterno: 3 },
    ] }])
    const body = await (await GET(new NextRequest('http://localhost/api/produccion/preview?fecha=2026-11-05'))).json()
    expect(body.stockInicialDia.stockIniAgua).toBe(138)
    expect(body.stockIniAgua).toBe(533)
  })

  it('sin fecha explícita excluye el cierre del mismo día', async () => {
    const body = await (await GET(new NextRequest('http://localhost/api/produccion/preview'))).json()
    expect(body.stockInicialDia.stockIniAgua).toBe(138)
    expect(mock.cierre.mock.calls[0][0].where.fecha.lt).toBeInstanceOf(Date)
  })
})
