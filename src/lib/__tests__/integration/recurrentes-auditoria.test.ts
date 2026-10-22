// @tests Auditoría de pedidos recurrentes (plan de integridad v1.2 §5.E)
// Antes: ni el cron ni el Hub dejaban rastro de quién generó un recurrente
// (#85/#86 sin fila CREATE, `createdById` vacío). Contra Postgres real:
//   1. el cron genera con el actor técnico `system@bambu.local`;
//   2. el Hub genera con el usuario de la sesión;
//   3. un reintento con el mismo lote no crea otro pedido ni audita dos veces;
//   4. un salto deja `SALTADO:<motivo>` (incluye destino no localizable, #299);
//   5. un error deja `GENERACION/ERROR` aunque la transacción se revierta.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, uniqueId } from './setup'

const falla = vi.hoisted(() => ({ clienteId: '' }))
vi.mock('@/lib/pricing', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pricing')>()
  return {
    ...original,
    resolverPreciosPedido: async (...args: Parameters<typeof original.resolverPreciosPedido>) => {
      if (args[2] === falla.clienteId) throw new Error('PRECIO_NO_RESUELTO')
      return original.resolverPreciosPedido(...args)
    },
  }
})

import { generarPedidosRecurrentes } from '@/lib/recurrentes'

const PROX = new Date('2026-09-01T12:00:00Z') // martes

async function crearPlantilla(tag: string, direccion: string | null = 'Calle 1') {
  const cliente = await testPrisma.cliente.create({
    data: {
      nombre: `Rec ${tag}`,
      telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
      direccion,
      limitePedidosFiados: 999,
      activo: true,
    },
  })
  const plantilla = await testPrisma.plantillaRecurrente.create({
    data: {
      clienteId: cliente.id,
      activo: true,
      cadaNDias: 7,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      proxGeneracion: PROX,
      ultimaGeneracion: null,
      productos: { create: [{ producto: 'PACA_AGUA', cantidad: 5 }] },
    },
  })
  return { clienteId: cliente.id, plantillaId: plantilla.id }
}

async function generaciones(plantillaId: string) {
  const filas = await testPrisma.historial.findMany({
    where: { entidad: 'PlantillaRecurrente', registroId: plantillaId, accion: 'GENERACION' },
    orderBy: { fecha: 'asc' },
  })
  return filas.map((f) => ({ usuarioId: f.usuarioId, datos: JSON.parse(f.datos as string) as Record<string, unknown> }))
}

