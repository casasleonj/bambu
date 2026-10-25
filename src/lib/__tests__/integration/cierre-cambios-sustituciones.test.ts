// @tests #446 (épica #447, Fase C) — «cambios» del cierre = Σ sustituciones registradas.
//
// Contra Postgres real:
//   1. El hueco del hallazgo: `cambios: 3` tecleado sin ninguna sustitución ya NO baja
//      el faltante; con el cierre V2 se rechaza (CAMBIOS_NO_COINCIDEN) y no deja efectos.
//   2. Con sustituciones registradas, el cierre usa la suma y concilia.
//   3. Un número tecleado distinto de la suma (incluso 0) se rechaza.
//   4. Un producto con sustituciones que no venía en la lista se agrega y se persiste.
//   5. Cierre V1 (sin la bandera): el número tecleado sigue valiendo (compat. flag OFF).
//   6. Señales: cambio a cliente sin pedido y cambio sin destino.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, getSeededCliente, uniqueId } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { construirMovimientosSustitucion } from '@/modules/embarques/domain/services/ledger-fisico.service'

let adminId: string
let clienteId: string

function cerrarUC() {
  return new CerrarEmbarqueUseCase(
    new PrismaEmbarqueRepository(),
    new PrismaGastoEmbarqueRepository(),
    new PrismaEmbarqueProductoRepository(),
    new PrismaTransactionManager(),
    adminId,
    'ADMIN',
  )
}

