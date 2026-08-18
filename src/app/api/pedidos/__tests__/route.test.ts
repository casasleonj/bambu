// @tests CrearPedidoUseCase + pedidos route — F-N10 fix verification
// Hallazgo: el dedup por offlineId estaba en la ROUTE (fuera del lock).
// Dos requests idénticos podían ambos pasar el check (findUnique
// retorna null porque el primero no ha commiteado) y el segundo
// chocaba con la unique constraint → P2002 → 500.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const useCasePath = join(
  process.cwd(),
  'src/modules/pedidos/application/use-cases/CrearPedidoUseCase.ts'
)
const repoPath = join(
  process.cwd(),
  'src/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository.ts'
)
const ifacePath = join(
  process.cwd(),
  'src/modules/pedidos/domain/repositories/IPedidoRepository.ts'
)
const routePath = join(
  process.cwd(),
  'src/app/api/pedidos/route.ts'
)
const dtoPath = join(
  process.cwd(),
  'src/modules/pedidos/application/dto/index.ts'
)

const useCaseSource = readFileSync(useCasePath, 'utf-8')
const repoSource = readFileSync(repoPath, 'utf-8')
const ifaceSource = readFileSync(ifacePath, 'utf-8')
const routeSource = readFileSync(routePath, 'utf-8')
const dtoSource = readFileSync(dtoPath, 'utf-8')

