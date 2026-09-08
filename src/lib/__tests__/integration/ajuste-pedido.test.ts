// @tests FASE FINAL — ajuste de pedido (§6 "PEDIDO:pedidoId")
// Dos ajustes concurrentes del mismo pedido se serializan bajo el lock del
// pedido; cada uno registra su PedidoCantidadAjuste con autorización.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, uniqueId } from './setup'
import { AjustarPedidoCantidadUseCase } from '@/modules/pedidos/application/use-cases/AjustarPedidoCantidadUseCase'
import { ProyectarAjusteCantidadUseCase } from '@/modules/pedidos/application/use-cases/ProyectarAjusteCantidadUseCase'
import { calcularEstadoPago } from '@/modules/pedidos/domain/services/pagos-calculator.service'

describe('FASE FINAL — ajuste de pedido (§6)', () => {
  let adminId: string
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    adminId = admin.id
    const cliente = await testPrisma.cliente.findFirst()
    if (!cliente) throw new Error('No cliente — ¿corriste seed-test?')
    clienteId = cliente.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('dos ajustes concurrentes del mismo pedido se serializan (2 registros)', async () => {
    const pedido = await testPrisma.pedido.create({
      // total=0/totalPagado=0 (default) → PENDIENTE (default estadoEntrega)
      // proyecta ANTICIPADO (chk_pedido_estadopago_proyectado).
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'ANTICIPADO' },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_AGUA', cantPedido: 10 },
    })
    const useCase = new AjustarPedidoCantidadUseCase()

    const resultados = await Promise.allSettled([
      useCase.execute({
        pedidoId: pedido.id,
        producto: 'PACA_AGUA',
        cantidadNueva: 12,
        motivo: 'ajuste 1',
        autorizadoPorId: adminId,
        offlineId: uniqueId('ajuste-a'),
      }),
      useCase.execute({
        pedidoId: pedido.id,
        producto: 'PACA_AGUA',
        cantidadNueva: 11,
        motivo: 'ajuste 2',
        autorizadoPorId: adminId,
        offlineId: uniqueId('ajuste-b'),
      }),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(2)

    const ajustes = await testPrisma.pedidoCantidadAjuste.findMany({
      where: { pedidoId: pedido.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(ajustes).toHaveLength(2)
    // El lock serializa: el que corre PRIMERO lee cantidadOriginal=10 (el
    // real, sin fabricar). El que corre SEGUNDO debe encadenarse sobre el
    // resultado real del primero (ya aplicado en vivo) — NUNCA los dos
    // partiendo del mismo 10, porque eso significaría que el segundo no vio
    // la corrección del primero.
    expect(ajustes[0].cantidadOriginal).toBe(10)
    expect(ajustes[1].cantidadOriginal).toBe(ajustes[0].cantidadNueva)
    expect(ajustes[1].cantidadOriginal).not.toBe(10)

    // El estado final de PedidoItem.cantPedido es el del último ajuste aplicado.
    const item = await testPrisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    expect(item.cantPedido).toBe(ajustes[1].cantidadNueva)
  })

  it('cantidadOriginal se lee del PedidoItem real, no del cliente', async () => {
    const pedido = await testPrisma.pedido.create({
      // total=0/totalPagado=0 (default) → PENDIENTE (default estadoEntrega)
      // proyecta ANTICIPADO (chk_pedido_estadopago_proyectado).
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'ANTICIPADO' },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_HIELO', cantPedido: 7 },
    })
    const useCase = new AjustarPedidoCantidadUseCase()

    const result = await useCase.execute({
      pedidoId: pedido.id,
      producto: 'PACA_HIELO',
      cantidadNueva: 9,
      motivo: 'ajuste',
      autorizadoPorId: adminId,
      offlineId: uniqueId('ajuste-real'),
    })

    const ajuste = await testPrisma.pedidoCantidadAjuste.findUnique({
      where: { id: result.ajusteId },
    })
    expect(ajuste?.cantidadOriginal).toBe(7)
    expect(ajuste?.delta).toBe(2)
  })

  it('retry con el mismo offlineId no duplica el ajuste', async () => {
    const pedido = await testPrisma.pedido.create({
      // total=0/totalPagado=0 (default) → PENDIENTE (default estadoEntrega)
      // proyecta ANTICIPADO (chk_pedido_estadopago_proyectado).
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'ANTICIPADO' },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_AGUA', cantPedido: 4 },
    })
    const useCase = new AjustarPedidoCantidadUseCase()
    const offlineId = uniqueId('ajuste-retry')

    const input = {
      pedidoId: pedido.id,
      producto: 'PACA_AGUA',
      cantidadNueva: 6,
      motivo: 'retry',
      autorizadoPorId: adminId,
      offlineId,
    }

    const [r1, r2] = await Promise.all([useCase.execute(input), useCase.execute(input)])

    const deduped = [r1, r2].filter((r) => r.deduped)
    expect(deduped).toHaveLength(1)

    const count = await testPrisma.pedidoCantidadAjuste.count({ where: { offlineId } })
    expect(count).toBe(1)
  })

  it('rechaza ajuste sin autorización', async () => {
    const pedido = await testPrisma.pedido.create({
      // total=0/totalPagado=0 (default) → PENDIENTE (default estadoEntrega)
      // proyecta ANTICIPADO (chk_pedido_estadopago_proyectado).
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'ANTICIPADO' },
    })
    const useCase = new AjustarPedidoCantidadUseCase()

    await expect(
      useCase.execute({
        pedidoId: pedido.id,
        producto: 'PACA_AGUA',
        cantidadNueva: 6,
        motivo: 'sin autorizacion',
        autorizadoPorId: '',
      }),
    ).rejects.toThrow(/AJUSTE_EXIGE_AUTORIZACION/)
  })

  // G11 (decisión PO 2026-09-06, "A. Corrección"): la corrección se aplica
  // en vivo (PedidoItem/Pedido/Factura), no solo se registra el audit trail.
  it('aplica la corrección en vivo: PedidoItem, Pedido.total/saldo y Factura se sincronizan', async () => {
    const total = 10 * 6_500
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', total, totalPagado: 6_500, saldo: total - 6_500,
        estadoPago: 'PARCIAL',
      },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_AGUA', cantPedido: 10, precio: 6_500, subtotal: total },
    })
    const facturaNum = `FAC-T${Math.floor(Math.random() * 1e7)}`
    await testPrisma.factura.create({
      data: { numero: facturaNum, clienteId, pedidoId: pedido.id, subtotal: total, total, saldo: total - 6_500, montoPagado: 6_500, estado: 'PARCIAL' },
    })

    const useCase = new AjustarPedidoCantidadUseCase()
    // Corrección: en realidad eran 8, no 10 (error de captura). Precio
    // histórico ($6.500/u) NUNCA cambia, solo la cantidad.
    await useCase.execute({
      pedidoId: pedido.id,
      producto: 'PACA_AGUA',
      cantidadNueva: 8,
      motivo: 'error de captura: eran 8, no 10',
      autorizadoPorId: adminId,
      offlineId: uniqueId('ajuste-vivo'),
    })

    const item = await testPrisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    expect(item.cantPedido).toBe(8)
    expect(Number(item.precio)).toBe(6_500) // precio histórico intacto
    expect(Number(item.subtotal)).toBe(8 * 6_500)

    const pedidoActualizado = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(pedidoActualizado.total)).toBe(8 * 6_500)
    expect(Number(pedidoActualizado.saldo)).toBe(8 * 6_500 - 6_500)
    expect(pedidoActualizado.estadoPago).toBe('PARCIAL')

    const factura = await testPrisma.factura.findUniqueOrThrow({ where: { pedidoId: pedido.id } })
    expect(Number(factura.total)).toBe(8 * 6_500)
    expect(Number(factura.saldo)).toBe(8 * 6_500 - 6_500)
  })

  // G11 "C": la cantidad ya entregada es cumplimiento histórico, nunca se
  // toca retroactivamente. No es un error de captura corregible — es
  // demanda nueva (nuevo Pedido con pedidoOrigenId).
  it('rechaza corrección sobre un producto con cantidad ya entregada', async () => {
    const pedido = await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'PARCIAL', totalPagado: 6_500, total: 65_000, saldo: 58_500 },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 6, precio: 6_500, subtotal: 65_000 },
    })
    const useCase = new AjustarPedidoCantidadUseCase()

    await expect(
      useCase.execute({
        pedidoId: pedido.id,
        producto: 'PACA_AGUA',
        cantidadNueva: 12,
        motivo: 'el cliente pide más',
        autorizadoPorId: adminId,
      }),
    ).rejects.toThrow('CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA')
  })

  // G11 "D": un Pedido cerrado no se reabre silenciosamente.
  it('rechaza corrección sobre un Pedido ya ENTREGADO (cerrado)', async () => {
    const pedido = await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO', totalPagado: 65_000, total: 65_000, saldo: 0 },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 10, precio: 6_500, subtotal: 65_000 },
    })
    const useCase = new AjustarPedidoCantidadUseCase()

    await expect(
      useCase.execute({
        pedidoId: pedido.id,
        producto: 'PACA_AGUA',
        cantidadNueva: 8,
        motivo: 'intento de corrección tardía',
        autorizadoPorId: adminId,
      }),
    ).rejects.toThrow('CORRECCION_PEDIDO_CERRADO')
  })

  // Protege chk_pedido_montopagado_le_total: una corrección a la baja no
  // puede dejar totalPagado > total sin una reversión monetaria primero.
  it('rechaza una corrección a la baja que dejaría totalPagado > total', async () => {
    const pedido = await testPrisma.pedido.create({
      // total=totalPagado (pagado completo) + estadoEntrega PENDIENTE
      // (default) → ANTICIPADO, no PAGADO (chk_pedido_estadopago_proyectado).
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'ANTICIPADO', totalPagado: 65_000, total: 65_000, saldo: 0 },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_AGUA', cantPedido: 10, precio: 6_500, subtotal: 65_000 },
    })
    const useCase = new AjustarPedidoCantidadUseCase()

    await expect(
      useCase.execute({
        pedidoId: pedido.id,
        producto: 'PACA_AGUA',
        cantidadNueva: 5, // 5*6500=32500 < totalPagado 65000
        motivo: 'en realidad eran solo 5',
        autorizadoPorId: adminId,
      }),
    ).rejects.toThrow('CORRECCION_GENERARIA_SOBREPAGO')
  })
})

