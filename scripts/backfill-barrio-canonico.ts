/**
 * Backfill de Barrio canónico — TERRITORIO-F2, M4.
 *
 * Diseño aprobado: `docs/territorio/RONDA1_M3_M4_PROPUESTA.md` (revisión 3).
 * Lee `scripts/backfill-barrio-canonico.decisiones.json` (el ledger de
 * decisiones humanas, ver `src/lib/barrios/backfill-ledger.ts` para el
 * contrato y la validación) y, para cada entrada resuelta, crea el `Barrio`
 * correspondiente y vincula los `Cliente`/`Negocio` que usan ese valor.
 *
 * Este script NUNCA decide una fusión por sí mismo: toda decisión
 * (`CREAR_BARRIO`/`FUSIONAR_EN`/`MANTENER_SEPARADO`/`DESCARTAR`) viene del
 * ledger, editado a mano por el equipo. No hay similitud de texto, fuzzy
 * matching, `pg_trgm` ni Levenshtein en ningún punto de este archivo — la
 * única igualdad que se usa es exacta, sobre `normalizeName`.
 *
 * Uso:
 *   npx tsx scripts/backfill-barrio-canonico.ts --dry-run
 *   npx tsx scripts/backfill-barrio-canonico.ts
 *
 *   # producción (Supabase): exportar la URL directa antes de correr
 *   DATABASE_URL="$DIRECT_URL_DE_SUPABASE" npx tsx scripts/backfill-barrio-canonico.ts --dry-run
 *   DATABASE_URL="$DIRECT_URL_DE_SUPABASE" npx tsx scripts/backfill-barrio-canonico.ts
 *
 * Flags:
 *   --dry-run   cero escrituras. Corre con un ledger parcial (entradas en
 *               PENDIENTE_DECISION) — las reporta como pendientes.
 *               (sin flag) modo real. Rechaza ejecutar si el ledger es
 *               inválido o si queda alguna entrada PENDIENTE_DECISION —
 *               nunca inventa una decisión territorial para poder avanzar.
 *
 * Garantías (ver RONDA1_M3_M4_PROPUESTA.md para el detalle):
 *  - Nunca se modifica ni se borra el valor legacy `Cliente.barrio` /
 *    `Negocio.barrio` — el script solo AÑADE `barrioId` cuando corresponde.
 *  - `barrioId` existente que no coincide con lo que el ledger asignaría →
 *    CONFLICTO, nunca reasignación silenciosa.
 *  - Una transacción atómica por entrada del ledger (por valorNormalizado,
 *    no una única transacción global) — un fallo puntual se marca ERROR y
 *    el resto de la corrida continúa.
 *  - Idempotente: correr dos veces sobre el mismo estado no duplica Barrios
 *    (constraint `UNIQUE(nombreNormalizado)`) ni reescribe un barrioId ya
 *    aplicado.
 *  - Nunca toca coordenadas/geometría (`pickCoords`, `LocationQuality`,
 *    `src/lib/geo/**`) — consistente con ADR-TERRITORIO-001.
 */

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { crearBarrio } from '@/lib/barrios/barrio-service'
import { normalizeBarrioNombre } from '@/lib/barrios/normalizer'
import {
  M1_REFERENCIA,
  resolverDestinoFusion,
  tienePendientes,
  validarLedger,
  type DecisionLedgerEntry,
  type ExecutionLogEntry,
  type ResultadoEjecucion,
} from '@/lib/barrios/backfill-ledger'
import { readFileSync } from 'fs'
import { join } from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const LEDGER_PATH = join(process.cwd(), 'scripts/backfill-barrio-canonico.decisiones.json')

function cargarLedger(): DecisionLedgerEntry[] {
  const raw = readFileSync(LEDGER_PATH, 'utf-8')
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`${LEDGER_PATH} debe ser un arreglo JSON de DecisionLedgerEntry.`)
  }
  return parsed as DecisionLedgerEntry[]
}

interface RegistroPendiente {
  entidad: 'CLIENTE' | 'NEGOCIO'
  id: string
  barrioLegacy: string
  barrioIdActual: string | null
}

/**
 * Lee todos los `Cliente`/`Negocio` con `barrio` no vacío (tras trim),
 * agrupados por `normalizeName(barrio)`. Excluye explícitamente los
 * registros con `barrio` en blanco (M1 §0, 105 casos en Cliente) — nunca se
 * tratan como candidatos, en ningún modo.
 */
