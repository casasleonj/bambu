/**
 * Script de backfill masivo de coordenadas de clientes.
 *
 * Contexto: F0 del módulo Rutas/Planificador (`docs/rutas/INVENTARIO_CAPACIDADES_DISTRIBUCION.md`).
 * Producción tiene ~1% de clientes activos con coordenadas. El planificador
 * necesita coords para agrupar/secuenciar. ~62 clientes activos tienen un
 * `linkUbicacion` de Google Maps del cual se pueden extraer coords.
 *
 * Qué hace: por cada cliente activo con `linkUbicacion` y sin coords, corre
 * `backfillClienteCoords` (la misma estrategia canónica que usa el botón
 * "Actualizar coordenadas" de la UI y el endpoint `POST /api/clientes/[id]/geocode`):
 *   1. parsea `linkUbicacion` (incluye expansión de short URLs `maps.app.goo.gl`)
 *   2. si falla → mediana de `Pedido.gpsLat/gpsLng` confirmados
 *   3. si falla → coords del `negocioDefault`
 * y persiste `lat/lng/geocodeOrigen/geocodeAt`. Idempotente.
 *
 * Uso:
 *   # dev (docker, .env apunta a localhost:5433)
 *   npx tsx scripts/backfill-coords-clientes.ts --dry-run
 *   npx tsx scripts/backfill-coords-clientes.ts
 *
 *   # producción (Supabase): exportar la URL directa antes de correr
 *   DATABASE_URL="$DIRECT_URL_DE_SUPABASE" npx tsx scripts/backfill-coords-clientes.ts --dry-run
 *   DATABASE_URL="$DIRECT_URL_DE_SUPABASE" npx tsx scripts/backfill-coords-clientes.ts
 *
 * Flags:
 *   --dry-run      solo reporta, no escribe
 *   --all          incluye clientes que YA tienen coords (re-geocodifica todos)
 *   --limit=N      procesa como máximo N clientes
 */

import { prisma } from '@/lib/prisma'
import {
  backfillClienteCoords,
  persistClienteCoords,
} from '@/lib/geo/backfill-cliente-coords'

const DRY_RUN = process.argv.includes('--dry-run')
const ALL = process.argv.includes('--all')
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--limit='))
  const n = arg ? Number(arg.split('=')[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : Infinity
})()

async function main() {
  const candidatos = await prisma.cliente.findMany({
    where: {
      activo: true,
      linkUbicacion: { not: null },
      ...(ALL ? {} : { OR: [{ lat: null }, { lng: null }] }),
    },
    select: { id: true, nombre: true, linkUbicacion: true, lat: true, lng: true },
    orderBy: { nombre: 'asc' },
  })

  const lista = candidatos.slice(0, LIMIT === Infinity ? undefined : LIMIT)

  console.log(
    `${DRY_RUN ? '[DRY-RUN] ' : ''}${lista.length} cliente(s) a procesar` +
      (ALL ? ' (--all)' : ' (sin coords)') +
      (LIMIT !== Infinity ? ` (limit ${LIMIT})` : ''),
  )
  console.log('')

  let ok = 0
  let sinResultado = 0
  let errores = 0
  const porOrigen: Record<string, number> = {}

  for (const c of lista) {
    try {
      const result = await backfillClienteCoords(c.id)

      if (!result) {
        sinResultado++
        console.log(`  ✗ ${c.nombre} (${c.id}) — sin coords (link no parseable, sin GPS, sin negocio)`)
        continue
      }

      porOrigen[result.origen] = (porOrigen[result.origen] ?? 0) + 1

      if (DRY_RUN) {
        console.log(
          `  · ${c.nombre} (${c.id}) → ${result.lat.toFixed(6)}, ${result.lng.toFixed(6)} [${result.origen}]`,
        )
      } else {
        await persistClienteCoords(c.id, result)
        ok++
        console.log(
          `  ✓ ${c.nombre} (${c.id}) → ${result.lat.toFixed(6)}, ${result.lng.toFixed(6)} [${result.origen}]`,
        )
      }
    } catch (err) {
      errores++
      console.log(`  ! ${c.nombre} (${c.id}) — ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log('')
  console.log('Resumen:')
  console.log(`  ${DRY_RUN ? 'parseables' : 'actualizados'}: ${DRY_RUN ? lista.length - sinResultado - errores : ok}`)
  console.log(`  sin resultado: ${sinResultado}`)
  console.log(`  errores: ${errores}`)
  console.log(`  por origen: ${JSON.stringify(porOrigen)}`)
  if (DRY_RUN) console.log('\n  (dry-run: no se escribió nada — quitar --dry-run para aplicar)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
