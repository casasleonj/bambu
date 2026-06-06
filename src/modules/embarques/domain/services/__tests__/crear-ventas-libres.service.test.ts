// @tests CrearVentasLibresService — F4.10-b fix verification
// FIX: extrae ~104 líneas de CerrarEmbarqueUseCase.crearVentasLibres()
// a un domain service dedicado. Responsabilidad única: procesar el
// array de ventas libres y crear pedido ENTREGADO + factura para
// cada una.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const servicePath = join(
  process.cwd(),
  'src/modules/embarques/domain/services/crear-ventas-libres.service.ts'
)
const useCasePath = join(
  process.cwd(),
  'src/modules/embarques/application/use-cases/CerrarEmbarqueUseCase.ts'
)

const serviceSource = readFileSync(servicePath, 'utf-8')
const useCaseSource = readFileSync(useCasePath, 'utf-8')

describe('F4.10-b: CrearVentasLibresService existe y es responsable', () => {
  it('FIX: el service existe con la firma esperada', () => {
    expect(serviceSource).toMatch(/export\s+class\s+CrearVentasLibresService/)
  })

  it('FIX: el service tiene un método execute() público', () => {
    expect(serviceSource).toMatch(/async\s+execute\s*\([\s\S]+?Promise<number>/)
  })

  it('FIX: hay un comentario F4.10-b explicando el refactor', () => {
    expect(serviceSource).toMatch(/FIX F4\.10-b/)
  })
})

describe('F4.10-b: el use case delega al service (no duplica lógica)', () => {
  it('FIX: el use case inyecta CrearVentasLibresService en el constructor', () => {
    expect(useCaseSource).toMatch(/private\s+readonly\s+crearVentasLibresService:\s*CrearVentasLibresService/)
  })

  it('FIX: el use case tiene default = new CrearVentasLibresService() (backward compat)', () => {
    expect(useCaseSource).toMatch(/crearVentasLibresService:\s*CrearVentasLibresService\s*=\s*new\s+CrearVentasLibresService\(\)/)
  })

  it('FIX: el use case llama a crearVentasLibresService.execute()', () => {
    // El call site ahora delega
    expect(useCaseSource).toMatch(/this\.crearVentasLibresService\.execute\(/)
  })

  it('FIX: el use case ya NO tiene el método privado crearVentasLibres', () => {
    expect(useCaseSource).not.toMatch(/private\s+async\s+crearVentasLibres\(/)
  })
})

describe('F4.10-b: el service mantiene la lógica completa', () => {
  it('FIX: el service importa resolverPrecio, calcularEstadoPago, getNextNumero', () => {
    expect(serviceSource).toMatch(/import\s+\{\s*resolverPrecio\s*\}\s+from\s+['"]@\/lib\/pricing['"]/)
    expect(serviceSource).toMatch(/import\s+\{\s*calcularEstadoPago\s*\}\s+from\s+['"]@\/lib\/pedido-utils['"]/)
    expect(serviceSource).toMatch(/import\s+\{\s*getNextNumero\s*\}\s+from\s+['"]@\/lib\/sequence['"]/)
  })

  it('FIX: el service crea un Pedido con tipo=ENVIO, canal=DOMICILIO, origen=VENTA_LIBRE', () => {
    expect(serviceSource).toMatch(/tipo:\s*['"]ENVIO['"]/)
    expect(serviceSource).toMatch(/canal:\s*['"]DOMICILIO['"]/)
    expect(serviceSource).toMatch(/origen:\s*['"]VENTA_LIBRE['"]/)
  })

  it('FIX: el service crea el pedido con estadoEntrega=ENTREGADO', () => {
    expect(serviceSource).toMatch(/estadoEntrega:\s*['"]ENTREGADO['"]/)
  })

  it('FIX: el service crea una Factura con el formato FAC-NNNNN', () => {
    expect(serviceSource).toMatch(/numero:\s*`FAC-\$\{facturaNum\.toString\(\)\.padStart\(5,\s*['"]0['"]\)\}/)
  })

  it('FIX: el service registra los pagos', () => {
    expect(serviceSource).toMatch(/pago\.create\(\s*\{[\s\S]+?pedidoId:/)
  })
})

describe('F4.10-b: el use case importa correctamente el service', () => {
  it('FIX: el use case importa CrearVentasLibresService del directorio correcto', () => {
    expect(useCaseSource).toMatch(
      /import\s+\{\s*CrearVentasLibresService\s*\}\s+from\s+['"]\.\.\/\.\.\/domain\/services\/crear-ventas-libres\.service['"]/
    )
  })
})

describe('F4.10-b: el use case se simplificó (504 → ~398 líneas)', () => {
  it('FIX: el use case ya no importa getNextNumero ni MetodoPago (los usa el service)', () => {
    // El use case ya no los usa directamente
    expect(useCaseSource).not.toMatch(/import\s+\{\s*getNextNumero\s*\}/)
    expect(useCaseSource).not.toMatch(/import\s+type\s+\{\s*MetodoPago\s*\}/)
  })

  it('FIX: el use case aún usa getNextNumero si lo necesita en otra parte (conciliarProductos, etc.)', () => {
    // O no lo usa — depende del refactor
    const remainingGetNextNumero = useCaseSource.match(/getNextNumero/g)
    // No debe haber getNextNumero en el use case (solo en services)
    if (remainingGetNextNumero) {
      // Si existe, debe ser dentro de un comentario o el call site del service
      expect(remainingGetNextNumero.length).toBeLessThanOrEqual(1)
    }
  })
})
