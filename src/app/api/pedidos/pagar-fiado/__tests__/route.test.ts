// @tests pagar-fiado route — F-N11 fix verification
// Hallazgo: el dedup por offlineId estaba FUERA del lock ABONO.
// Dos requests idénticos con mismo offlineId podían ambos pasar
// el findMany ([]), ambos entrar al lock, y el segundo aplicaba
// más pagos sobre pedidos que el primero ya había pagado →
// doble descuento al cliente.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/pedidos/pagar-fiado/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N11: dedup DENTRO del lock ABONO', () => {
  it('FIX: el check de pagosPrevios está DENTRO de withAdvisoryLock', () => {
    // Encontrar las posiciones relativas
    const lockOpen = source.indexOf('withAdvisoryLock(\'ABONO\'')
    const dedupCheck = source.indexOf('pagosPrevios = await tx.pago.findMany')
    const lockClose = source.lastIndexOf('})')  // cierre del callback

    expect(lockOpen).toBeGreaterThan(-1)
    expect(dedupCheck).toBeGreaterThan(lockOpen)
    expect(dedupCheck).toBeLessThan(lockClose)
  })

  it('FIX: el check usa tx (no prisma global)', () => {
    // El findMany debe usar tx.pago, no prisma.pago
    const dedupBlock = source.match(/pagosPrevios = await[\s\S]{0,200}/)
    expect(dedupBlock).not.toBeNull()
    expect(dedupBlock![0]).toMatch(/tx\.pago\.findMany/)
    expect(dedupBlock![0]).not.toMatch(/prisma\.pago\.findMany/)
  })

  it('FIX: el bloque deduped retorna deduped: true y propaga pagosAplicados', () => {
    const dedupBlock = source.match(/pagosPrevios = await[\s\S]{0,1500}/)
    expect(dedupBlock).not.toBeNull()
    expect(dedupBlock![0]).toMatch(/deduped:\s*true\s+as\s+const/)
    expect(dedupBlock![0]).toMatch(/pagosAplicados:/)
    expect(dedupBlock![0]).toMatch(/montoAplicado:\s*montoAplicadoPrevio/)
    expect(dedupBlock![0]).toMatch(/Pago ya aplicado previamente/)
  })
})

describe('F-N11: la route ya NO tiene el dedup redundante FUERA del lock', () => {
  it('FIX: NO hay prisma.pago.findMany para dedup', () => {
    // El patrón viejo era:
    //   if (offlineId) {
    //     const pagosPrevios = await prisma.pago.findMany(...)
    //     ...
    //   }
    expect(source).not.toMatch(/await\s+prisma\.pago\.findMany/)
  })

  it('FIX: NO hay return apiSuccess con deduped: true fuera del lock', () => {
    // Antes: línea 43-60 retornaba apiSuccess con deduped: true
    // El nuevo patrón está dentro del lock, no debe haber un return
    // apiSuccess({ deduped: true, ... }) en el nivel superior de la route
    const topLevelDedup = /return\s+apiSuccess\(\{\s*deduped:\s*true/
    expect(source).not.toMatch(topLevelDedup)
  })

  it('FIX: ya no se importa prisma en este archivo', () => {
    expect(source).not.toMatch(/import\s+\{\s*prisma\s*\}\s+from\s+['"]@\/lib\/prisma['"]/)
  })
})

describe('F-N11: el response final distingue deduped vs camino normal', () => {
  it('FIX: la respuesta final usa spread condicional con resultado.deduped', () => {
    // Debe tener un spread condicional (...resultado.deduped ? {...} : {...})
    expect(source).toMatch(/resultado\.deduped\s*\?/)
  })

  it('FIX: el camino deduped propaga el response original', () => {
    const responseBlock = source.match(/return\s+apiSuccess\(\{[\s\S]{0,800}\}\)/)
    expect(responseBlock).not.toBeNull()
    // Cuando deduped, propaga: deduped, pagosAplicados, montoAplicado, montoSobrante, mensaje
    expect(responseBlock![0]).toMatch(/deduped:\s*true/)
    expect(responseBlock![0]).toMatch(/pagosAplicados:\s*resultado\.pagosAplicados/)
  })

  it('FIX: el camino normal calcula montoSobrante y mensaje de éxito', () => {
    const responseBlock = source.match(/return\s+apiSuccess\(\{[\s\S]{0,800}\}\)/)
    expect(responseBlock).not.toBeNull()
    expect(responseBlock![0]).toMatch(/montoAplicado:\s*monto\s*-\s*resultado\.montoRestante/)
    expect(responseBlock![0]).toMatch(/montoSobrante:\s*resultado\.montoRestante/)
    expect(responseBlock![0]).toMatch(/Pagado completo|Pagado \$/)
  })
})

describe('F-N11: la route sigue trabajando (no rompe flujo normal)', () => {
  it('FIX: el flujo normal sigue creando pagos con offlineId', () => {
    // El create de Pago sigue pasando offlineId
    expect(source).toMatch(/offlineId:\s*offlineId\s*\|\|\s*null/)
  })

  it('FIX: el flujo normal sigue actualizando facturas y creando abonos', () => {
    expect(source).toMatch(/tx\.factura\.update/)
    expect(source).toMatch(/tx\.abono\.create/)
  })

  it('FIX: el lock ABONO sigue envolviendo toda la operación', () => {
    expect(source).toMatch(/withAdvisoryLock\(['"]ABONO['"]/)
  })
})