// Fase 6-0 (docs/pedidos/fase6-g11-flujo-plan.md §2/§3): proyección read-only
// del ajuste. La proyección replica la aritmética del commit sin mutar; el
// commit re-valida el estado fresco aunque exista un preview previo.
describe('Fase 6-0 — ProyectarAjusteCantidadUseCase (proyección read-only)', () => {
  let adminId: string
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const cliente = await testPrisma.cliente.findFirst()
    if (!cliente) throw new Error('No cliente — ¿corriste seed-test?')
    clienteId = cliente.id
  })
  afterAll(async () => { await disconnect() })

  async function crearPedido(cantPedido: number, precio: number, totalPagado: number) {
    const total = cantPedido * precio
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', total, totalPagado, saldo: total - totalPagado,
        estadoPago: calcularEstadoPago(total, totalPagado, 'PENDIENTE'),
      },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_AGUA', cantPedido, precio, subtotal: total },
    })
    return pedido
  }

  async function snapshot(pedidoId: string) {
    const [pedido, items, factura] = await Promise.all([
      testPrisma.pedido.findUnique({ where: { id: pedidoId } }),
      testPrisma.pedidoItem.findMany({ where: { pedidoId }, orderBy: { producto: 'asc' } }),
      testPrisma.factura.findUnique({ where: { pedidoId } }),
    ])
    return JSON.stringify({ pedido, items, factura })
  }

  it('proyección == commit real campo a campo (subir cantidad)', async () => {
    const pedido = await crearPedido(10, 6_500, 6_500)
    const proy = await new ProyectarAjusteCantidadUseCase().execute({
      pedidoId: pedido.id, producto: 'PACA_AGUA', cantidadNueva: 12,
    })
    expect(proy.bloqueadoPor).toBeNull()
    expect(proy.puedeCorregir).toBe(true)

    await new AjustarPedidoCantidadUseCase().execute({
      pedidoId: pedido.id, producto: 'PACA_AGUA', cantidadNueva: 12,
      motivo: 'proyección vs commit', autorizadoPorId: adminId, offlineId: uniqueId('f60-a'),
    })
    const item = await testPrisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    const ped = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(item.subtotal)).toBe(proy.subtotalDespues)
    expect(Number(item.precio)).toBe(proy.precioHistorico)
    expect(Number(ped.total)).toBe(proy.totalDespues)
    expect(Number(ped.saldo)).toBe(proy.saldoDespues)
    expect(ped.estadoPago).toBe(proy.estadoPagoDespues)
  })

  it('read-only: N proyecciones consecutivas no cambian nada', async () => {
    const pedido = await crearPedido(8, 6_500, 0)
    const antes = await snapshot(pedido.id)
    const p = new ProyectarAjusteCantidadUseCase()
    for (const q of [10, 3, 20, 8]) {
      await p.execute({ pedidoId: pedido.id, producto: 'PACA_AGUA', cantidadNueva: q })
    }
    expect(await snapshot(pedido.id)).toBe(antes)
  })

  it('proyecta el guard SOBREPAGO sin tocar el pedido', async () => {
    const pedido = await crearPedido(10, 6_500, 65_000) // pagado completo
    const antes = await snapshot(pedido.id)
    const proy = await new ProyectarAjusteCantidadUseCase().execute({
      pedidoId: pedido.id, producto: 'PACA_AGUA', cantidadNueva: 5,
    })
    expect(proy.bloqueadoPor).toBe('CORRECCION_GENERARIA_SOBREPAGO')
    expect(proy.sobrepagoProyectado).toBe(65_000 - 5 * 6_500)
    expect(await snapshot(pedido.id)).toBe(antes)
  })

  it('concurrencia (P8): un preview obsoleto no dirige la mutación — el commit parte del estado fresco', async () => {
    const pedido = await crearPedido(10, 6_500, 6_500)

    // Preview cuando cantPedido = 10.
    const proyObsoleta = await new ProyectarAjusteCantidadUseCase().execute({
      pedidoId: pedido.id, producto: 'PACA_AGUA', cantidadNueva: 8,
    })
    expect(proyObsoleta.cantidadOriginal).toBe(10)

    // Otro usuario corrige a 6 mientras tanto.
    await new AjustarPedidoCantidadUseCase().execute({
      pedidoId: pedido.id, producto: 'PACA_AGUA', cantidadNueva: 6,
      motivo: 'otro ajuste', autorizadoPorId: adminId, offlineId: uniqueId('f60-mid'),
    })

    // El commit original (cantidadNueva 8) se encadena sobre 6, no sobre 10.
    const r = await new AjustarPedidoCantidadUseCase().execute({
      pedidoId: pedido.id, producto: 'PACA_AGUA', cantidadNueva: 8,
      motivo: 'commit tras preview obsoleto', autorizadoPorId: adminId, offlineId: uniqueId('f60-late'),
    })
    const ajuste = await testPrisma.pedidoCantidadAjuste.findUniqueOrThrow({ where: { id: r.ajusteId } })
    expect(ajuste.cantidadOriginal).toBe(6) // estado fresco, no el 10 de la proyección
    expect(ajuste.delta).toBe(2)
    const ped = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(ped.total)).toBe(8 * 6_500)
  })
})