describe('Recurrentes — auditoría de generación (§5.E)', () => {
  let adminId: string
  let systemId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const system = await testPrisma.user.upsert({
      where: { username: 'system@bambu.local' },
      update: {},
      create: { username: 'system@bambu.local', nombre: 'Sistema', password: 'x', rol: 'ADMIN', activo: true },
    })
    systemId = system.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('cron: GENERADO, CREATE del pedido y createdById con el actor técnico', async () => {
    const { plantillaId } = await crearPlantilla('cron')
    const { POST } = await import('@/app/api/cron/generar-recurrentes/route')
    process.env.CRON_SECRET = 'secreto-test'
    const res = await POST(new Request('http://localhost/api/cron/generar-recurrentes', {
      method: 'POST',
      headers: { 'x-cron-secret': 'secreto-test' },
    }) as never)
    expect(res.status).toBe(200)

    const pedido = await testPrisma.pedido.findFirstOrThrow({ where: { idOrigen: plantillaId, origen: 'RECURRENTE' } })
    expect(pedido.createdById).toBe(systemId)

    const [g] = await generaciones(plantillaId)
    expect(g.usuarioId).toBe(systemId)
    expect(g.datos).toMatchObject({ resultado: 'GENERADO', proceso: 'cron', pedidoId: pedido.id, numero: pedido.numero, prox: '2026-09-01' })

    const create = await testPrisma.historial.findFirst({ where: { entidad: 'Pedido', registroId: pedido.id, accion: 'CREATE' } })
    expect(create?.usuarioId).toBe(systemId)
  })

  it('hub: actor de la sesión; un reintento con el mismo lote no duplica pedido ni auditoría', async () => {
    const { plantillaId } = await crearPlantilla('hub')
    const lote = uniqueId('lote')
    const opciones = { recurrenteBatchId: lote, actor: { usuarioId: adminId, proceso: 'hub' as const } }

    const primero = await generarPedidosRecurrentes([{ recurrenteId: plantillaId, decision: 'NORMAL' }], PROX, opciones)
    const reintento = await generarPedidosRecurrentes([{ recurrenteId: plantillaId, decision: 'NORMAL' }], PROX, opciones)

    expect(reintento.generados.map((p) => p.id)).toEqual(primero.generados.map((p) => p.id))
    expect(await testPrisma.pedido.count({ where: { idOrigen: plantillaId } })).toBe(1)

    const filas = await generaciones(plantillaId)
    expect(filas).toHaveLength(1)
    expect(filas[0].usuarioId).toBe(adminId)
    expect(filas[0].datos).toMatchObject({ resultado: 'GENERADO', proceso: 'hub', recurrenteBatchId: lote })
    const pedido = await testPrisma.pedido.findFirstOrThrow({ where: { idOrigen: plantillaId } })
    expect(pedido.createdById).toBe(adminId)
  })

  it('salto: deja SALTADO con el motivo y no crea pedido', async () => {
    const { plantillaId } = await crearPlantilla('saltar')
    await generarPedidosRecurrentes([{ recurrenteId: plantillaId, decision: 'SALTAR' }], PROX, {
      actor: { usuarioId: adminId, proceso: 'hub' },
    })
    const [g] = await generaciones(plantillaId)
    expect(g.datos).toMatchObject({ resultado: 'SALTADO:DECISION_SALTAR', decision: 'SALTAR', prox: '2026-09-01' })
    expect(await testPrisma.pedido.count({ where: { idOrigen: plantillaId } })).toBe(0)
  })

  it('destino no localizable: deja SALTADO:ENTREGA_INSUFICIENTE y no mueve el calendario', async () => {
    const { plantillaId } = await crearPlantilla('sin-destino', null)
    const r = await generarPedidosRecurrentes([{ recurrenteId: plantillaId, decision: 'NORMAL' }], PROX, {
      actor: { usuarioId: adminId, proceso: 'hub' },
    })
    expect(r.omitidos).toEqual([{ recurrenteId: plantillaId, motivo: 'ENTREGA_INSUFICIENTE' }])
    const [g] = await generaciones(plantillaId)
    expect(g.datos).toMatchObject({ resultado: 'SALTADO:ENTREGA_INSUFICIENTE', prox: '2026-09-01' })
    const pt = await testPrisma.plantillaRecurrente.findUniqueOrThrow({ where: { id: plantillaId } })
    expect(pt.ultimaGeneracion).toBeNull()
  })

  it('error: GENERACION/ERROR se registra aunque la transacción se revierta', async () => {
    const { clienteId, plantillaId } = await crearPlantilla('error')
    falla.clienteId = clienteId
    await expect(
      generarPedidosRecurrentes([{ recurrenteId: plantillaId, decision: 'NORMAL' }], PROX, {
        actor: { usuarioId: adminId, proceso: 'hub' },
      }),
    ).rejects.toThrow('PRECIO_NO_RESUELTO')
    falla.clienteId = ''

    const [g] = await generaciones(plantillaId)
    expect(g.usuarioId).toBe(adminId)
    expect(g.datos).toMatchObject({ resultado: 'ERROR', error: 'PRECIO_NO_RESUELTO' })
    expect(await testPrisma.pedido.count({ where: { idOrigen: plantillaId } })).toBe(0)
    const pt = await testPrisma.plantillaRecurrente.findUniqueOrThrow({ where: { id: plantillaId } })
    expect(pt.ultimaGeneracion).toBeNull()
  })
})
