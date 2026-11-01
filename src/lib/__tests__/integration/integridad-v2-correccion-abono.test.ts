// @tests V2 del verificador (#533) — la regla «totalPagado = Σ Pago + Σ Abono» no debe dar falsos
// positivos con las correcciones de abono (ADR-CORRECCION-MONETARIA-001): bajan `totalPagado` sin
// borrar el Abono ni el Pago que lo originó.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser, createTestCliente } from './setup'
import { POST as corregir } from '@/app/api/cartera/abonos/[id]/corregir/route'
import { verificarIntegridad } from '@/lib/integridad/verificar'

async function v2DelPedido(numero: number) {
  const reporte = await verificarIntegridad(testPrisma, { maxMuestras: 5000 })
  return reporte.reglas.find((r) => r.id === 'V2')!.hallazgos.filter((h) => h.numero === numero)
}

async function corregirAbono(abonoId: string, montoRevertido: number) {
  const req = new NextRequest('http://localhost/x', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'MONTO', montoRevertido, motivo: 'monto mal digitado' }),
  })
  return corregir(req, { params: Promise.resolve({ id: abonoId }) })
}

describe('V2 con correcciones de abono', () => {
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    mockAuth.mockResolvedValue({ user: { id: admin.id, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })
  afterAll(async () => { await disconnect() })

  async function pedidoConFactura(sufijo: string, pagado: number) {
    const c = await createTestCliente(sufijo)
    const p = await testPrisma.pedido.create({
      data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PARCIAL', total: 20000, totalPagado: pagado, saldo: 20000 - pagado },
    })
    const f = await testPrisma.factura.create({
      data: { numero: `FAC-${sufijo}`, clienteId: c.id, pedidoId: p.id, subtotal: 20000, total: 20000, saldo: 20000 - pagado, montoPagado: pagado, estado: 'PARCIAL' },
    })
    return { c, p, f }
  }

  it('un abono independiente corregido no es una discrepancia', async () => {
    const { c, p, f } = await pedidoConFactura('v2a', 8000)
    const a = await testPrisma.abono.create({ data: { numero: 'ABO-V2A', clienteId: c.id, facturaId: f.id, pedidoId: p.id, monto: 8000, metodoPago: 'EFECTIVO', origenCobro: 'INDEPENDIENTE' } })
    expect(await v2DelPedido(p.numero)).toEqual([])
    expect((await corregirAbono(a.id, 3000)).status).toBe(201)
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).totalPagado.toString()).toBe('5000')
    expect(await v2DelPedido(p.numero)).toEqual([])
  })

  it('el abono espejo de un pago corregido tampoco', async () => {
    const { c, p, f } = await pedidoConFactura('v2b', 8000)
    const pago = await testPrisma.pago.create({ data: { pedidoId: p.id, metodo: 'EFECTIVO', monto: 8000, confirmacion: 'CONFIRMADO' } })
    const a = await testPrisma.abono.create({ data: { numero: 'ABO-V2B', clienteId: c.id, facturaId: f.id, pedidoId: p.id, monto: 8000, metodoPago: 'EFECTIVO', origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pago.id } })
    expect(await v2DelPedido(p.numero)).toEqual([])
    expect((await corregirAbono(a.id, 8000)).status).toBe(201)
    expect(await v2DelPedido(p.numero)).toEqual([])
  })

  it('sigue detectando una discrepancia real: totalPagado que no corresponde a ningún pago', async () => {
    const { p } = await pedidoConFactura('v2c', 5000) // totalPagado 5.000 sin Pago ni Abono
    const hallazgos = await v2DelPedido(p.numero)
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0].detalle).toMatchObject({ totalPagado: 5000, pagos: 0, abonos: 0, diferencia: 5000 })
  })
})