describe('F-N10: dedup por offlineId DENTRO del lock en CrearPedidoUseCase', () => {
  it('FIX: el use case verifica offlineId al inicio del callback del lock', () => {
    // El check debe estar DENTRO del executeWithLock
    const lockOpen = useCaseSource.indexOf("executeWithLock('SECUENCIA', 'pedido'")
    const checkOffline = useCaseSource.indexOf('findByOfflineId(input.offlineId, tx)')
    const lockClose = useCaseSource.lastIndexOf('})')  // cierre del executeWithLock

    expect(lockOpen).toBeGreaterThan(-1)
    expect(checkOffline).toBeGreaterThan(lockOpen)
    expect(checkOffline).toBeLessThan(lockClose)
  })

  it('FIX: el use case retorna deduped: true cuando el pedido ya existe', () => {
    // Buscar el bloque que retorna deduped
    const dedupBlock = useCaseSource.match(/findByOfflineId[\s\S]{0,400}/)
    expect(dedupBlock).not.toBeNull()
    expect(dedupBlock![0]).toMatch(/return\s*\{/)
    expect(dedupBlock![0]).toMatch(/deduped:\s*true/)
  })

  it('FIX: el use case usa input.offlineId como guard', () => {
    // Debe estar dentro de un if (input.offlineId)
    const offlineGuard = useCaseSource.match(/if\s*\(input\.offlineId\)\s*\{[\s\S]{0,400}findByOfflineId/)
    expect(offlineGuard).not.toBeNull()
  })

  it('FIX: hay un comentario F-N10 explicando el fix', () => {
    expect(useCaseSource).toMatch(/FIX F-N10/)
    expect(useCaseSource).toMatch(/P2002|unique constraint|findUnique.*null/)
  })
})

describe('F-N10: la route ya NO tiene el dedup check redundante', () => {
  it('FIX: la route NO llama prisma.pedido.findUnique para chequear offlineId', () => {
    // Antes: const existente = await prisma.pedido.findUnique({ where: { offlineId } })
    expect(routeSource).not.toMatch(/await\s+prisma\.pedido\.findUnique\(\s*\{\s*where:\s*\{\s*offlineId/)
  })

  it('FIX: la route tiene un comentario explicando que el dedup se movió al use case', () => {
    expect(routeSource).toMatch(/F-N10/)
    expect(routeSource.toLowerCase()).toMatch(/se movi[oó]/)
  })
})

describe('F-N10: el repo expone findByOfflineId', () => {
  it('FIX: IPedidoRepository declara findByOfflineId', () => {
    expect(ifaceSource).toMatch(/findByOfflineId\(offlineId:\s*string/)
  })

  it('FIX: PrismaPedidoRepository implementa findByOfflineId usando el índice @unique', () => {
    // Debe usar findUnique con offlineId (no findFirst, porque es @unique)
    const findByOfflineIdMethod = repoSource.match(/async findByOfflineId[\s\S]{0,500}/)
    expect(findByOfflineIdMethod).not.toBeNull()
    expect(findByOfflineIdMethod![0]).toMatch(/client\.pedido\.findUnique/)
    expect(findByOfflineIdMethod![0]).toMatch(/where:\s*\{\s*offlineId\s*\}/)
  })
})

describe('F-N10: el DTO CrearPedidoResult expone deduped', () => {
  it('FIX: CrearPedidoResult tiene deduped opcional', () => {
    expect(dtoSource).toMatch(/CrearPedidoResult[\s\S]{0,200}deduped\?:\s*boolean/)
  })
})

describe('F-N10: la route sigue trabajando con el use case (no rompe backward compat)', () => {
  it('FIX: la route sigue llamando a crearPedidoUseCase.execute()', () => {
    expect(routeSource).toMatch(/crearPedidoUseCase\.execute\(/)
  })

  it('FIX: la route pasa offlineId al use case', () => {
    expect(routeSource).toMatch(/offlineId,/)
  })

  it('FIX: el resultado del use case se devuelve con apiSuccess', () => {
    // Acepta ambas: con o sin deduped
    expect(routeSource).toMatch(/return\s+apiSuccess\(\{\s*pedido:\s*result\.pedido/)
  })
})

describe('Fase 3: ventas anónimas muestran "Venta anónima" en vez de "Consumidor Final"', () => {
  it('FIX: la route importa getAnonymousClientDisplayName', () => {
    expect(routeSource).toMatch(/import\s*\{\s*getAnonymousClientDisplayName\s*\}\s*from\s*['"]@\/lib\/cliente-canonical['"]/)
  })

  it('FIX: nombreCli para CONSUMIDOR_FINAL usa getAnonymousClientDisplayName', () => {
    expect(routeSource).toMatch(/getAnonymousClientDisplayName\(p\.clienteId,\s*['"]short['"]\)/)
  })

  it('FIX: no queda hardcodeado "Consumidor Final" en el mapping', () => {
    expect(routeSource).not.toMatch(/p\.clienteId\s*===\s*['"]CONSUMIDOR_FINAL['"]\s*\?\s*['"]Consumidor Final['"]/)
  })
})

describe('Regresión E2E (auditoría performance /pedidos): all=true sin pageSize explícito', () => {
  // Hallazgo: la primera versión de este fix pasaba `pagination.pageSize || 20`
  // como default cuando all=true y no venía `pageSize` en el query string.
  // Como `getPaginationParams` default a 20 (no undefined), TODO caller
  // preexistente de `/api/pedidos?all=true` sin pageSize explícito (tabs
  // Fiados/Alertas, getAlertasPedido, etc.) quedaba truncado a 20 resultados
  // en vez de los 200 que daba el use case antes de esta migración.
  // Detectado por E2E real (pedidos-filtros-funcionales.spec.ts), no por
  // tsc/unit tests — el bug era de comportamiento en runtime, no de tipos.
  it('FIX: cuando all=true y no hay pageSize en el query, se pasa undefined (no el default de paginación normal)', () => {
    expect(routeSource).toMatch(
      /const effectivePageSize = all === 'true'\s*\n\s*\?\s*\(Number\.isFinite\(rawPageSize\)\s*&&\s*rawPageSize > 0 \? rawPageSize : undefined\)\s*\n\s*:\s*\(pagination\.pageSize \|\| 20\)/
    )
  })

  it('FIX: el effectivePageSize resultante se pasa tal cual al use case (que aplica su propio default 200)', () => {
    expect(routeSource).toMatch(/pageSize:\s*effectivePageSize/)
  })
})
