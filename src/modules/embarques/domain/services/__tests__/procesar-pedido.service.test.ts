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

  it('FIX: el service llama a crearPedidoHijo cuando es PARCIAL', () => {
    expect(serviceSource).toMatch(/this\.crearPedidoHijo\(/)
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

// BAMBU-LOG-004: el pedido hijo (faltante de una entrega PARCIAL) debe
// heredar negocioId y el snapshot de dirección del padre. Antes, solo se
// copiaba clienteId — si el pedido original era de un Negocio/sucursal,
// el hijo resolvía su dirección/coords contra el Cliente. Estos son tests
// de comportamiento reales (ejecutan execute() con un client mockeado),
// no regex sobre el código fuente como los de arriba.
describe('BAMBU-LOG-004: crearPedidoHijo hereda negocioId y dirección del padre', () => {
  function makePedidoRaw(overrides: Partial<PedidoRawInput> = {}): PedidoRawInput {
    return {
      id: 'ped_padre',
      numero: 42,
      clienteId: 'cli_1',
      negocioId: 'neg_1',
      direccionEntrega: 'Cra 10 #20-30',
      barrioEntrega: 'Centro',
      embarqueId: 'emb_1',
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
      pedido: {
        update: vi.fn(),
        create: hijoCreateSpy,
        aggregate: vi.fn().mockResolvedValue({ _max: { numero: 100 } }),
      },
      pago: { create: vi.fn() },
      factura: { update: vi.fn() },
      pedidoItem: { updateMany: vi.fn() },
      historial: { create: vi.fn() },
      embarque: { findUnique: vi.fn() },
    }
  }

  it('el hijo creado por CIERRE DE EMBARQUE (entrega PARCIAL) incluye negocioId y dirección del padre', async () => {
    const hijoCreateSpy = vi.fn().mockResolvedValue({ id: 'hijo_1', numero: 101 })
    const client = makeClient(hijoCreateSpy)
    const pedido = makePedidoRaw()
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'PARCIAL',
      productosEntregados: {
        cPacaAguaEnt: 3, // 5 pedidas, 3 entregadas -> 2 de faltante
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

    expect(hijoCreateSpy).toHaveBeenCalledTimes(1)
    const createArgs = hijoCreateSpy.mock.calls[0][0].data
    expect(createArgs.negocioId).toBe('neg_1')
    expect(createArgs.direccionEntrega).toBe('Cra 10 #20-30')
    expect(createArgs.barrioEntrega).toBe('Centro')
  })

  it('sin negocioId en el padre, el hijo tampoco lo tiene (no regresión — no inventa datos)', async () => {
    const hijoCreateSpy = vi.fn().mockResolvedValue({ id: 'hijo_2', numero: 102 })
    const client = makeClient(hijoCreateSpy)
    const pedido = makePedidoRaw({ negocioId: null, direccionEntrega: null, barrioEntrega: null })
    const cuadre: CerrarEmbarqueInput['pedidos'][number] = {
      pedidoId: pedido.id,
      entregado: 'PARCIAL',
      productosEntregados: {
        cPacaAguaEnt: 3,
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

    const createArgs = hijoCreateSpy.mock.calls[0][0].data
    expect(createArgs.negocioId).toBeNull()
    expect(createArgs.direccionEntrega).toBeNull()
    expect(createArgs.barrioEntrega).toBeNull()
  })
})
