// @tests prisma/migrations/20261103_embarque_numero_autoridad_unica (#427)
// Mismo escenario y exigencias que la migración de #401 para Pedido, ahora para
// Embarque.numero: en un schema temporal con el DEFAULT del serial atrasado,
// `embarque_numero_seq` adelantada y números repetidos, aplica el SQL real y exige
// que no renumere, marque solo la fila más reciente de cada repetido, que el DEFAULT
// y getNextNumero compartan secuencia, que 20 altas concurrentes no repitan, que
// rechace un número usado, que nadie ponga la marca y que sea idempotente.
// Y en la base real: el repositorio de embarques numera con esa secuencia.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Prisma } from '@prisma/client'
import { testPrisma, disconnect } from './setup'
import { getNextNumero } from '@/lib/sequence'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'

const SCHEMA = 'proto_numeracion_427'
const MIGRACION = readFileSync(
  resolve(__dirname, '../../../../prisma/migrations/20261103_embarque_numero_autoridad_unica/migration.sql'),
  'utf8',
)

/** Parte el SQL en sentencias, respetando los cuerpos `$$ … $$`. */
function sentencias(sql: string): string[] {
  const sinComentarios = sql
    .split('\n')
    .map((l) => (l.trimStart().startsWith('--') ? '' : l))
    .join('\n')
  const salida: string[] = []
  let actual = ''
  let enDolar = false
  for (let i = 0; i < sinComentarios.length; i++) {
    if (sinComentarios.startsWith('$$', i)) {
      enDolar = !enDolar
      actual += '$$'
      i++
      continue
    }
    const c = sinComentarios[i]
    if (c === ';' && !enDolar) {
      if (actual.trim()) salida.push(actual.trim())
      actual = ''
    } else {
      actual += c
    }
  }
  if (actual.trim()) salida.push(actual.trim())
  return salida
}

