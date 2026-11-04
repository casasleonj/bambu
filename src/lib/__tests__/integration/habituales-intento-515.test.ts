// @tests #515 #407 — recuperación real, parcialidad y concurrencia en PostgreSQL.
import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import {
  testPrisma as db,
  resetAndSeed,
  disconnect,
  getAdminUser,
} from './setup'
const state = vi.hoisted(() => ({ failCliente: '', actor: '' }))
vi.mock('@/lib/pricing', async (original) => {
  const actual = await original<typeof import('@/lib/pricing')>()
  return {
    ...actual,
    resolverPreciosPedido: async (
      ...args: Parameters<typeof actual.resolverPreciosPedido>
    ) => {
      if (args[2] === state.failCliente) throw new Error('PROBE_PRICE_FAIL')
      return actual.resolverPreciosPedido(...args)
    },
  }
})
vi.mock('@/lib/auth-check', () => ({
  requireAuth: async () => ({ user: { id: state.actor, role: 'ADMIN' } }),
  requireRole: async () => null,
  requirePermission: async () => null,
}))
vi.mock('@/lib/realtime', () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
}))
import { generarPedidosRecurrentes } from '@/lib/recurrentes'
import { POST, GET } from '@/app/api/pedidos/recurrentes/route'
import { GET as catalogo } from '@/app/api/recurrentes/route'
import { previewGeneracionRecurrentes } from '@/lib/recurrentes'
import { NextRequest } from 'next/server'
import { publishRealtimeEvent } from '@/lib/realtime'
const PROX = new Date('2026-09-01T12:00:00Z')
beforeAll(async () => {
  await resetAndSeed()
  state.actor = (await getAdminUser()).id
}, 60000)
afterAll(disconnect)
async function plantilla(id: string) {
  const cliente = await db.cliente.create({
    data: {
      nombre: id,
      telefono: id,
      direccion: 'Calle 1',
      activo: true,
      limitePedidosFiados: 999,
    },
  })
  const pt = await db.plantillaRecurrente.create({
    data: {
      id,
      clienteId: cliente.id,
      activo: true,
      cadaNDias: 7,
      tipo: 'PUNTO',
      canal: 'PUNTO',
      proxGeneracion: PROX,
      productos: { create: [{ producto: 'PACA_AGUA', cantidad: 3 }] },
    },
  })
  return { pt, cliente }
}
it('el mismo intento HTTP recupera el resultado sin duplicar', async () => {
  const { pt } = await plantilla('probe-http')
  const body = {
    decisiones: [{ recurrenteId: pt.id, decision: 'NORMAL' }],
    offlineId: 'probe-http-batch',
    fecha: PROX.toISOString(),
  }
  const enviar = () =>
    POST(
      new NextRequest('http://localhost/api/pedidos/recurrentes', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    )
  const first = await enviar()
  const second = await enviar()
  console.info(
    'PROBE_HTTP',
    JSON.stringify({
      first: first.status,
      replay: second.status,
      pedidos: await db.pedido.count({ where: { idOrigen: pt.id } }),
    }),
  )
  expect(first.status).toBe(201)
  expect(second.status).toBe(200)
  expect((await second.json()).deduped).toBe(true)
  expect(publishRealtimeEvent).toHaveBeenCalledTimes(1)
})
it('un lote parcial se completa con la misma referencia sin repetir lo confirmado', async () => {
  const a = await plantilla('probe-partial-a')
  const b = await plantilla('probe-partial-b')
  state.failCliente = b.cliente.id
  const decisiones = [a, b].map((x) => ({
    recurrenteId: x.pt.id,
    decision: 'NORMAL' as const,
  }))
  const options = {
    recurrenteBatchId: 'probe-partial',
    actor: { usuarioId: state.actor, proceso: 'hub' as const },
  }
  await expect(
    generarPedidosRecurrentes(decisiones, PROX, options),
  ).rejects.toThrow('PROBE_PRICE_FAIL')
  state.failCliente = ''
  const replay = await generarPedidosRecurrentes(decisiones, PROX, options)
  const counts = await Promise.all(
    [a, b].map((x) => db.pedido.count({ where: { idOrigen: x.pt.id } })),
  )
  console.info(
    'PROBE_PARTIAL',
    JSON.stringify({ counts, returned: replay.generados.length }),
  )
  expect(counts).toEqual([1, 1])
  expect(replay.generados).toHaveLength(2)
})
it('dos confirmaciones del mismo objetivo crean un solo pedido', async () => {
  const { pt } = await plantilla('probe-concurrent')
  const decisions = [
    {
      recurrenteId: pt.id,
      decision: 'NORMAL' as const,
      proximaFecha: PROX.toISOString(),
    },
  ]
  const outcomes = await Promise.allSettled(
    ['a', 'b'].map((id) =>
      generarPedidosRecurrentes(decisions, PROX, {
        recurrenteBatchId: `probe-concurrent-${id}`,
        actor: { usuarioId: state.actor, proceso: 'hub' },
      }),
    ),
  )
  const pedidos = await db.pedido.findMany({
    where: { idOrigen: pt.id },
    select: { id: true, fecha: true },
  })
  console.info(
    'PROBE_CONCURRENT',
    JSON.stringify({ results: outcomes.map((x) => x.status), pedidos }),
  )
  expect(pedidos).toHaveLength(1)
})
it('repetir SALTAR conserva el primer avance de calendario', async () => {
  const { pt } = await plantilla('probe-saltar')
  const decisions = [{ recurrenteId: pt.id, decision: 'SALTAR' as const }]
  const options = {
    recurrenteBatchId: 'probe-saltar-batch',
    actor: { usuarioId: state.actor, proceso: 'hub' as const },
  }
  await generarPedidosRecurrentes(decisions, PROX, options)
  const first = await db.plantillaRecurrente.findUniqueOrThrow({
    where: { id: pt.id },
  })
  await generarPedidosRecurrentes(decisions, PROX, options)
  const second = await db.plantillaRecurrente.findUniqueOrThrow({
    where: { id: pt.id },
  })
  console.info(
    'PROBE_SALTAR',
    JSON.stringify({
      first: first.proxGeneracion,
      replay: second.proxGeneracion,
    }),
  )
  expect(second.proxGeneracion).toEqual(first.proxGeneracion)
})
it('consulta el progreso sin escribir, exige el mismo actor y no reutiliza una clave para otra decisión', async () => {
  const { pt } = await plantilla('probe-status')
  const body = {
    decisiones: [{ recurrenteId: pt.id, decision: 'NORMAL' }],
    offlineId: 'probe-status-batch',
    fecha: PROX.toISOString(),
  }
  const status = () =>
    GET(
      new NextRequest(
        `http://localhost/api/pedidos/recurrentes?offlineId=${body.offlineId}`,
      ),
    )
  expect((await status()).status).toBe(404)
  const antes = await db.pedido.count()
  expect(
    (
      await POST(
        new NextRequest('http://localhost/api/pedidos/recurrentes', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      )
    ).status,
  ).toBe(201)
  const r = await status()
  expect(r.status).toBe(200)
  expect(r.headers.get('Cache-Control')).toContain('no-store')
  expect(await r.json()).toMatchObject({
    estado: 'COMPLETO',
    pendientes: 0,
    items: [{ recurrenteId: pt.id, estado: 'GENERADO' }],
  })
  expect(await db.pedido.count()).toBe(antes + 1)
  const otro = {
    ...body,
    decisiones: [{ recurrenteId: pt.id, decision: 'SALTAR' }],
  }
  expect(
    (
      await POST(
        new NextRequest('http://localhost/api/pedidos/recurrentes', {
          method: 'POST',
          body: JSON.stringify(otro),
        }),
      )
    ).status,
  ).toBe(409)
  const actor = state.actor
  state.actor = 'otro-actor'
  try {
    expect((await status()).status).toBe(404)
  } finally {
    state.actor = actor
  }
})
it('negocio-only conserva su contexto y consulta la deuda del propietario en el preview y la validación', async () => {
  const { pt, cliente } = await plantilla('probe-negocio')
  const negocio = await db.negocio.create({
    data: { nombre: 'Tienda Contexto 515', clienteId: cliente.id },
  })
  await db.plantillaRecurrente.update({
    where: { id: pt.id },
    data: { clienteId: null, negocioId: negocio.id },
  })
  const deuda = await db.pedido.create({
    data: {
      clienteId: cliente.id,
      canal: 'PUNTO',
      origen: 'PEDIDO',
      total: 9000,
      saldo: 9000,
      totalPagado: 0,
      cPacaAguaPed: 3,
      items: {
        create: {
          producto: 'PACA_AGUA',
          cantPedido: 3,
          precio: 3000,
          subtotal: 9000,
        },
      },
    },
  })
  const preview = (await previewGeneracionRecurrentes(PROX)).find(
    (p) => p.recurrenteId === pt.id,
  )!
  expect(preview.negocioId).toBe(negocio.id)
  expect(preview.pedidosConDeuda.map((p) => p.id)).toContain(deuda.id)
  expect(
    preview.sugerencias.find((s) => s.tipo === 'CON_PENDIENTES')?.disabled,
  ).toBe(true)
  const send = (decision: string, offlineId: string) =>
    POST(
      new NextRequest('http://localhost/api/pedidos/recurrentes', {
        method: 'POST',
        body: JSON.stringify({
          decisiones: [{ recurrenteId: pt.id, decision }],
          offlineId,
          fecha: PROX.toISOString(),
        }),
      }),
    )
  expect((await send('CON_PENDIENTES', 'probe-negocio-bad')).status).toBe(400)
  expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(0)
  expect((await send('NORMAL', 'probe-negocio-good')).status).toBe(201)
  expect(
    await db.pedido.findFirst({ where: { idOrigen: pt.id } }),
  ).toMatchObject({ clienteId: cliente.id, negocioId: negocio.id })
  await db.plantillaRecurrente.update({
    where: { id: pt.id },
    data: { activo: false },
  })
  const todos = await (
    await catalogo(
      new NextRequest('http://localhost/api/recurrentes?incluirInactivos=true'),
    )
  ).json()
  expect(
    todos.recurrentes.find((r: { id: string }) => r.id === pt.id),
  ).toMatchObject({
    activo: false,
    clienteId: null,
    negocioId: negocio.id,
    cliente: null,
  })
  const activos = await (
    await catalogo(new NextRequest('http://localhost/api/recurrentes'))
  ).json()
  expect(activos.recurrentes.some((r: { id: string }) => r.id === pt.id)).toBe(
    false,
  )
})
it('la ruta informa un lote parcial y notifica solo pedidos nuevos, también antes de un error posterior', async () => {
  vi.mocked(publishRealtimeEvent).mockClear()
  const a = await plantilla('http-partial-a')
  const b = await plantilla('http-partial-b')
  const body = {
    offlineId: 'http-partial-batch',
    fecha: PROX.toISOString(),
    decisiones: [a, b].map((x) => ({
      recurrenteId: x.pt.id,
      decision: 'NORMAL',
    })),
  }
  const send = () =>
    POST(
      new NextRequest('http://localhost/api/pedidos/recurrentes', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    )
  state.failCliente = b.cliente.id
  let fallo: Response
  try {
    fallo = await send()
  } finally {
    state.failCliente = ''
  }
  expect(fallo!.status).toBe(500)
  expect(publishRealtimeEvent).toHaveBeenCalledTimes(1)
  const status = () =>
    GET(
      new NextRequest(
        `http://localhost/api/pedidos/recurrentes?offlineId=${body.offlineId}`,
      ),
    )
  const parcial = await (await status()).json()
  expect(parcial).toMatchObject({ estado: 'PARCIAL', pendientes: 1 })
  expect(parcial.items.map((i: { estado: string }) => i.estado)).toEqual([
    'GENERADO',
    'PENDIENTE',
  ])
  const reintento = await send()
  expect(reintento.status).toBe(201)
  expect(await reintento.json()).toMatchObject({ generados: 2, saltados: 0 })
  expect(publishRealtimeEvent).toHaveBeenCalledTimes(2)
  expect((await send()).status).toBe(200)
  expect(publishRealtimeEvent).toHaveBeenCalledTimes(2)
  expect(
    await db.pedido.count({ where: { idOrigen: { in: [a.pt.id, b.pt.id] } } }),
  ).toBe(2)
  expect(await (await status()).json()).toMatchObject({
    estado: 'COMPLETO',
    pendientes: 0,
  })
})
it('un cambio de productos entre revisión y confirmación no se aplica silenciosamente', async () => {
  const { pt } = await plantilla('probe-version')
  await db.plantillaRecurrente.update({
    where: { id: pt.id },
    data: { cadaNDias: 8 },
  })
  const res = await POST(
    new NextRequest('http://localhost/api/pedidos/recurrentes', {
      method: 'POST',
      body: JSON.stringify({
        offlineId: 'probe-version-batch',
        fecha: PROX.toISOString(),
        decisiones: [
          {
            recurrenteId: pt.id,
            decision: 'NORMAL',
            proximaFecha: PROX.toISOString(),
            version: pt.updatedAt.toISOString(),
          },
        ],
      }),
    }),
  )
  expect(res.status).toBe(409)
  expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(0)
  expect(
    await db.historial.findUnique({
      where: { id: 'recurrentes-intento:probe-version-batch' },
    }),
  ).toBeNull()
})
it('dos apariciones del mismo habitual en el cuerpo se rechazan antes de crear pedidos o intento', async () => {
  const { pt } = await plantilla('probe-duplicado')
  const d = { recurrenteId: pt.id, decision: 'NORMAL' }
  const res = await POST(
    new NextRequest('http://localhost/api/pedidos/recurrentes', {
      method: 'POST',
      body: JSON.stringify({
        offlineId: 'probe-duplicado-batch',
        decisiones: [d, d],
      }),
    }),
  )
  expect(res.status).toBe(400)
  expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(0)
  expect(
    await db.historial.findUnique({
      where: { id: 'recurrentes-intento:probe-duplicado-batch' },
    }),
  ).toBeNull()
})
it('un lote histórico sin selección original verificable no se reconstruye ni genera el siguiente ciclo', async () => {
  const { pt } = await plantilla('probe-legacy')
  const r = await generarPedidosRecurrentes(
    [{ recurrenteId: pt.id, decision: 'NORMAL' }],
    PROX,
    { actor: { usuarioId: state.actor, proceso: 'hub' } },
  )
  await db.pedido.update({
    where: { id: r.generados[0].id },
    data: { recurrenteBatchId: 'probe-legacy-batch' },
  })
  const antes = await db.plantillaRecurrente.findUniqueOrThrow({
    where: { id: pt.id },
  })
  const res = await POST(
    new NextRequest('http://localhost/api/pedidos/recurrentes', {
      method: 'POST',
      body: JSON.stringify({
        offlineId: 'probe-legacy-batch',
        decisiones: [{ recurrenteId: pt.id, decision: 'NORMAL' }],
      }),
    }),
  )
  expect(res.status).toBe(409)
  expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(1)
  expect(
    (await db.plantillaRecurrente.findUniqueOrThrow({ where: { id: pt.id } }))
      .proxGeneracion,
  ).toEqual(antes.proxGeneracion)
  expect(
    await db.historial.findUnique({
      where: { id: 'recurrentes-intento:probe-legacy-batch' },
    }),
  ).toBeNull()
})
