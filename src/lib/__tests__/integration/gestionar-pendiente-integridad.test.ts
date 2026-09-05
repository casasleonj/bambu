// @tests N2 — GestionarPendienteUseCase (docs/pedidos/AGUA_BAMBU_N2_ALS_v2.0.md §3.1)
//
// Cubre, contra Postgres real: creación bajo demanda (nunca automática),
// cálculo/aplicación del diferencial (positivo y negativo), rechazo por
// cantidad excedida, no duplicar gestión activa, idempotencia por offlineId,
// y el guard I-11 (no doble cumplimiento Pedido-ordinario vs Actividad-gestionada).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, createTestCliente, getAdminUser } from './setup'
import { GestionarPendienteUseCase } from '@/modules/embarques/application/use-cases/GestionarPendienteUseCase'
import { EntregarPedidoUseCase } from '@/modules/pedidos/application/use-cases/EntregarPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { calcularEstadoPago } from '@/modules/pedidos/domain/services/pagos-calculator.service'

let adminId: string
let clienteId: string

/**
 * Pedido con 10 BOTELLON pendientes (6 ya entregados), canal PUNTO, precio
 * histórico $6.500/u. `estadoEntrega` param permite EN_RUTA (para poder
 * ejercer EntregarPedidoUseCase, que exige PENDIENTE→EN_RUTA→ENTREGADO) o
 * PENDIENTE (default, para los tests que solo gestionan el pendiente).
 */
async function crearPedidoConBotellonesPendientes(
  entregados: number,
  pedidos: number,
  estadoEntrega: 'PENDIENTE' | 'EN_RUTA' = 'PENDIENTE',
) {
  const precioHistorico = 6500
  const total = pedidos * precioHistorico
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'PUNTO',
      origen: 'PEDIDO',
      tipo: 'PUNTO',
      total,
      totalPagado: total,
      saldo: 0,
      estadoEntrega,
      estado: estadoEntrega,
      // chk_pedido_estadopago_proyectado: pagado completo + entrega aún no
      // ocurrida (PENDIENTE/EN_RUTA) → ANTICIPADO, no PAGADO.
      estadoPago: calcularEstadoPago(total, total, estadoEntrega),
      cBotellonFabPed: pedidos,
      cBotellonFabEnt: entregados,
      precioBotellonFab: precioHistorico,
      items: {
        create: [{
          producto: 'BOTELLON', cantPedido: pedidos, cantEntrega: entregados,
          precio: precioHistorico, subtotal: total,
        }],
      },
    },
    include: { items: true },
  })
  const facturaNum = `FAC-T${Math.floor(Math.random() * 1e7)}`
  await testPrisma.factura.create({
    data: {
      numero: facturaNum, clienteId, pedidoId: pedido.id,
      subtotal: total, total, saldo: 0, montoPagado: total, estado: 'PAGADA',
    },
  })
  return pedido
}

function buildEntregarUseCase() {
  return new EntregarPedidoUseCase(
    new PrismaPedidoRepository(),
    new PrismaFacturaRepository(),
    new PrismaPagoRepository(),
    new PrismaTransactionManager(),
  )
}