function enSchema<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return testPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${SCHEMA}`)
    return fn(tx)
  }, { timeout: 30_000 })
}

async function aplicarMigracion() {
  await enSchema(async (tx) => {
    for (const s of sentencias(MIGRACION)) await tx.$executeRawUnsafe(s)
  })
}

type Fila = { id: string; numero: number; numeroColisionHistorica: boolean }
const filas = () =>
  enSchema((tx) => tx.$queryRawUnsafe<Fila[]>(`SELECT id, numero, "numeroColisionHistorica" FROM "Embarque" ORDER BY id`))

const insertarDefault = (id: string) =>
  enSchema((tx) => tx.$queryRawUnsafe<Array<{ numero: number }>>(`INSERT INTO "Embarque"(id) VALUES ('${id}') RETURNING numero`))

describe('Migración 20261103 — una sola autoridad de numeración (#427)', () => {
  let antes: Fila[]

  beforeAll(async () => {
    await testPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await testPrisma.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA}`)
    await enSchema(async (tx) => {
      // Forma mínima de "Embarque" tal como lo deja `prisma db push` (serial).
      await tx.$executeRawUnsafe(`CREATE TABLE "Embarque" (id text PRIMARY KEY, numero serial NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now())`)
      await tx.$executeRawUnsafe(`CREATE SEQUENCE embarque_numero_seq`)
      // La app numeró hasta 10 con su secuencia; el DEFAULT quedó en 1 y luego
      // repitió el 2 y el 3 (la fila más reciente de cada par es la *-dup).
      await tx.$executeRawUnsafe(`
        INSERT INTO "Embarque"(id, numero, "createdAt")
        SELECT 'p' || lpad(n::text, 2, '0'), n, timestamp '2026-01-01' + n * interval '1 day' FROM generate_series(1, 10) n`)
      await tx.$executeRawUnsafe(`SELECT setval('embarque_numero_seq', 10, true)`)
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Embarque"', 'numero'), 1, true)`)
      await tx.$executeRawUnsafe(`INSERT INTO "Embarque"(id, "createdAt") VALUES ('p02-dup', '2026-03-01'), ('p03-dup', '2026-03-02')`)
    })
    // Antes de la migración no hay columna de marca.
    antes = await enSchema((tx) => tx.$queryRawUnsafe<Fila[]>(`SELECT id, numero, false AS "numeroColisionHistorica" FROM "Embarque" ORDER BY id`))
    expect(antes.find((f) => f.id === 'p03-dup')?.numero).toBe(3)

    await aplicarMigracion()
  })

  afterAll(async () => {
    await testPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await disconnect()
  })

  it('no renumera y marca solo la fila más reciente de cada número repetido', async () => {
    const despues = await filas()
    expect(despues.map(({ id, numero }) => ({ id, numero }))).toEqual(antes.map(({ id, numero }) => ({ id, numero })))
    expect(despues.filter((f) => f.numeroColisionHistorica).map((f) => f.id)).toEqual(['p02-dup', 'p03-dup'])
  })

  it('el DEFAULT y getNextNumero comparten la secuencia, por encima del máximo', async () => {
    const [{ numero: porDefault }] = await insertarDefault('d1')
    const porApp = await enSchema((tx) => getNextNumero(tx, { model: 'embarque' }))
    expect(porDefault).toBe(11)
    expect(porApp).toBe(12)
    const viejas = await enSchema((tx) =>
      tx.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM pg_sequences WHERE schemaname = '${SCHEMA}' AND sequencename = 'Embarque_numero_seq'`),
    )
    expect(viejas).toEqual([])
  })

  it('20 altas concurrentes (DEFAULT y getNextNumero) no repiten número', async () => {
    const numeros = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0
          ? insertarDefault(`c${i}`).then((r) => r[0].numero)
          : enSchema(async (tx) => {
              const n = await getNextNumero(tx, { model: 'embarque' })
              await tx.$executeRawUnsafe(`INSERT INTO "Embarque"(id, numero) VALUES ('c${i}', ${n})`)
              return n
            }),
      ),
    )
    expect(new Set(numeros).size).toBe(20)
  })

  it('rechaza un número ya usado', async () => {
    await expect(
      enSchema((tx) => tx.$executeRawUnsafe(`INSERT INTO "Embarque"(id, numero) VALUES ('repite', 5)`)),
    ).rejects.toThrow(/Embarque_numero_unico_key|23505/)
  })

  it('nadie puede poner la marca después de la migración', async () => {
    await expect(
      enSchema((tx) => tx.$executeRawUnsafe(`INSERT INTO "Embarque"(id, numero, "numeroColisionHistorica") VALUES ('marca', 5, true)`)),
    ).rejects.toThrow(/numeroColisionHistorica/)
    await expect(
      enSchema((tx) => tx.$executeRawUnsafe(`UPDATE "Embarque" SET "numeroColisionHistorica" = true WHERE id = 'p05'`)),
    ).rejects.toThrow(/numeroColisionHistorica/)
  })

  it('aplicarla otra vez no cambia nada ni retrocede la secuencia', async () => {
    const previo = await filas()
    await aplicarMigracion()
    expect(await filas()).toEqual(previo)
    const max = Math.max(...previo.map((f) => f.numero))
    const [{ numero }] = await insertarDefault('d2')
    expect(numero).toBe(max + 1)
  })

  it('la base de tests real tiene el índice, el trigger y una sola secuencia', async () => {
    const [estado] = await testPrisma.$queryRawUnsafe<Array<{ indice: boolean; trigger: boolean; vieja: boolean; defecto: string }>>(`
      SELECT
        EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'Embarque_numero_unico_key') AS indice,
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'Embarque_proteger_colision_historica' AND tgrelid = '"Embarque"'::regclass) AS trigger,
        EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = current_schema() AND sequencename = 'Embarque_numero_seq') AS vieja,
        (SELECT column_default FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'Embarque' AND column_name = 'numero') AS defecto`)
    expect(estado).toMatchObject({ indice: true, trigger: true, vieja: false })
    expect(estado.defecto).toContain('embarque_numero_seq')
  })

  it('el repositorio de embarques toma el número de la secuencia, no del conteo del día', async () => {
    const repo = new PrismaEmbarqueRepository()
    const a = await repo.getNextNumero()
    const b = await repo.getNextNumero()
    expect(b).toBe(a + 1)
    const [{ max }] = await testPrisma.$queryRawUnsafe<Array<{ max: number | null }>>(`SELECT MAX(numero)::int AS max FROM "Embarque"`)
    expect(a).toBeGreaterThan(max ?? 0)
  })
})
