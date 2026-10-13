// @tests Fase 2 — suficiencia de domicilio con ubicación PROPIA del pedido.
// Regla: dirección escrita O ubicación utilizable; el barrio solo nunca basta;
// CONSUMIDOR_FINAL ya no está exento si la operación deja mercancía pendiente.
// Verifica contra Postgres real:
//   1. Matriz [cliente real | CF] × [texto | coords propias | solo barrio | nada]
//      × [entrega ahora | posterior] con paridad Preview ↔ Crear.
//   2. `entregaLat/entregaLng` se persisten y NO son `gpsLat/gpsLng`.
//   3. Actualizar: solo revalida si cambia el destino efectivo; observaciones y
//      pedidos cerrados no se bloquean por insuficiencias históricas.
//   4. Recurrentes: plantilla sin destino se salta con motivo, sin pedido,
//      crédito ni factura, y sin afectar a las demás.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))

import { testPrisma, resetAndSeed, disconnect, getAdminUser, uniqueId } from './setup'
import { PreviewPedidoUseCase } from '@/modules/pedidos/application/use-cases/PreviewPedidoUseCase'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { GetFiadoStatusUseCase } from '@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { getPrecioMinimos } from '@/lib/pricing'
import { resolverCoordsDeLink } from '@/lib/geo/resolver-coords-de-link'

const pedidoRepo = new PrismaPedidoRepository()
const clienteRepo = new PrismaClienteRepository()

const preview = () => new PreviewPedidoUseCase({
  pricingPort: new PrismaPricingAdapter(), clienteRepo, pedidoRepo,
  getFiadoStatusUseCase: new GetFiadoStatusUseCase(pedidoRepo, clienteRepo),
  getPrecioMinimos, resolverCoordsDeLink,
})
const crear = () => new CrearPedidoUseCase(
  pedidoRepo, new PrismaFacturaRepository(), new PrismaPagoRepository(),
  clienteRepo, new PrismaPricingAdapter(), new PrismaTransactionManager(),
  resolverCoordsDeLink, new GetFiadoStatusUseCase(pedidoRepo, clienteRepo),
)

const ITEMS = [{ producto: 'PACA_AGUA' as const, cantidad: 2 }]
const PAGO_COMPLETO = (monto: number) => [{ metodo: 'EFECTIVO' as const, monto }]

// @tests Opción A — una venta de PUNTO pagada en el mostrador (modal "Venta Rápida")
// nace ENTREGADA aunque tenga cliente real. Un pedido de PUNTO "normal" (sin
// `entregado: true` explícito) y cualquier DOMICILIO siguen naciendo PENDIENTES.
// Preview y Crear deben decidir igual.
describe('Venta de PUNTO con cliente nace entregada (opción A)', () => {
  let adminId: string
  let clienteId: string
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({ data: { nombre: 'Sandra León', telefono: uniqueId('t'), direccion: 'Cra 7 # 10-20', barrio: 'Chapinero', activo: true } })).id
  })
  afterAll(async () => { await disconnect() })

  const casos: Array<[string, { canal: 'PUNTO' | 'DOMICILIO'; origen: 'PEDIDO' | 'VENTA_RAPIDA'; entregado?: boolean }, 'ENTREGADO' | 'PENDIENTE']> = [
    ['cliente, PUNTO, entregado:true (modal Venta Rápida)', { canal: 'PUNTO', origen: 'PEDIDO', entregado: true }, 'ENTREGADO'],
    ['cliente, PUNTO, sin entregado (Nuevo Pedido para recoger)', { canal: 'PUNTO', origen: 'PEDIDO' }, 'PENDIENTE'],
    ['cliente, PUNTO, entregar después (entregado:false)', { canal: 'PUNTO', origen: 'PEDIDO', entregado: false }, 'PENDIENTE'],
    ['cliente, DOMICILIO, entregado:true NO se respeta', { canal: 'DOMICILIO', origen: 'PEDIDO', entregado: true }, 'PENDIENTE'],
    ['anónimo, PUNTO venta rápida (sin cambios)', { canal: 'PUNTO', origen: 'VENTA_RAPIDA' }, 'ENTREGADO'],
  ]
  it.each(casos)('%s → %s', async (_n, c, esperado) => {
    const cid = c.origen === 'VENTA_RAPIDA' ? 'CONSUMIDOR_FINAL' : clienteId
    const base = { clienteId: cid, canal: c.canal, origen: c.origen, items: ITEMS, ...(c.entregado === undefined ? {} : { entregado: c.entregado }) }
    const p0 = await preview().execute({ ...base, actorId: adminId })
    const total = p0.calculation.total
    const pagos = PAGO_COMPLETO(total)
    const p = await preview().execute({ ...base, pagos, actorId: adminId })
    expect(p.calculation.estadoEntregaProyectado, 'preview').toBe(esperado)
    const { pedido } = await crear().execute({ ...base, pagos, createdById: adminId, createdByRole: 'ADMIN', offlineId: uniqueId('opcion-a') })
    const row = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
    expect(row.estadoEntrega).toBe(esperado)
    expect(row.estadoPago).toBe(esperado === 'ENTREGADO' ? 'PAGADO' : 'ANTICIPADO')
    expect(row.items.every((i) => i.cantEntrega === (esperado === 'ENTREGADO' ? i.cantPedido : 0))).toBe(true)
    expect(row.embarqueId).toBeNull()
  })
})