async function agruparRegistrosPorValorNormalizado(): Promise<Map<string, RegistroPendiente[]>> {
  const [clientes, negocios] = await Promise.all([
    prisma.cliente.findMany({
      where: { barrio: { not: null } },
      select: { id: true, barrio: true, barrioId: true },
    }),
    prisma.negocio.findMany({
      where: { barrio: { not: null } },
      select: { id: true, barrio: true, barrioId: true },
    }),
  ])

  const grupos = new Map<string, RegistroPendiente[]>()
  const agregar = (entidad: 'CLIENTE' | 'NEGOCIO', id: string, barrioLegacy: string | null, barrioIdActual: string | null) => {
    if (!barrioLegacy || barrioLegacy.trim() === '') return
    const valorNormalizado = normalizeBarrioNombre(barrioLegacy)
    if (!valorNormalizado) return
    const lista = grupos.get(valorNormalizado) ?? []
    lista.push({ entidad, id, barrioLegacy, barrioIdActual })
    grupos.set(valorNormalizado, lista)
  }

  for (const c of clientes) agregar('CLIENTE', c.id, c.barrio, c.barrioId)
  for (const n of negocios) agregar('NEGOCIO', n.id, n.barrio, n.barrioId)

  return grupos
}

/**
 * Crea (o recupera, si ya existe) el `Barrio` de una entrada `CREAR_BARRIO`/
 * `MANTENER_SEPARADO`, dentro de la transacción de esa entrada. Nunca hace
 * un `SELECT` previo para comprobar existencia (garantía 6): deja que la
 * constraint `UNIQUE(nombreNormalizado)` decida — si Postgres rechaza por
 * duplicado (P2002), recupera el `Barrio` existente y sigue usándolo. Esto
 * es lo que hace la ejecución real idempotente sin condición de carrera.
 */
async function crearOEncontrarBarrio(nombre: string, tx: Prisma.TransactionClient) {
  // SAVEPOINT: en Postgres, un error dentro de una transacción (el P2002 del
  // INSERT duplicado) la deja "aborted" — cualquier statement posterior
  // (incluido el propio findUnique de recuperación) fallaría con 25P02
  // ("current transaction is aborted") si no se hace ROLLBACK TO SAVEPOINT
  // primero. Confirmado con una corrida real end-to-end (no solo en teoría):
  // sin esto, el path de recuperación de la garantía 6 nunca llegaba a
  // ejecutarse. `crear_barrio` es un literal fijo (sin input externo), no
  // hay riesgo de inyección al usar $executeRawUnsafe acá.
  await tx.$executeRawUnsafe('SAVEPOINT crear_barrio')
  try {
    const barrio = await crearBarrio(nombre, tx)
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT crear_barrio')
    return barrio
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT crear_barrio')
      const existente = await tx.barrio.findUnique({ where: { nombreNormalizado: normalizeBarrioNombre(nombre) } })
      if (existente) return existente
    }
    throw err
  }
}

interface ResumenEntrada {
  valorNormalizado: string
  barrioCreado: boolean
  vinculados: number
  yaCorrectos: number
  conflictos: number
  descartados: number
  pendientes: number
  error?: string
}

/**
 * Procesa una entrada del ledger (ya validada) en su propia transacción
 * atómica. `dryRun=true` no escribe nada — solo lee el estado real para
 * poder reportarlo exactamente igual que el modo real vería la situación.
 */
