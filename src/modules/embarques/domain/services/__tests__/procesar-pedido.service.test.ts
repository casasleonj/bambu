// @tests ProcesarPedidoService — F4.10-a fix verification
// FIX: extrae ~119 líneas de CerrarEmbarqueUseCase.procesarPedido()
// a un domain service dedicado. Responsabilidad única: procesar UN
// pedido individual (entregado/parcial/no entregado).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

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

  it('FIX: el use case aún tiene PedidoRaw (lo usa para fetchPedidosForEmbarque)', () => {
    expect(useCaseSource).toMatch(/^interface\s+PedidoRaw/m)
  })
})

describe('F4.10-a: import correcto en el use case', () => {
  it('FIX: el use case importa ProcesarPedidoService del directorio correcto', () => {
    expect(useCaseSource).toMatch(
      /import\s+\{\s*ProcesarPedidoService\s*\}\s+from\s+['"]\.\.\/\.\.\/domain\/services\/procesar-pedido\.service['"]/
    )
  })
})
