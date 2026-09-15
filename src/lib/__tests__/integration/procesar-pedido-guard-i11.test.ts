// @tests N2 — guard I-11 en el camino de cierre de embarque
// (docs/pedidos/AGUA_BAMBU_N2_ALS_v2.0.md §3.4bis)
//
// Complementa gestionar-pendiente-integridad.test.ts (que prueba el guard vía
// EntregarPedidoUseCase). Acá se prueba el segundo camino que también debía
// cerrarse antes de considerar el guard completo: el cierre de embarque
// (CerrarEmbarqueUseCase → procesar-pedido.service.ts, rama PARCIAL/COMPLETO).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, createTestCliente, getAdminUser } from './setup'
import { GestionarPendienteUseCase } from '@/modules/embarques/application/use-cases/GestionarPendienteUseCase'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

function buildCierre() {
  return new CerrarEmbarqueUseCase(
    new PrismaEmbarqueRepository(),
    new PrismaGastoEmbarqueRepository(),
    new PrismaEmbarqueProductoRepository(),
    new PrismaTransactionManager(),
    adminId,
    'ADMIN',
  )
}

async function crearEmbarque() {
  const t = await testPrisma.trabajador.create({
    data: { nombre: `I11 ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  return testPrisma.embarque.create({
    data: { trabajadorId: t.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0 },
  })
}

/** Pedido de 10 BOTELLON, ya con 6 entregados (parcial previo), EN_RUTA en `embarqueId`. */
async function crearPedidoConBotellonesPendientes(embarqueId: string) {
  return testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'PUNTO',
      origen: 'PEDIDO',
      total: 65_000,
      totalPagado: 65_000,
      saldo: 0,
      // chk_pedido_estadopago_proyectado: pagado completo + EN_RUTA (aún no
      // entregado) → ANTICIPADO, no PAGADO.
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      estadoPago: 'ANTICIPADO',
      embarqueId,
      cBotellonFabPed: 10,
      cBotellonFabEnt: 6,
      precioBotellonFab: 6_500,
      items: { create: [{ producto: 'BOTELLON', cantPedido: 10, cantEntrega: 6, precio: 6_500, subtotal: 65_000 }] },
    },
  })
}

describe('N2 — guard I-11 en el cierre de embarque (procesar-pedido.service.ts)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await createTestCliente('GuardI11Cierre')
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  it('reconexión I-11: el cierre PARCIAL que invade cantidad bajo gestión activa se aplica al cumplimiento de la Obligación, no se rechaza', async () => {
    const emb = await crearEmbarque()
    const pedido = await crearPedidoConBotellonesPendientes(emb.id)

    // Gestionar 3 de los 4 pendientes (quedan 1 libre: 10 - 6 - 3 = 1).
    const { obligacionId, actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 3, modoInicial: 'PUNTO', usuarioId: adminId,
    })

    // El cierre entrega 4 más: 1 cae en zona ordinaria, 3 en zona reservada
    // — ya NO se rechaza, se aplican como cumplimiento de la Obligación
    // (decisión del equipo, F4). 6+4=10 → Pedido ENTREGADO.
    const result = await buildCierre().execute({
      id: emb.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL',
        productosEntregados: { cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 4, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [],
      }],
      gastos: [],
      dineroEntregado: 0,
    })
    expect(result.caja).toBeDefined()

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(p.cBotellonFabEnt).toBe(10) // 6 + 4 — el Pedido sigue siendo la autoridad de cumplimiento
    expect(p.estadoEntrega).toBe('ENTREGADO')

    const obligacion = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacionId } })
    expect(obligacion.cantidadCumplida).toBe(3)
    expect(obligacion.cantidadAsignada).toBe(0)
    expect(obligacion.estado).toBe('CUMPLIDA')

    const actividad = await testPrisma.actividad.findUniqueOrThrow({ where: { id: actividadId } })
    expect(actividad.cantidadCumplida).toBe(3)
    expect(actividad.estado).toBe('CUMPLIDA')
  })

  it('permite el cierre PARCIAL de la cantidad que SÍ está libre (fuera de la gestión activa)', async () => {
    const emb = await crearEmbarque()
    const pedido = await crearPedidoConBotellonesPendientes(emb.id)

    await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 3, modoInicial: 'PUNTO', usuarioId: adminId,
    })

    // 10 - 6 - 3 = 1 unidad libre para el camino ordinario.
    const result = await buildCierre().execute({
      id: emb.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL',
        productosEntregados: { cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 1, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [],
      }],
      gastos: [],
      dineroEntregado: 0,
    })
    expect(result.caja).toBeDefined()

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(p.cBotellonFabEnt).toBe(7) // 6 + 1
  })
})