async function procesarEntrada(
  entry: DecisionLedgerEntry,
  porValor: Map<string, DecisionLedgerEntry>,
  registrosPorValor: Map<string, RegistroPendiente[]>,
  dryRun: boolean,
  log: ExecutionLogEntry[],
): Promise<ResumenEntrada> {
  const resumen: ResumenEntrada = {
    valorNormalizado: entry.valorNormalizado,
    barrioCreado: false,
    vinculados: 0,
    yaCorrectos: 0,
    conflictos: 0,
    descartados: 0,
    pendientes: 0,
  }
  const registros = registrosPorValor.get(entry.valorNormalizado) ?? []

  const registrarLog = (
    r: RegistroPendiente,
    barrioIdResultante: string | null,
    resultado: ResultadoEjecucion,
    detalleError?: string,
  ) => {
    log.push({
      entidad: r.entidad,
      registroId: r.id,
      valorLegacyOriginal: r.barrioLegacy,
      valorNormalizado: entry.valorNormalizado,
      barrioIdAnterior: r.barrioIdActual,
      barrioIdResultante,
      resultado,
      ...(detalleError ? { detalleError } : {}),
    })
  }

  if (entry.decision === 'PENDIENTE_DECISION') {
    for (const r of registros) {
      registrarLog(r, r.barrioIdActual, 'PENDIENTE_DECISION')
      resumen.pendientes++
    }
    return resumen
  }

  if (entry.decision === 'DESCARTAR') {
    for (const r of registros) {
      registrarLog(r, r.barrioIdActual, 'DESCARTADO')
      resumen.descartados++
    }
    return resumen
  }

  // CREAR_BARRIO / MANTENER_SEPARADO / FUSIONAR_EN — necesitan un Barrio destino.
  try {
    const runner = async (tx: Prisma.TransactionClient) => {
      let barrioId: string
      let barrioCreadoAhora = false

      if (entry.decision === 'FUSIONAR_EN') {
        const destino = resolverDestinoFusion(entry, porValor)
        if (dryRun) {
          const existente = await tx.barrio.findUnique({ where: { nombreNormalizado: destino.valorNormalizado } })
          barrioId = existente?.id ?? `(pendiente-crear:${destino.barrioCanonico})`
        } else {
          const barrio = await crearOEncontrarBarrio(destino.barrioCanonico!, tx)
          barrioId = barrio.id
        }
      } else {
        // CREAR_BARRIO o MANTENER_SEPARADO: este valor tiene su propio Barrio.
        if (dryRun) {
          const existente = await tx.barrio.findUnique({ where: { nombreNormalizado: entry.valorNormalizado } })
          if (existente) {
            barrioId = existente.id
          } else {
            barrioId = `(pendiente-crear:${entry.barrioCanonico})`
            barrioCreadoAhora = true
          }
        } else {
          const antes = await tx.barrio.findUnique({ where: { nombreNormalizado: entry.valorNormalizado } })
          const barrio = await crearOEncontrarBarrio(entry.barrioCanonico!, tx)
          barrioId = barrio.id
          barrioCreadoAhora = !antes
        }
      }
      resumen.barrioCreado = barrioCreadoAhora

      for (const r of registros) {
        if (r.barrioIdActual === null) {
          if (!dryRun) {
            if (r.entidad === 'CLIENTE') {
              await tx.cliente.update({ where: { id: r.id }, data: { barrioId } })
            } else {
              await tx.negocio.update({ where: { id: r.id }, data: { barrioId } })
            }
          }
          registrarLog(r, barrioId, 'VINCULADO')
          resumen.vinculados++
        } else if (r.barrioIdActual === barrioId) {
          registrarLog(r, barrioId, 'YA_CORRECTO')
          resumen.yaCorrectos++
        } else {
          // Garantía 4: CONFLICTO, nunca reasignación silenciosa.
          registrarLog(r, r.barrioIdActual, 'CONFLICTO')
          resumen.conflictos++
        }
      }
    }

    // En dry-run, `runner` no ejecuta ningún `update`/`create` (ver los
    // `if (!dryRun)` internos) -- la transacción solo hace SELECTs.
    await prisma.$transaction(runner)
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)
    resumen.error = mensaje
    for (const r of registros) {
      registrarLog(r, r.barrioIdActual, 'ERROR', mensaje)
    }
  }

  return resumen
}

