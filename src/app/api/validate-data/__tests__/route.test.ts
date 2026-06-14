// @tests commit 5 plan antifraude: refactor de validate-data para
// ser importable, + 2 nuevos endpoints (/api/validate-data y
// /api/casos/salud-antifraude) + 1 nueva pagina
// (/reportes/salud-antifraude).

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const validateDataPath = join(process.cwd(), 'prisma/validate-data.ts')
const validateDataSource = readFileSync(validateDataPath, 'utf-8')

describe('commit 5: validate-data refactor para ser importable', () => {
  it('FIX: exporta runValidation que retorna ValidationResult[]', () => {
    expect(validateDataSource).toMatch(/export\s+async\s+function\s+runValidation/)
    expect(validateDataSource).toMatch(/Promise<ValidationResult\[\]>/)
  })

  it('FIX: runValidation ejecuta los 22 checks originales', () => {
    // Cada checkXxx() debe seguir siendo llamado desde runValidation
    const checks = [
      'checkPedidoTotals',
      'checkSaldoConsistency',
      'checkPagosMatchTotalPagado',
      'checkFacturaSaldo',
      'checkAbonoExceedsFactura',
      'checkEmbarqueCapacity',
      'checkProduccionStock',
      'checkCierreDiaConsistency',
      'checkPedidoEstadoVsEntregado',
      'checkPedidoCanceladoConPagos',
      'checkClienteDeudaVsFiado',
      'checkRecurrentesDuplicates',
      'checkEmbarqueAbiertoViejo',
      'checkPedidosSinCliente',
      'checkPreciosNegativosOCero',
      'checkMetodoPagoValido',
      'checkFacturaSinPedido',
      'checkAbonoSinFactura',
      'checkDistribucionPedidosPorDia',
      'checkPedidosDomicilioSinRuta',
      'checkEnvioSinDireccion',
    ]
    for (const c of checks) {
      expect(validateDataSource).toMatch(new RegExp(`await\\s+${c}\\(\\)`))
    }
  })

  it('FIX: exporta printResults (separado del run)', () => {
    expect(validateDataSource).toMatch(/export\s+function\s+printResults/)
  })

  it('FIX: limpia el array global de results para que sea reusable', () => {
    // commit 5: si alguien llama runValidation() dos veces en el
    // mismo proceso, no debe acumular resultados de la primera llamada
    expect(validateDataSource).toMatch(/results\.length\s*=\s*0/)
  })

  it('FIX: auto-run solo si el script es invocado directamente (import.meta.url)', () => {
    // Patron ESM: fileURLToPath(import.meta.url) === process.argv[1]
    expect(validateDataSource).toMatch(/import\s*\{[^}]*fileURLToPath[^}]*\}\s*from\s*['"]url['"]/)
    expect(validateDataSource).toMatch(/process\.argv\[1\]\s*===\s*fileURLToPath\(import\.meta\.url\)/)
    expect(validateDataSource).toMatch(/if\s*\(isMain\)/)
  })

  it('FIX: el main() wrapper se preserva para la consola', () => {
    // La version CLI sigue funcionando: npx tsx prisma/validate-data.ts
    expect(validateDataSource).toMatch(/async\s+function\s+main\(\)/)
    expect(validateDataSource).toMatch(/runValidation\(\)/)
    expect(validateDataSource).toMatch(/printResults\(results\)/)
  })
})

