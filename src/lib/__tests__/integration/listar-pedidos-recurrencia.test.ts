// @tests Fase 8 F8-i (corrección semántica): la faceta "Solo habituales"
// (`conRecurrencia`) filtra pedidos que SON realmente recurrentes
// (`origen='RECURRENTE'`), NO pedidos de un cliente/negocio que hoy tiene
// una recurrencia. Y compone (interseca) correctamente con los demás
// filtros. Ver revisión del equipo de F8-i.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => {}, revalidatePath: () => {},
}))

import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { ListarPedidosUseCase } from '@/modules/pedidos/application/use-cases/ListarPedidosUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'

const uc = () => new ListarPedidosUseCase(new PrismaPedidoRepository())

async function pedido(data: { clienteId: string; negocioId?: string; origen: string; canal?: string; batch?: string }) {
  return testPrisma.pedido.create({
    data: {
      clienteId: data.clienteId,
      negocioId: data.negocioId ?? null,
      origen: data.origen as never,
      canal: (data.canal ?? 'DOMICILIO') as never,
      recurrenteBatchId: data.batch ?? null,
      estadoPago: 'ANTICIPADO',
    },
  })
}

describe('F8-i — faceta "Solo habituales" = origen RECURRENTE (no contexto)', () => {
  let clienteId: string
  let clienteConRecId: string
  let negocioId: string

  beforeAll(async () => {
    await resetAndSeed()
    const c1 = await testPrisma.cliente.create({ data: { nombre: 'Normal', telefono: uniqueId('t'), activo: true } })
    clienteId = c1.id
    const c2 = await testPrisma.cliente.create({ data: { nombre: 'Con recurrencia', telefono: uniqueId('t'), activo: true } })
    clienteConRecId = c2.id
    // c2 tiene una plantilla recurrente activa
    await testPrisma.plantillaRecurrente.create({ data: { clienteId: c2.id, cadaNDias: 7, canal: 'DOMICILIO' } })
    const neg = await testPrisma.negocio.create({ data: { clienteId: c1.id, nombre: 'Neg', activo: true } })
    negocioId = neg.id
    await testPrisma.plantillaRecurrente.create({ data: { negocioId: neg.id, cadaNDias: 14, canal: 'DOMICILIO' } })
  })
  afterAll(async () => { await disconnect() })

  it('#1 cliente CON recurrencia activa pero pedido NO recurrente → NO aparece', async () => {
    const p = await pedido({ clienteId: clienteConRecId, origen: 'PEDIDO' })
    const r = await uc().execute({ conRecurrencia: true, all: true, pageSize: 500 })
    expect(r.pedidos.some((x) => x.id === p.id)).toBe(false)
  })

  it('#2 pedido realmente recurrente (origen RECURRENTE) → aparece', async () => {
    const p = await pedido({ clienteId: clienteConRecId, origen: 'RECURRENTE', batch: uniqueId('b') })
    const r = await uc().execute({ conRecurrencia: true, all: true, pageSize: 500 })
    expect(r.pedidos.some((x) => x.id === p.id)).toBe(true)
  })

  it('#3 pedido recurrente de un cliente cuya plantilla luego se pausa → SIGUE apareciendo (fue habitual)', async () => {
    const p = await pedido({ clienteId: clienteConRecId, origen: 'RECURRENTE', batch: uniqueId('b') })
    await testPrisma.plantillaRecurrente.updateMany({ where: { clienteId: clienteConRecId }, data: { activo: false } })
    const r = await uc().execute({ conRecurrencia: true, all: true, pageSize: 500 })
    expect(r.pedidos.some((x) => x.id === p.id)).toBe(true)
    // reactivar para no ensuciar otros tests
    await testPrisma.plantillaRecurrente.updateMany({ where: { clienteId: clienteConRecId }, data: { activo: true } })
  })

  it('#5 pedido recurrente de NEGOCIO → aparece', async () => {
    const p = await pedido({ clienteId, negocioId, origen: 'RECURRENTE', batch: uniqueId('b') })
    const r = await uc().execute({ conRecurrencia: true, all: true, pageSize: 500 })
    expect(r.pedidos.some((x) => x.id === p.id)).toBe(true)
  })

  it('#6 pedido normal del MISMO negocio (con recurrencia) → NO aparece', async () => {
    const p = await pedido({ clienteId, negocioId, origen: 'PEDIDO' })
    const r = await uc().execute({ conRecurrencia: true, all: true, pageSize: 500 })
    expect(r.pedidos.some((x) => x.id === p.id)).toBe(false)
  })

  it('#7 composición: conRecurrencia + canal PUNTO → interseca (solo recurrentes PUNTO)', async () => {
    const recDom = await pedido({ clienteId: clienteConRecId, origen: 'RECURRENTE', canal: 'DOMICILIO', batch: uniqueId('b') })
    const recPunto = await pedido({ clienteId: clienteConRecId, origen: 'RECURRENTE', canal: 'PUNTO', batch: uniqueId('b') })
    const r = await uc().execute({ conRecurrencia: true, canal: ['PUNTO'], all: true, pageSize: 500 })
    const ids = r.pedidos.map((x) => x.id)
    expect(ids).toContain(recPunto.id)
    expect(ids).not.toContain(recDom.id)
  })

  it('#7b composición: conRecurrencia + clienteId → solo los recurrentes de ese cliente', async () => {
    const recOtroCliente = await pedido({ clienteId, origen: 'RECURRENTE', batch: uniqueId('b') })
    const r = await uc().execute({ conRecurrencia: true, clienteId: clienteConRecId, all: true, pageSize: 500 })
    const ids = r.pedidos.map((x) => x.id)
    expect(ids).not.toContain(recOtroCliente.id)
    expect(r.pedidos.every((x) => x.clienteId === clienteConRecId)).toBe(true)
  })

  it('sin conRecurrencia → los pedidos normales SÍ aparecen (no se filtra de más)', async () => {
    const normal = await pedido({ clienteId, origen: 'PEDIDO' })
    const r = await uc().execute({ all: true, pageSize: 500 })
    expect(r.pedidos.some((x) => x.id === normal.id)).toBe(true)
  })
})
