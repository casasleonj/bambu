// @tests ProcesarPedidoService — F4.10-a fix verification
// FIX: extrae ~119 líneas de CerrarEmbarqueUseCase.procesarPedido()
// a un domain service dedicado. Responsabilidad única: procesar UN
// pedido individual (entregado/parcial/no entregado).

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ProcesarPedidoService, type PedidoRawInput } from '../procesar-pedido.service'
import type { CerrarEmbarqueInput } from '../../../application/dto'

const servicePath = join(
  process.cwd(),
  'src/modules/embarques/domain/services/procesar-pedido.service.ts'
)
const useCasePath = join(
  process.cwd(),
  'src/modules/embarques/application/use-cases/CerrarEmbarqueUseCase.ts'
)

const serviceSource = readFileSync(servicePath, 'utf-8')
const useCaseSource = readFileSync(useCasePath, 'utf-8')

describe('F4.10-a: ProcesarPedidoService existe y es responsable', () => {
  it('FIX: el service existe con la firma esperada', () => {
    expect(serviceSource).toMatch(/export\s+class\s+ProcesarPedidoService/)
  })

  it('FIX: el service tiene un método execute() público', () => {
    expect(serviceSource).toMatch(/async\s+execute\s*\([\s\S]+?Promise<number>/)
  })

  it('FIX: hay un comentario F4.10-a explicando el refactor', () => {
    expect(serviceSource).toMatch(/FIX F4\.10-a/)
  })
})

describe('F4.10-a: el use case delega al service (no duplica lógica)', () => {
  it('FIX: el use case inyecta ProcesarPedidoService en el constructor', () => {
    expect(useCaseSource).toMatch(/private\s+readonly\s+procesarPedidoService:\s*ProcesarPedidoService/)
  })

  it('FIX: el use case tiene default = new ProcesarPedidoService() (backward compat)', () => {
    expect(useCaseSource).toMatch(/procesarPedidoService:\s*ProcesarPedidoService\s*=\s*new\s+ProcesarPedidoService\(\)/)
  })

  it('FIX: el loop del execute() llama a procesarPedidoService.execute()', () => {
    // Extraer el loop
    const loopMatch = useCaseSource.match(/for\s*\(const\s+cuadre\s+of\s+input\.pedidos\)[\s\S]+?\}/)
    expect(loopMatch).not.toBeNull()
    expect(loopMatch![0]).toMatch(/this\.procesarPedidoService\.execute\(/)
  })

  it('FIX: el use case ya NO tiene métodos privados de procesamiento de pedido', () => {
    // Los métodos que se movieron NO deben existir como private
    expect(useCaseSource).not.toMatch(/private\s+async\s+procesarPedido\(/)
    expect(useCaseSource).not.toMatch(/private\s+async\s+procesarNoEntregado\(/)
    expect(useCaseSource).not.toMatch(/private\s+async\s+updatePedidoItems\(/)
    expect(useCaseSource).not.toMatch(/private\s+async\s+logPrecioCierre\(/)
    expect(useCaseSource).not.toMatch(/private\s+async\s+crearPedidoHijo\(/)
  })
})

describe('F4.10-a: el service mantiene las responsabilidades', () => {
  it('FIX: ProcesarPedidoService.execute() retorna Promise<number> (totalReal)', () => {
    // El return type es number
    expect(serviceSource).toMatch(/async\s+execute\([\s\S]+?\):\s*Promise<number>/)
  })

  it('FIX: el service maneja los 3 casos: ENTREGADO, PARCIAL, NO_ENTREGADO', () => {
    // El execute tiene la lógica para los 3 casos
    expect(serviceSource).toMatch(/cuadre\.entregado\s*===\s*['"]NO_ENTREGADO['"]/)
    expect(serviceSource).toMatch(/cuadre\.entregado\s*===\s*['"]PARCIAL['"]/)
    // ENTREGADO es el caso default (no requiere if)
  })

  it('FIX: el service llama a updatePedidoItems internamente', () => {
    expect(serviceSource).toMatch(/this\.updatePedidoItems\(/)
  })

  it('FIX: el service llama a logPrecioCierre internamente', () => {
    expect(serviceSource).toMatch(/this\.logPrecioCierre\(/)
  })

  it('PR-1: la rama PARCIAL NO crea pedido hijo — tiene su propio branch', () => {
    expect(serviceSource).not.toMatch(/this\.crearPedidoHijo\(/)
    expect(serviceSource).toMatch(/this\.procesarEntregaParcial\(/)
  })
})

describe('F4.10-a: el use case se simplificó (807 → ~500 líneas)', () => {
  it('FIX: el use case ya no tiene las interfaces PreciosPedido ni ProductosEntregados', () => {
    // Esas interfaces se movieron al service
    expect(useCaseSource).not.toMatch(/^interface\s+PreciosPedido/m)
    expect(useCaseSource).not.toMatch(/^interface\s+ProductosEntregados/m)
  })

  it('FIX: el use case usa PedidoRawInput importado (o alias local) para fetchPedidosForEmbarque', () => {
    // Tras el refactor F4.10-f el use case importa PedidoRawInput desde
    // ProcesarPedidoService en lugar de declarar una interfaz duplicada.
    expect(useCaseSource).toMatch(/import\s+type\s+\{\s*PedidoRawInput\s*\}\s+from\s+['"]\.\.\/\.\.\/domain\/services\/procesar-pedido\.service['"]/)
    expect(useCaseSource).toMatch(/fetchPedidosForEmbarque\([^)]*\):\s*Promise<PedidoRawInput/)
  })
})

describe('F4.10-a: import correcto en el use case', () => {
  it('FIX: el use case importa ProcesarPedidoService del directorio correcto', () => {
    expect(useCaseSource).toMatch(
      /import\s+\{\s*ProcesarPedidoService\s*\}\s+from\s+['"]\.\.\/\.\.\/domain\/services\/procesar-pedido\.service['"]/
    )
  })
})

// PR-1 (integridad de entrega parcial): el cierre PARCIAL ya NO crea un pedido
// hijo para el faltante. El pendiente vive en el propio pedido: `cantEntrega`
// acumula, el pedido queda PENDIENTE y `embarqueId` se libera para
// re-planificación. `total`/`totalPagado`/`saldo` no se tocan.
// (Antes: BAMBU-LOG-004 verificaba que el hijo heredara negocioId/dirección —
// moot ahora, no hay hijo.)
describe('PR-1: el cierre PARCIAL no crea hijo y preserva la obligación económica', () => {
  function makePedidoRaw(overrides: Partial<PedidoRawInput> = {}): PedidoRawInput {
    return {
      id: 'ped_padre',
      numero: 42,
      clienteId: 'cli_1',
      negocioId: 'neg_1',
      direccionEntrega: 'Cra 10 #20-30',
      barrioEntrega: 'Centro',
      embarqueId: 'emb_1',
      embarqueOrigenId: null,
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      precioPacaAgua: 10000,
      precioPacaHielo: 0,
      precioBotellonFab: 0,
      precioBotellonDom: 0,
      precioBolsaAgua: 0,
      precioBolsaHielo: 0,
      cPacaAguaPed: 5,
      cPacaHieloPed: 0,
      cBotellonFabPed: 0,
      cBotellonDomPed: 0,
      cBolsaAguaPed: 0,
      cBolsaHieloPed: 0,
      cPacaAguaEnt: 0,
      cPacaHieloEnt: 0,
      cBotellonFabEnt: 0,
      cBotellonDomEnt: 0,
      cBolsaAguaEnt: 0,
      cBolsaHieloEnt: 0,
      total: 50000,
      totalPagado: 0,
      obs: null,
      createdById: null,
      items: [{ producto: 'PACA_AGUA' }],
      factura: null,
      ...overrides,
    }
  }

  function makeClient(hijoCreateSpy: ReturnType<typeof vi.fn>) {
    return {
      $queryRaw: vi.fn(),
      // FASE 8: getNextNumero ahora usa secuencia atómica (nextval).
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ nextval: BigInt(101) }]),
      pedido: {
        update: vi.fn(),
        create: hijoCreateSpy,
        aggregate: vi.fn().mockResolvedValue({ _max: { numero: 100 } }),
      },
      pago: { create: vi.fn() },
      config: { findUnique: vi.fn().mockResolvedValue(null) },
      factura: { update: vi.fn() },
      pedidoItem: { updateMany: vi.fn() },
      historial: { create: vi.fn() },
      embarque: { findUnique: vi.fn() },
    }
  }

  it('cierre PARCIAL: NO crea hijo; acumula cantEntrega, deja PENDIENTE, libera embarqueId, no toca total', async () => {
    const hijoCreateSpy = vi.fn().mockResolvedValue({ id: 'hijo_1', numero: 101 })
    const client = makeClient(hijoCreateSpy)
    const pedido = makePedidoRaw({ total: 50000 }) // 5 pacas x 10.000
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'PARCIAL',
      productosEntregados: {
        cPacaAguaEnt: 3, // 5 pedidas, 3 entregadas -> 2 pendientes
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        cBolsaAguaEnt: 0,
        cBolsaHieloEnt: 0,
      },
      pagos: [],
    }

    const service = new ProcesarPedidoService()
    await service.execute(client as never, pedido, cuadre, 'ADMIN', 'user_1', [], [])

    // NO se crea pedido hijo.
    expect(hijoCreateSpy).not.toHaveBeenCalled()

    // El pedido se actualiza: cantEntrega acumulado, PENDIENTE, embarqueId null.
    expect(client.pedido.update).toHaveBeenCalledTimes(1)
    const upd = (client.pedido.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data
    expect(upd.cPacaAguaEnt).toBe(3)
    expect(upd.estadoEntrega).toBe('PENDIENTE')
    expect(upd.embarqueId).toBeNull()
    // La obligación económica NO se toca.
    expect(upd.total).toBeUndefined()
    expect(upd.totalPagado).toBeUndefined()
    expect(upd.saldo).toBeUndefined()
    // No se registran pagos en la rama PARCIAL (PR-2 posee el cobro de misión).
    expect(client.pago.create).not.toHaveBeenCalled()
  })

  it('cierre PARCIAL que completa lo pedido → ENTREGADO (acumulado 3 previas + 2 ahora = 5)', async () => {
    const hijoCreateSpy = vi.fn().mockResolvedValue({ id: 'x', numero: 1 })
    const client = makeClient(hijoCreateSpy)
    const pedido = makePedidoRaw({ cPacaAguaEnt: 3 }) // re-planificado: ya 3/5
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'PARCIAL',
      productosEntregados: {
        cPacaAguaEnt: 2, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
        cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
      },
      pagos: [],
    }

    const service = new ProcesarPedidoService()
    await service.execute(client as never, pedido, cuadre, 'ADMIN', 'user_1', [], [])

    const upd = (client.pedido.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data
    expect(upd.cPacaAguaEnt).toBe(5) // 3 + 2
    expect(upd.estadoEntrega).toBe('ENTREGADO')
    expect(hijoCreateSpy).not.toHaveBeenCalled()
  })

  it('cierre PARCIAL que excede lo pedido (acumulado > cantPedido) → rechaza', async () => {
    const client = makeClient(vi.fn())
    const pedido = makePedidoRaw({ cPacaAguaEnt: 4 }) // ya 4/5
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'PARCIAL',
      productosEntregados: {
        cPacaAguaEnt: 3, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
        cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
      },
      pagos: [],
    }

    const service = new ProcesarPedidoService()
    await expect(
      service.execute(client as never, pedido, cuadre, 'ADMIN', 'user_1', [], []),
    ).rejects.toThrow(/ENTREGA_EXCEDE_PEDIDO/)
  })

  // PR-2b (F7): el guard es EXACTO (sin tolerancia %) porque la CHECK
  // `chk_pedido_montopagado_le_total` de Postgres es exacta; un guard laxo
  // dejaría pasar montos que abortan toda la tx del cierre por constraint.
  it('COMPLETO: cobro nuevo > saldo pendiente previo → PAGOS_EXCEDIDOS (antes del update)', async () => {
    const client = makeClient(vi.fn())
    const pedido = makePedidoRaw({ total: 100_000, totalPagado: 60_000 }) // saldo 40k
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'COMPLETO',
      productosEntregados: { cPacaAguaEnt: 5, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
      pagos: [{ metodo: 'EFECTIVO', monto: 45_000 }], // 45k > saldo 40k
    }
    await expect(
      new ProcesarPedidoService().execute(client as never, pedido, cuadre, 'ADMIN', 'user_1', [], []),
    ).rejects.toThrow(/PAGOS_EXCEDIDOS/)
    expect(client.pedido.update).not.toHaveBeenCalled()
    expect(client.pago.create).not.toHaveBeenCalled()
  })

  it('COMPLETO: cobra exactamente el saldo pendiente previo → totalPagado = total, saldo 0', async () => {
    const client = makeClient(vi.fn())
    const pedido = makePedidoRaw({ total: 100_000, totalPagado: 60_000 })
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'COMPLETO',
      productosEntregados: { cPacaAguaEnt: 5, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
      pagos: [{ metodo: 'EFECTIVO', monto: 40_000 }],
    }
    await new ProcesarPedidoService().execute(client as never, pedido, cuadre, 'ADMIN', 'user_1', [], [])
    const upd = (client.pedido.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data
    expect(upd.totalPagado).toBe(100_000)
    expect(upd.saldo).toBe(0)
    expect(client.pago.create).toHaveBeenCalledTimes(1)
    expect((client.pago.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data.embarqueId).toBe('emb_1')
  })

  it('PARCIAL: cobro nuevo > saldo pendiente previo → PAGOS_EXCEDIDOS', async () => {
    const client = makeClient(vi.fn())
    const pedido = makePedidoRaw({ total: 50_000, totalPagado: 0 })
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'PARCIAL',
      productosEntregados: { cPacaAguaEnt: 3, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
      pagos: [{ metodo: 'EFECTIVO', monto: 50_300 }], // 0.6% over — dentro del viejo total*1.01
    }
    await expect(
      new ProcesarPedidoService().execute(client as never, pedido, cuadre, 'ADMIN', 'user_1', [], []),
    ).rejects.toThrow(/PAGOS_EXCEDIDOS/)
    expect(client.pedido.update).not.toHaveBeenCalled()
  })

  it('PARCIAL con cobro parcial: registra Pago con embarqueId e incrementa totalPagado', async () => {
    const client = makeClient(vi.fn())
    const pedido = makePedidoRaw({ total: 50_000, totalPagado: 0 })
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'PARCIAL',
      productosEntregados: { cPacaAguaEnt: 3, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
      pagos: [{ metodo: 'EFECTIVO', monto: 30_000 }],
    }
    await new ProcesarPedidoService().execute(client as never, pedido, cuadre, 'ADMIN', 'user_1', [], [])
    const upd = (client.pedido.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data
    expect(upd.totalPagado).toBe(30_000)
    expect(upd.saldo).toBe(20_000)
    expect(upd.estadoEntrega).toBe('PENDIENTE')
    expect(client.pago.create).toHaveBeenCalledTimes(1)
    expect((client.pago.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data.embarqueId).toBe('emb_1')
  })
})

// FIX: Factura.fecha se fijaba una sola vez al crear el Pedido y nunca se
// resincronizaba con la entrega real — un pedido que nace un día y se
// entrega otro (quedó NO_ENTREGADO/atrapado y se resolvió después) mostraba
// la factura con la fecha de creación, no la de la entrega real.
describe('FIX factura-fecha-entrega: la factura se resincroniza al cerrar ENTREGADO', () => {
  function makePedidoRaw(overrides: Partial<PedidoRawInput> = {}): PedidoRawInput {
    return {
      id: 'ped_1',
      numero: 10,
      clienteId: 'cli_1',
      negocioId: null,
      direccionEntrega: null,
      barrioEntrega: null,
      embarqueId: 'emb_1',
      embarqueOrigenId: null,
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      precioPacaAgua: 10000,
      precioPacaHielo: 0,
      precioBotellonFab: 0,
      precioBotellonDom: 0,
      precioBolsaAgua: 0,
      precioBolsaHielo: 0,
      cPacaAguaPed: 5,
      cPacaHieloPed: 0,
      cBotellonFabPed: 0,
      cBotellonDomPed: 0,
      cBolsaAguaPed: 0,
      cBolsaHieloPed: 0,
      cPacaAguaEnt: 0,
      cPacaHieloEnt: 0,
      cBotellonFabEnt: 0,
      cBotellonDomEnt: 0,
      cBolsaAguaEnt: 0,
      cBolsaHieloEnt: 0,
      total: 50000,
      totalPagado: 0,
      obs: null,
      createdById: null,
      items: [{ producto: 'PACA_AGUA' }],
      factura: { id: 'fac_1' },
      ...overrides,
    }
  }

  function makeClient() {
    return {
      $queryRaw: vi.fn(),
      pedido: { update: vi.fn() },
      pago: { create: vi.fn() },
      config: { findUnique: vi.fn().mockResolvedValue(null) },
      factura: { update: vi.fn() },
      pedidoItem: { updateMany: vi.fn() },
      historial: { create: vi.fn() },
      embarque: { findUnique: vi.fn() },
    }
  }

  it('FIX: factura.update recibe fecha=Date (nueva) al procesar ENTREGADO', async () => {
    const client = makeClient()
    const pedido = makePedidoRaw()
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'COMPLETO',
      productosEntregados: {
        cPacaAguaEnt: 5,
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        cBolsaAguaEnt: 0,
        cBolsaHieloEnt: 0,
      },
      pagos: [],
    }

    const antes = new Date()
    const service = new ProcesarPedidoService()
    await service.execute(client as never, pedido, cuadre, 'ADMIN', 'user_1', [], [])

    expect(client.factura.update).toHaveBeenCalledTimes(1)
    const updateArgs = client.factura.update.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ id: 'fac_1' })
    expect(updateArgs.data.fecha).toBeInstanceOf(Date)
    expect((updateArgs.data.fecha as Date).getTime()).toBeGreaterThanOrEqual(antes.getTime())
  })

  it('sin factura vinculada, no se llama a factura.update (no regresión)', async () => {
    const client = makeClient()
    const pedido = makePedidoRaw({ factura: null })
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'COMPLETO',
      productosEntregados: {
        cPacaAguaEnt: 5,
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        cBolsaAguaEnt: 0,
        cBolsaHieloEnt: 0,
      },
      pagos: [],
    }

    const service = new ProcesarPedidoService()
    await service.execute(client as never, pedido, cuadre, 'ADMIN', 'user_1', [], [])

    expect(client.factura.update).not.toHaveBeenCalled()
  })
})