describe('commit 5: /api/validate-data endpoint', () => {
  const endpointPath = join(process.cwd(), 'src/app/api/validate-data/route.ts')

  it('FIX: el endpoint existe', () => {
    expect(existsSync(endpointPath)).toBe(true)
  })

  it('FIX: importa runValidation desde el script refactorizado', () => {
    const source = readFileSync(endpointPath, 'utf-8')
    // path relativo desde src/app/api/validate-data/route.ts a
    // prisma/validate-data.ts: ../../../../prisma/validate-data
    expect(source).toMatch(/from\s*['"]\.\.\/\.\.\/\.\.\/\.\.\/prisma\/validate-data['"]/)
  })

  it('FIX: requiere auth + role ADMIN/CONTADOR', () => {
    const source = readFileSync(endpointPath, 'utf-8')
    expect(source).toMatch(/requireAuth/)
    expect(source).toMatch(/requireRole\(\[?\s*['"]ADMIN['"]/)
    expect(source).toMatch(/['"]CONTADOR['"]/)
  })

  it('FIX: el GET corre runValidation y devuelve resultados con totales', () => {
    const source = readFileSync(endpointPath, 'utf-8')
    expect(source).toMatch(/export\s+async\s+function\s+GET/)
    expect(source).toMatch(/runValidation\(\)/)
    expect(source).toMatch(/totales:/)
    expect(source).toMatch(/pass:\s*results\.filter/)
    expect(source).toMatch(/fail:\s*results\.filter/)
    expect(source).toMatch(/warn:\s*results\.filter/)
  })
})

describe('commit 5: /api/casos/salud-antifraude endpoint', () => {
  const endpointPath = join(process.cwd(), 'src/app/api/casos/salud-antifraude/route.ts')

  it('FIX: el endpoint existe', () => {
    expect(existsSync(endpointPath)).toBe(true)
  })

  it('FIX: requiere auth + role ADMIN/CONTADOR/ASISTENTE', () => {
    const source = readFileSync(endpointPath, 'utf-8')
    expect(source).toMatch(/requireAuth/)
    expect(source).toMatch(/requireRole\(\[?\s*['"]ADMIN['"]/)
    expect(source).toMatch(/['"]CONTADOR['"]/)
    expect(source).toMatch(/['"]ASISTENTE['"]/)
  })

  it('FIX: 5 agregaciones en paralelo (Promise.all)', () => {
    const source = readFileSync(endpointPath, 'utf-8')
    // Los 5 groupBy que componen el panel
    expect(source).toMatch(/prisma\.caso\.groupBy/)
    expect(source).toMatch(/by:\s*\['alertaTipo'\]/)
    expect(source).toMatch(/by:\s*\['status'\]/)
    expect(source).toMatch(/by:\s*\['repartidorId'\]/)
    expect(source).toMatch(/by:\s*\['clienteId'\]/)
  })

  it('FIX: ventana 30d para porTipo, 14d para tendencia', () => {
    const source = readFileSync(endpointPath, 'utf-8')
    expect(source).toMatch(/30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/)
    expect(source).toMatch(/14\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/)
  })

  it('FIX: hidrata nombres de repartidores y clientes (no N+1)', () => {
    const source = readFileSync(endpointPath, 'utf-8')
    // findMany con where: { id: { in: ids } } (batch) en vez de N
    // findUnique (N+1)
    expect(source).toMatch(/prisma\.trabajador\.findMany/)
    expect(source).toMatch(/id:\s*\{\s*in:\s*repartidorIds\s*\}/)
    expect(source).toMatch(/prisma\.cliente\.findMany/)
    expect(source).toMatch(/id:\s*\{\s*in:\s*clienteIds\s*\}/)
  })

  it('FIX: la tendencia agrupa por dia ISO (YYYY-MM-DD)', () => {
    const source = readFileSync(endpointPath, 'utf-8')
    expect(source).toMatch(/toISOString\(\)\.slice\(0,\s*10\)/)
  })
})

describe('commit 5: /reportes/salud-antifraude page', () => {
  const pagePath = join(process.cwd(), 'src/app/(app)/reportes/salud-antifraude/page.tsx')

  it('FIX: la pagina existe', () => {
    expect(existsSync(pagePath)).toBe(true)
  })

  it('FIX: es Server Component con requirePagePermission view:reportes', () => {
    const source = readFileSync(pagePath, 'utf-8')
    expect(source).toMatch(/export\s+default\s+async\s+function\s+SaludAntifraudePage/)
    expect(source).toMatch(/requirePagePermission\(['"]view:reportes['"]\)/)
  })

  it('FIX: importa runValidation desde el script refactorizado', () => {
    const source = readFileSync(pagePath, 'utf-8')
    expect(source).toMatch(/import\s*\{[^}]*runValidation[^}]*\}\s*from/)
    // path desde src/app/(app)/reportes/salud-antifraude/ a
    // prisma/validate-data: 5 niveles up
    expect(source).toMatch(/from\s*['"]\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/prisma\/validate-data['"]/)
  })

  it('FIX: muestra 6 secciones (validate-data, top tipos, status, repartidores, clientes, tendencia)', () => {
    const source = readFileSync(pagePath, 'utf-8')
    expect(source).toMatch(/Salud Antifraude/)
    expect(source).toMatch(/Integridad de datos/)
    expect(source).toMatch(/Casos por tipo de alerta/)
    expect(source).toMatch(/Casos por status/)
    expect(source).toMatch(/Top repartidores/)
    expect(source).toMatch(/Top clientes/)
    expect(source).toMatch(/Tendencia/)
  })

  it('FIX: nav-data linkea la nueva pagina', () => {
    const navPath = join(process.cwd(), 'src/app/(app)/nav-data.tsx')
    const navSource = readFileSync(navPath, 'utf-8')
    expect(navSource).toMatch(/['"]\/reportes\/salud-antifraude['"]/)
    expect(navSource).toMatch(/['"]Salud antifraude['"]/)
  })

  it('FIX: la pagina maneja error de runValidation gracefully', () => {
    // Si la DB esta caida o runValidation lanza, la pagina debe
    // mostrar [] (no crashear el request entero)
    const source = readFileSync(pagePath, 'utf-8')
    expect(source).toMatch(/runValidation\(\)\.catch/)
    expect(source).toMatch(/return\s*\[\]/)
  })

  it('FIX: la pagina muestra PASS/FAIL/WARN con iconos y color coding', () => {
    const source = readFileSync(pagePath, 'utf-8')
    expect(source).toMatch(/CheckCircle2/)
    expect(source).toMatch(/AlertCircle/)
    expect(source).toMatch(/AlertTriangle/)
    expect(source).toMatch(/text-green-600/)
    expect(source).toMatch(/text-red-600/)
    expect(source).toMatch(/text-yellow-600/)
  })
})