describe('N2 — GestionarPendienteUseCase', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await createTestCliente('GestionarPendiente')
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  it('mismo modo que el canal original → sin diferencial', async () => {
    const pedido = await crearPedidoConBotellonesPendientes(6, 10)
    const result = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })
    expect(result.deduped).toBe(false)
    expect(result.diferencial).toBeUndefined()

    const obligacion = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: result.obligacionId } })
    expect(obligacion.cantidadOriginal).toBe(4)
    expect(obligacion.estado).toBe('ABIERTA')
    // Regresión (encontrada al implementar LiberarActividadUseCase): la
    // Actividad creada reclama la cantidad completa de inmediato —
    // cantidadAsignada debe reflejarlo desde el instante de creación, no
    // quedar en 0 (violaría el invariante y chk_obligacion_cantidades_no_negativas
    // al liberar/decrementar más tarde).
    expect(obligacion.cantidadAsignada).toBe(4)

    const actividad = await testPrisma.actividad.findUniqueOrThrow({ where: { id: result.actividadId } })
    expect(actividad.modo).toBe('PUNTO')
    expect(actividad.estado).toBe('ASIGNADA')

    // Pedido/Pedido.total NO se tocaron (I-4).
    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.total)).toBe(Number(pedido.total))
  })

  it('modo DOMICILIO sobre canal PUNTO → diferencial positivo aplicado a Pedido.total/Factura', async () => {
    const pedido = await crearPedidoConBotellonesPendientes(6, 10) // 4 pendientes, $6.500/u histórico
    const result = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'DOMICILIO', usuarioId: adminId,
    })
    // histórico 4*6500=26000, actual DOMICILIO 4*(6500+2500)=36000 → diferencial +10000
    expect(result.diferencial).toEqual({ valorHistorico: 26_000, valorActual: 36_000, diferencial: 10_000 })

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.total)).toBe(Number(pedido.total) + 10_000)
    expect(Number(p.totalPagado)).toBe(Number(pedido.totalPagado)) // sin cambios
    expect(Number(p.saldo)).toBe(10_000) // el diferencial queda como saldo cobrable

    const factura = await testPrisma.factura.findUniqueOrThrow({ where: { pedidoId: pedido.id } })
    expect(Number(factura.saldo)).toBe(10_000)
    expect(factura.estado).toBe('PARCIAL')

    const ajuste = await testPrisma.pedidoCantidadAjuste.findFirstOrThrow({ where: { obligacionId: result.obligacionId } })
    expect(Number(ajuste.montoDiferencial)).toBe(10_000)
    expect(ajuste.delta).toBe(0) // no cambia cantidad, solo precio
  })

  it('diferencial negativo → Cliente.saldoFavor sube, Pedido.total NO cambia', async () => {
    // Histórico caro ($9.500/u) → actual DOMICILIO ($9.000/u) → diferencial negativo.
    const total = 10 * 9500
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'PUNTO', origen: 'PEDIDO', tipo: 'PUNTO',
        total, totalPagado: total, saldo: 0,
        estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE', estadoPago: 'ANTICIPADO',
        cBotellonFabPed: 10, cBotellonFabEnt: 6, precioBotellonFab: 9500,
        items: { create: [{ producto: 'BOTELLON', cantPedido: 10, cantEntrega: 6, precio: 9500, subtotal: total }] },
      },
    })
    const clienteAntes = await testPrisma.cliente.findUniqueOrThrow({ where: { id: clienteId } })

    const result = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'DOMICILIO', usuarioId: adminId,
    })
    // histórico 4*9500=38000, actual 4*9000=36000 → diferencial -2000
    expect(result.diferencial?.diferencial).toBe(-2_000)

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.total)).toBe(total) // NUNCA se baja

    const clienteDespues = await testPrisma.cliente.findUniqueOrThrow({ where: { id: clienteId } })
    expect(Number(clienteDespues.saldoFavor) - Number(clienteAntes.saldoFavor)).toBe(2_000)
  })

  it('rechaza si la cantidad excede el remanente', async () => {
    const pedido = await crearPedidoConBotellonesPendientes(6, 10) // 4 pendientes
    await expect(
      new GestionarPendienteUseCase().execute({
        pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 5, modoInicial: 'PUNTO', usuarioId: adminId,
      }),
    ).rejects.toThrow('CANTIDAD_EXCEDE_PENDIENTE')
  })

  it('rechaza una segunda gestión mientras la primera sigue ABIERTA', async () => {
    const pedido = await crearPedidoConBotellonesPendientes(6, 10)
    await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 2, modoInicial: 'PUNTO', usuarioId: adminId,
    })
    await expect(
      new GestionarPendienteUseCase().execute({
        pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 1, modoInicial: 'PUNTO', usuarioId: adminId,
      }),
    ).rejects.toThrow('OBLIGACION_YA_ACTIVA')
  })

  it('idempotencia: replay con el mismo offlineId no duplica', async () => {
    const pedido = await crearPedidoConBotellonesPendientes(6, 10)
    const offlineId = `gp-${pedido.id}`
    const input = { pedidoId: pedido.id, producto: 'BOTELLON' as const, cantidad: 4, modoInicial: 'PUNTO' as const, usuarioId: adminId, offlineId }

    const r1 = await new GestionarPendienteUseCase().execute(input)
    const r2 = await new GestionarPendienteUseCase().execute(input)

    expect(r1.deduped).toBe(false)
    expect(r2.deduped).toBe(true)
    expect(r2.obligacionId).toBe(r1.obligacionId)
    expect(await testPrisma.obligacionPendiente.count({ where: { pedidoId: pedido.id } })).toBe(1)
  })

  it('guard I-11: la entrega ordinaria no puede invadir cantidad bajo gestión activa', async () => {
    const pedido = await crearPedidoConBotellonesPendientes(6, 10, 'EN_RUTA') // 4 pendientes
    // Gestionar 3 de los 4 pendientes.
    await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 3, modoInicial: 'PUNTO', usuarioId: adminId,
    })

    // El flujo ordinario intenta entregar las 4 unidades pendientes (como si
    // no supiera de la gestión activa) — debe rechazar, porque solo queda
    // 1 unidad fuera de la Obligación (10 - 3 reservadas - 6 ya entregadas = 1).
    await expect(
      buildEntregarUseCase().execute({
        pedidoId: pedido.id,
        itemsEntregados: [{ producto: 'BOTELLON', cantidad: 4 }],
        pagos: [],
      }),
    ).rejects.toThrow('SOBREPOSICION_CON_OBLIGACION_ACTIVA')

    // Pero SÍ puede entregar la unidad que queda libre (10 - 3 - 6 = 1).
    const res = await buildEntregarUseCase().execute({
      pedidoId: pedido.id,
      itemsEntregados: [{ producto: 'BOTELLON', cantidad: 1 }],
      pagos: [],
    })
    expect(res.deduped).toBeFalsy()
  })
})