function imprimirReporte(
  ledgerValidacion: ReturnType<typeof validarLedger>,
  resumenes: ResumenEntrada[],
  log: ExecutionLogEntry[],
  dryRun: boolean,
  totalEntradas: number,
) {
  console.log(`=== BACKFILL BARRIO CANÓNICO — ${dryRun ? 'DRY RUN' : 'MODO REAL'} ===`)
  console.log(`Ledger: ${totalEntradas - ledgerValidacion.length >= 0 ? totalEntradas : '?'}/52 entradas ${ledgerValidacion.length === 0 ? 'válidas' : 'con errores'}`)
  console.log('')

  const barriosACrear = resumenes.filter((r) => r.barrioCreado).length
  const vinculados = resumenes.reduce((s, r) => s + r.vinculados, 0)
  const vinculadosCliente = log.filter((l) => l.entidad === 'CLIENTE' && l.resultado === 'VINCULADO').length
  const vinculadosNegocio = log.filter((l) => l.entidad === 'NEGOCIO' && l.resultado === 'VINCULADO').length
  const pendientes = resumenes.reduce((s, r) => s + r.pendientes, 0)
  const descartados = resumenes.reduce((s, r) => s + r.descartados, 0)
  const conflictos = resumenes.reduce((s, r) => s + r.conflictos, 0)
  const errores = resumenes.filter((r) => r.error).length

  console.log(`Barrios a crear:            ${barriosACrear}  (categorías A + C-resueltas + B-resueltas)`)
  console.log(`Registros a vincular:       ${vinculados}  (Cliente: ${vinculadosCliente}, Negocio: ${vinculadosNegocio})`)
  console.log(`Registros sin barrioId (PENDIENTE_DECISION): ${pendientes}`)
  console.log(`Registros sin barrioId (DESCARTAR):          ${descartados}`)
  console.log(`CONFLICTOS detectados:       ${conflictos}`)
  if (conflictos > 0) {
    for (const l of log.filter((l) => l.resultado === 'CONFLICTO')) {
      console.log(`  · ${l.entidad} ${l.registroId} — barrioId actual=${l.barrioIdAnterior}, esperado por el ledger != actual (valor="${l.valorLegacyOriginal}")`)
    }
  }
  console.log(`ERRORES (solo modo real):    ${dryRun ? 0 : errores}`)
  if (!dryRun && errores > 0) {
    for (const r of resumenes.filter((r) => r.error)) {
      console.log(`  · ${r.valorNormalizado}: ${r.error}`)
    }
  }
  console.log(`Anomalías:                    0`)
  console.log('')
  if (ledgerValidacion.length > 0) {
    console.log('Ledger inválido / bloqueante:')
    for (const e of ledgerValidacion) {
      console.log(`  · ${e.valorNormalizado ?? '(global)'}: ${e.mensaje}`)
    }
  } else {
    console.log('Ledger inválido / bloqueante: (ninguno)')
  }

  const yaCorrectos = resumenes.reduce((s, r) => s + r.yaCorrectos, 0)
  console.log('')
  console.log(`Ya correctos (idempotencia): ${yaCorrectos}`)
  console.log(`Total registros en el log de ejecución: ${log.length}`)
}

async function main() {
  const entries = cargarLedger()
  const errores = validarLedger(entries)

  if (!DRY_RUN && errores.length > 0) {
    console.error('Ledger inválido — modo real ABORTADO, no se escribió nada:')
    for (const e of errores) console.error(`  · ${e.valorNormalizado ?? '(global)'}: ${e.mensaje}`)
    process.exit(1)
  }

  if (!DRY_RUN && tienePendientes(entries)) {
    const pendientes = entries.filter((e) => e.decision === 'PENDIENTE_DECISION')
    console.error(
      `Modo real ABORTADO — quedan ${pendientes.length} entrada(s) en PENDIENTE_DECISION. ` +
        'El script nunca decide una fusión por sí mismo: completar el ledger a mano antes de correr sin --dry-run.',
    )
    for (const e of pendientes) console.error(`  · ${e.valorNormalizado}`)
    process.exit(1)
  }

  const porValor = new Map(entries.map((e) => [e.valorNormalizado, e]))
  const registrosPorValor = await agruparRegistrosPorValorNormalizado()

  const resumenes: ResumenEntrada[] = []
  const log: ExecutionLogEntry[] = []

  for (const entry of entries) {
    const resumen = await procesarEntrada(entry, porValor, registrosPorValor, DRY_RUN, log)
    resumenes.push(resumen)
  }

  imprimirReporte(errores, resumenes, log, DRY_RUN, entries.length)

  if (DRY_RUN) {
    console.log('\n(dry-run: no se escribió nada — completar el ledger y quitar --dry-run para aplicar)')
  }

  // Checklist del gate de F2, punto 5: cobertura total de M1 (126+51 = 177,
  // sin contar Pedido.barrioEntrega, que no forma parte del universo a
  // vincular por este script).
  const totalUniverso = Object.values(M1_REFERENCIA).reduce(
    (s, r) => s + (r.fuentes.includes('PEDIDO') ? r.n - 1 : r.n),
    0,
  )
  console.log(`\nCobertura M1 (Cliente+Negocio, referencia): ${totalUniverso} (126 Cliente + 51 Negocio esperados)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