async function crearEmbarque(cargadas = 20) {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `Integ ${uniqueId('t')}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  return testPrisma.embarque.create({
    data: {
      trabajadorId: trabajador.id,
      fecha: new Date(),
      estado: 'EN_RUTA',
      baseDinero: 0,
      productos: { create: [{ producto: 'PACA_AGUA', cargadas }] },
    },
  })
}

async function crearPedido(embarqueId: string) {
  return testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      estadoPago: 'PENDIENTE',
      total: 23000,
      totalPagado: 0,
      saldo: 23000,
      cPacaAguaPed: 10,
      precioPacaAgua: 2300,
      embarqueId,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0, precio: 2300, subtotal: 23000 }] },
    },
  })
}

async function registrarSustitucion(
  embarqueId: string,
  producto: string,
  cantidad: number,
  destino: { pedidoId?: string; clienteId?: string } = {},
) {
  const { recepcion, entrega } = construirMovimientosSustitucion({ producto, cantidad })
  const mr = await testPrisma.embarqueMovimiento.create({
    data: { embarqueId, tipo: recepcion.tipo, producto, cantidad, origen: recepcion.origen ?? null, destino: recepcion.destino ?? null },
  })
  const me = await testPrisma.embarqueMovimiento.create({
    data: { embarqueId, tipo: entrega.tipo, producto, cantidad, origen: entrega.origen ?? null, destino: entrega.destino ?? null },
  })
  return testPrisma.sustitucion.create({
    data: {
      embarqueId,
      pedidoId: destino.pedidoId ?? null,
      clienteId: destino.clienteId ?? null,
      movimientoRecepcionId: mr.id,
      movimientoEntregaId: me.id,
    },
  })
}

// El pedido no se entrega: así la conciliación aísla los «cambios» (entregadas = 0).
const noEntregado = (pedidoId: string) => ({ pedidoId, entregado: 'NO_ENTREGADO' as const, pagos: [] })

const retorno = (cambios: number, devueltas = 0) => [{ producto: 'PACA_AGUA', devueltas, cambios, rotas: 0 }]

async function mensajeDe(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'NO_LANZO'
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

describe('Cierre — cambios = Σ sustituciones (#446)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await getSeededCliente()).id
  })
  afterAll(async () => {
    await disconnect()
  })

  it('el hueco: cambios 3 sin sustituciones se rechaza (V2) y no deja efectos', async () => {
    const e = await crearEmbarque()
    const p = await crearPedido(e.id)
    const msg = await mensajeDe(
      cerrarUC().execute({ id: e.id, pedidos: [noEntregado(p.id)], productosRetorno: retorno(3), cambiosDesdeSustituciones: true }),
    )
    expect(msg).toMatch(/^CAMBIOS_NO_COINCIDEN/)
    expect(msg).toContain('PACA_AGUA')
    const post = await testPrisma.embarque.findUniqueOrThrow({ where: { id: e.id } })
    expect(post.estado).toBe('EN_RUTA')
  })

  it('compat. V1: sin la bandera el número tecleado sigue valiendo (flag OFF no cambia)', async () => {
    const e = await crearEmbarque()
    const p = await crearPedido(e.id)
    const r = await cerrarUC().execute({ id: e.id, pedidos: [noEntregado(p.id)], productosRetorno: retorno(3), dryRun: true })
    // 20 cargadas − 3 cambios tecleados = 17 de faltante (con 0 cambios serían 20).
    expect(r.discrepanciaTotal).toBe(17)
  })

  it('con 2 sustituciones registradas y cambios 2: usa la suma y concilia', async () => {
    const e = await crearEmbarque()
    const p = await crearPedido(e.id)
    await registrarSustitucion(e.id, 'PACA_AGUA', 1, { pedidoId: p.id })
    await registrarSustitucion(e.id, 'PACA_AGUA', 1, { pedidoId: p.id })
    const r = await cerrarUC().execute({
      id: e.id, pedidos: [noEntregado(p.id)], productosRetorno: retorno(2), cambiosDesdeSustituciones: true, dryRun: true,
    })
    expect(r.discrepanciaTotal).toBe(18) // 20 cargadas − 2 cambios registrados
    expect(r.senales ?? []).toEqual([])
  })

  it('tecleó 0 pero hay sustituciones registradas: se rechaza (no se corrige en silencio)', async () => {
    const e = await crearEmbarque()
    const p = await crearPedido(e.id)
    await registrarSustitucion(e.id, 'PACA_AGUA', 2, { pedidoId: p.id })
    const msg = await mensajeDe(
      cerrarUC().execute({ id: e.id, pedidos: [noEntregado(p.id)], productosRetorno: retorno(0), cambiosDesdeSustituciones: true }),
    )
    expect(msg).toMatch(/^CAMBIOS_NO_COINCIDEN.*tecleaste 0, hay 2/)
  })

  it('un producto con sustituciones que no venía en la lista se agrega y se persiste', async () => {
    const e = await crearEmbarque()
    await testPrisma.embarqueProducto.create({ data: { embarqueId: e.id, producto: 'BOTELLON', cargadas: 5 } })
    const p = await crearPedido(e.id)
    await registrarSustitucion(e.id, 'BOTELLON', 2, { pedidoId: p.id })
    await cerrarUC().execute({
      id: e.id,
      pedidos: [noEntregado(p.id)],
      productosRetorno: retorno(0),
      cambiosDesdeSustituciones: true,
    })
    const bot = await testPrisma.embarqueProducto.findFirstOrThrow({ where: { embarqueId: e.id, producto: 'BOTELLON' } })
    expect(bot.cambios).toBe(2)
  })

  it('señales: cambio a cliente sin pedido y cambio sin destino', async () => {
    const e = await crearEmbarque()
    const p = await crearPedido(e.id)
    await registrarSustitucion(e.id, 'PACA_AGUA', 1, { clienteId })
    await registrarSustitucion(e.id, 'PACA_AGUA', 1)
    const r = await cerrarUC().execute({
      id: e.id, pedidos: [noEntregado(p.id)], productosRetorno: retorno(2), cambiosDesdeSustituciones: true, dryRun: true,
    })
    const codigos = (r.senales ?? []).map((s) => s.codigo)
    expect(codigos).toContain('CAMBIO_A_CLIENTE_SIN_PEDIDO')
    expect(codigos).toContain('CAMBIO_SIN_DESTINO')
  })
})
