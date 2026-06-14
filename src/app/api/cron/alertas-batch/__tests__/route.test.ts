// @tests cron alertas-batch — commit 4 plan antifraude
// Ejecuta el detector de alertas server-side y crea Casos con
// dedup. Complementa al cron 3.3 (que solo hace CLIENTE_NO_VERIFICADO).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(
  process.cwd(),
  'src/app/api/cron/alertas-batch/route.ts',
)
const source = readFileSync(routePath, 'utf-8')

describe('commit 4: batch cron seguro', () => {
  it('FIX: el cron requiere CRON_SECRET', () => {
    expect(source).toMatch(/requireCronSecret/)
  })

  it('FIX: el cron verifica SYSTEM user (fail-fast)', () => {
    expect(source).toMatch(/SYSTEM user no existe/)
  })

  it('FIX: el cron usa SYSTEM user como creadoPorId', () => {
    expect(source).toMatch(/system@bambu\.local/)
    expect(source).toMatch(/creadoPorId:\s*systemUser\.id/)
  })
})

describe('commit 4: alertas detectadas (server-side)', () => {
  it('FIX: NOTA_CREDITO_FRECUENTE — cuenta NCs por cliente en 30d', () => {
    expect(source).toMatch(/notaCredito\.groupBy/)
    expect(source).toMatch(/NC_VENTANA_DIAS\s*=\s*30/)
    expect(source).toMatch(/alertaTipo:\s*['"]NOTA_CREDITO_FRECUENTE['"]/)
  })

  it('FIX: DESCUENTO_NO_JUSTIFICADO — descuents sin justificar por repartidor', () => {
    expect(source).toMatch(/descuentoRepartidor\.findMany/)
    expect(source).toMatch(/justificado:\s*false/)
    expect(source).toMatch(/alertaTipo:\s*['"]DESCUENTO_NO_JUSTIFICADO['"]/)
  })

  it('FIX: REPARTIDOR_DEUDA_ALTA — trabajadores con deuda acumulada > umbral', () => {
    expect(source).toMatch(/deudaReposAgua[\s\S]+?deudaReposHielo/)
    expect(source).toMatch(/alertaTipo:\s*['"]REPARTIDOR_DEUDA_ALTA['"]/)
    expect(source).toMatch(/DEUDA_REPARTIDOR_MIN_PACAS/)
  })

  it('FIX: DEVOLUCIONES_ANORMALES + ROTURAS_ANORMALES — embarques outlier vs promedio', () => {
    expect(source).toMatch(/alertaTipo:\s*['"]DEVOLUCIONES_ANORMALES['"]/)
    expect(source).toMatch(/alertaTipo:\s*['"]ROTURAS_ANORMALES['"]/)
    expect(source).toMatch(/DEVOLUCIONES_MIN_EMBARQUES/)
    expect(source).toMatch(/DEVOLUCIONES_MULTIPLICADOR/)
  })

  it('FIX: RECLAMACIONES_MULTIPLES — clientes con >= 3 reclamaciones', () => {
    expect(source).toMatch(/reclamaciones:\s*\{\s*gte:\s*3\s*\}/)
    expect(source).toMatch(/alertaTipo:\s*['"]RECLAMACIONES_MULTIPLES['"]/)
  })
})

describe('commit 4: dedup via partial unique index + pre-check', () => {
  it('FIX: hay una funcion crearCasoSiNoExiste con pre-check', () => {
    expect(source).toMatch(/async\s+function\s+crearCasoSiNoExiste/)
    expect(source).toMatch(/caso\.findFirst\(\s*\{\s*where:\s*whereClause\s*\}/)
  })

  it('FIX: pre-check filtra por status=ABIERTO', () => {
    // El whereClause se construye con object literal: { status: 'ABIERTO' }
    expect(source).toMatch(/whereClause:[\s\S]+?status:\s*['"]ABIERTO['"]/)
  })

  it('FIX: si pre-check encuentra, retorna "saltado" sin insertar', () => {
    // El return 'saltado' cuando existing existe
    expect(source).toMatch(/if\s*\(existing\)\s*\{[\s\S]+?result:\s*['"]saltado['"]/)
  })

  it('FIX: si P2002 (unique index) salta, retorna "saltado" (carrera con otro cron)', () => {
    expect(source).toMatch(/P2002/)
    expect(source).toMatch(/result:\s*['"]saltado['"]/)
  })

  it('FIX: retorna { result, casoId } (no string) para que caller dispare push', () => {
    // commit 4b: caller necesita el casoId para armar el push payload
    expect(source).toMatch(/Promise<\s*\{\s*result:[\s\S]+?casoId:\s*string\s*\|\s*null\s*\}\s*>/)
  })

  it('FIX: usa el partial unique index caso_dedup_abierto_cliente_unique (commit 0c)', () => {
    // El codigo debe comentar que la garantia es a nivel DB
    expect(source).toMatch(/caso_dedup_abierto_cliente_unique|caso_dedup_abierto_repartidor_unique|partial unique index/)
  })
})

describe('commit 4: respuesta del cron', () => {
  it('FIX: el cron retorna casosCreados, casosSaltados, fallos', () => {
    expect(source).toMatch(/casosCreados[\s\S]+?casosSaltados[\s\S]+?fallos/)
  })
})

describe('commit 4b: push trigger para Casos ALTA', () => {
  it('FIX: el cron importa broadcastPush de @/lib/push', () => {
    expect(source).toMatch(/import\s*\{[^}]*broadcastPush[^}]*\}\s*from\s*['"]@\/lib\/push['"]/)
  })

  it('FIX: broadcastPush se llama solo cuando severidad es ALTA', () => {
    // El fire-and-forget se dispara despues del create, gateado por severidad
    expect(source).toMatch(/severidad\s*===\s*['"]ALTA['"]/)
    expect(source).toMatch(/broadcastPush\(/)
  })

  it('FIX: el push payload incluye url /casos/[id] y tag caso-[id]', () => {
    // El tag dedup garantiza que un Caso no genere N notifications
    expect(source).toMatch(/url:\s*`\/casos\/\$\{caso\.id\}`/)
    expect(source).toMatch(/tag:\s*`caso-\$\{caso\.id\}`/)
  })

  it('FIX: broadcastPush es fire-and-forget (no bloquea el cron)', () => {
    // `void` antes de la llamada: errores de push no rompen el cron
    expect(source).toMatch(/void\s+broadcastPush\(/)
  })
})
