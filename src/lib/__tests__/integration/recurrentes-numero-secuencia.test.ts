// @tests Incidente 2026-10-08 — numeración duplicada de pedidos recurrentes.
//
// En producción `Pedido.numero` tiene DOS generadores: el DEFAULT de la
// columna (`"Pedido_numero_seq"`, quedó en 86) y la secuencia de la app
// (`pedido_numero_seq`, en 323) que usa `getNextNumero`. Los recurrentes se
// insertaban sin `numero` → tomaban el DEFAULT y reutilizaban números
// existentes (#1, #2, #85, #86 duplicados).
//
// Contra Postgres real: se reproduce el desfase de producción (DEFAULT muy
// atrás de la secuencia de la app) y se exige que el recurrente reciba un
// número nuevo, mayor que el último pedido creado, y que nunca colisione.
// También fija que la generación avanza el calendario de la plantilla.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { generarPedidosRecurrentes } from '@/lib/recurrentes'
import { getNextNumero } from '@/lib/sequence'

describe('Recurrentes — Pedido.numero usa la secuencia de la app', () => {
  let clienteId: string
  let plantillaId: string
  let numeroNormal: number
  const prox = new Date('2026-09-01T12:00:00Z') // martes

  beforeAll(async () => {
    await resetAndSeed()
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Num Rec',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1',
        limitePedidosFiados: 999,
        activo: true,
      },
    })
    clienteId = c.id

    // Pedido "normal" con el número de la app.
    numeroNormal = await testPrisma.$transaction(tx => getNextNumero(tx, { model: 'pedido' }))
    await testPrisma.pedido.create({
      data: {
        numero: numeroNormal,
        clienteId,
        canal: 'DOMICILIO',
        origen: 'PEDIDO',
        total: 2500,
        saldo: 2500,
        items: { create: [{ producto: 'PACA_AGUA', cantPedido: 1, precio: 2500, subtotal: 2500 }] },
      },
    })

    // Estado de producción: el DEFAULT legacy quedó por detrás y su próximo
    // valor cae justo sobre un pedido existente (así nacieron #85/#86).
    await testPrisma.$executeRawUnsafe(`SELECT setval('"Pedido_numero_seq"', ${numeroNormal - 1}, true)`)

    const pl = await testPrisma.plantillaRecurrente.create({
      data: {
        clienteId,
        activo: true,
        cadaNDias: 1,
        tipo: 'ENVIO',
        canal: 'DOMICILIO',
        proxGeneracion: prox,
        ultimaGeneracion: null,
        productos: { create: [{ producto: 'PACA_AGUA', cantidad: 5 }] }, // mínimo 3 pacas
      },
    })
    plantillaId = pl.id

    const r = await generarPedidosRecurrentes([{ recurrenteId: plantillaId, decision: 'NORMAL' }], prox)
    expect(r.generados).toHaveLength(1)
  })

  afterAll(async () => { await disconnect() })

  it('el recurrente recibe un número nuevo, mayor que el último pedido', async () => {
    const rec = await testPrisma.pedido.findFirstOrThrow({ where: { clienteId, origen: 'RECURRENTE' } })
    expect(rec.numero).toBeGreaterThan(numeroNormal)
  })

  it('no hay números de pedido duplicados', async () => {
    const dups = await testPrisma.$queryRawUnsafe<Array<{ numero: number }>>(
      `SELECT numero FROM "Pedido" GROUP BY numero HAVING COUNT(*) > 1`,
    )
    expect(dups).toEqual([])
  })

  it('el recurrente tiene exactamente una factura', async () => {
    const rec = await testPrisma.pedido.findFirstOrThrow({ where: { clienteId, origen: 'RECURRENTE' } })
    expect(await testPrisma.factura.count({ where: { pedidoId: rec.id } })).toBe(1)
  })

  it('la generación avanza el calendario de la plantilla', async () => {
    const pl = await testPrisma.plantillaRecurrente.findUniqueOrThrow({ where: { id: plantillaId } })
    expect(pl.ultimaGeneracion?.getTime()).toBe(prox.getTime())
    expect(pl.proxGeneracion!.getTime()).toBeGreaterThan(prox.getTime())
  })
})
