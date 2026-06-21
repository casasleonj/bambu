// @tests EntregarPedidoUseCase + entrega route — F-N7 fix verification
// Hallazgo: el dedup check de 'pedido ya ENTREGADO' estaba en la route
// (fuera del lock). Dos requests simultáneos podían ambos pasar el check
// y el segundo recibía 400 confuso + trabajo wasted.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const useCasePath = join(process.cwd(), 'src/modules/pedidos/application/use-cases/EntregarPedidoUseCase.ts')
const routePath = join(process.cwd(), 'src/app/api/pedidos/[id]/entrega/route.ts')
const dtoPath = join(process.cwd(), 'src/modules/pedidos/application/dto/index.ts')

const useCaseSource = readFileSync(useCasePath, 'utf-8')
const routeSource = readFileSync(routePath, 'utf-8')
const dtoSource = readFileSync(dtoPath, 'utf-8')

describe('F-N7: dedup check DENTRO del lock en EntregarPedidoUseCase', () => {
  it('FIX: el use case verifica estadoEntrega === ENTREGADO dentro del callback del lock', () => {
    // El check debe estar DENTRO del executeWithLock, no antes
    const lockOpen = useCaseSource.indexOf('executeWithLock(\'PEDIDO\'')
    const checkEntregado = useCaseSource.indexOf("estadoEntrega.get() === 'ENTREGADO'")
    const lockClose = useCaseSource.lastIndexOf('})') // cierre del executeWithLock

    expect(lockOpen).toBeGreaterThan(-1)
    expect(checkEntregado).toBeGreaterThan(lockOpen)
    expect(checkEntregado).toBeLessThan(lockClose)
  })

  it('FIX: el use case retorna deduped: true cuando el pedido ya está ENTREGADO', () => {
    // Buscar el bloque que retorna deduped
    const dedupBlock = useCaseSource.match(/estadoEntrega\.get\(\)\s*===\s*['"]ENTREGADO['"][\s\S]{0,200}/)
    expect(dedupBlock).not.toBeNull()
    expect(dedupBlock![0]).toMatch(/return\s*\{/)
    expect(dedupBlock![0]).toMatch(/deduped:\s*true/)
  })

  it('FIX: el deduped está en el tipo de retorno EntregarPedidoResult', () => {
    expect(dtoSource).toMatch(/deduped\?:\s*boolean/)
  })
})

describe('F-N7: la route ya NO tiene el dedup check redundante', () => {
  it('FIX: la route NO llama prisma.pedido.findUnique para chequear estadoEntrega', () => {
    // Antes: const pedidoActual = await prisma.pedido.findUnique({ where: { id }, ... })
    expect(routeSource).not.toMatch(/pedidoActual\s*=\s*await\s+prisma\.pedido\.findUnique/)
  })

  it('FIX: la route NO devuelve { deduped: true, pedido: ... } directamente', () => {
    // Antes: if (pedidoActual?.estadoEntrega === 'ENTREGADO') { return apiSuccess({ deduped: true, ... }) }
    // Ahora: delega al use case
    expect(routeSource).not.toMatch(/return\s+apiSuccess\(\{\s*deduped:\s*true,\s*pedido:\s*\{\s*id,\s*estadoEntrega/)
  })

  it('FIX: la route tiene un comentario explicando que el dedup se movió al use case', () => {
    expect(routeSource).toMatch(/F-N7/)
    // Acepta variaciones: "se movió al UseCase", "use case", etc.
    expect(routeSource.toLowerCase()).toMatch(/se movi[oó]|se movi[oó] al use ?case/)
  })
})

describe('F-N7: la route sigue trabajando (no rompe backward compat)', () => {
  it('FIX: la route sigue llamando a entregarPedidoUseCase.execute()', () => {
    expect(routeSource).toMatch(/entregarPedidoUseCase\.execute\(/)
  })

  it('FIX: el resultado del use case se devuelve con apiSuccess', () => {
    expect(routeSource).toMatch(/return\s+apiSuccess\(result\)/)
  })

  it('FIX: el manejo de errores PEDIDO_NOT_FOUND y TRANSICION_INVALIDA sigue en la route', () => {
    expect(routeSource).toMatch(/PEDIDO_NOT_FOUND/)
    expect(routeSource).toMatch(/TRANSICION_INVALIDA/)
  })
})

describe('Fase 2 GPS: validación y persistencia de GPS en entrega', () => {
  it('la route lee REQUIERE_GPS_PARA_ENTREGA y PERMITIR_ENTREGA_SIN_GPS_CON_JUSTIFICACION', () => {
    expect(routeSource).toMatch(/REQUIERE_GPS_PARA_ENTREGA/)
    expect(routeSource).toMatch(/PERMITIR_ENTREGA_SIN_GPS_CON_JUSTIFICACION/)
  })

  it('la route devuelve 400 si se requiere GPS y no hay coords ni justificación', () => {
    expect(routeSource).toMatch(/La ubicación GPS es obligatoria para registrar la entrega/)
    expect(routeSource).toMatch(/apiError\(['"]La ubicación GPS es obligatoria para registrar la entrega['"],\s*400\)/)
  })

  it('la route pasa los nuevos campos GPS al use case', () => {
    expect(routeSource).toMatch(/gpsAccuracy,/)
    expect(routeSource).toMatch(/gpsJustificacion,/)
    expect(routeSource).toMatch(/entregadoConGps,/)
    expect(routeSource).toMatch(/entregadoAt,/)
  })

  it('la route crea un GpsTrack tras entrega exitosa con coords y embarque', () => {
    expect(routeSource).toMatch(/prisma\.gpsTrack\.create/)
    expect(routeSource).toMatch(/result\.pedido\.embarqueId/)
    expect(routeSource).toMatch(/trabajadorId/)
    expect(routeSource).toMatch(/synced:\s*true/)
  })
})
