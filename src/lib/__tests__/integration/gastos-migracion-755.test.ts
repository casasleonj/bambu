/**
 * #755 · Prueba adversarial de SQL real. El CI habitual hace `prisma db push`,
 * por lo que NO ejecuta la migración `migration.sql`. Esta prueba sí la ejecuta
 * contra una tabla TEMPORAL que simula Gasto anterior a la ampliación.
 * Nunca modifica la tabla real de Gastos ni los registros de la empresa.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { testPrisma, disconnect } from './setup'

const migration = readFileSync(resolve(
  process.cwd(), 'prisma/migrations/20261122_gasto_anulacion_auditada_755/migration.sql',
), 'utf8')

type Column = { attname: string; tipo: string; attnotnull: boolean; porDefecto: string | null }

describe('#755 migración aditiva real sobre Gasto histórico simulado', () => {
  afterAll(async () => { await disconnect() })

  it('preserva filas y dinero, añade columnas correctas y es reejecutable', async () => {
    await testPrisma.$transaction(async tx => {
      // Una tabla temporal con el mismo nombre sombrea public."Gasto" SOLO
      // en esta conexión y transacción. PostgreSQL la descarta al COMMIT.
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE "Gasto" (
          "id" TEXT PRIMARY KEY,
          "monto" NUMERIC(10,2) NOT NULL,
          "descripcion" TEXT
        ) ON COMMIT DROP
      `)
      await tx.$executeRawUnsafe(`
        INSERT INTO "Gasto" ("id", "monto", "descripcion")
        VALUES ('gasto-historico', 12345.67, 'Registro preservado')
      `)

      await tx.$executeRawUnsafe(migration)
      await tx.$executeRawUnsafe(migration) // idempotencia IF NOT EXISTS

      const filas = await tx.$queryRawUnsafe<Array<{
        id: string; monto: unknown; descripcion: string; version: number;
        anuladoAt: Date | null; montoAntesAnular: unknown | null; motivoAnulacion: string | null
      }>>(`
        SELECT "id","monto","descripcion","version","anuladoAt",
          "montoAntesAnular","motivoAnulacion" FROM "Gasto"
      `)
      expect(filas).toHaveLength(1)
      expect(filas[0].id).toBe('gasto-historico')
      expect(Number(filas[0].monto)).toBe(12345.67)
      expect(filas[0].descripcion).toBe('Registro preservado')
      expect(filas[0].version).toBe(0)
      expect(filas[0].anuladoAt).toBeNull()
      expect(filas[0].montoAntesAnular).toBeNull()
      expect(filas[0].motivoAnulacion).toBeNull()

      const columnas = await tx.$queryRawUnsafe<Column[]>(`
        SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS tipo,
          a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS "porDefecto"
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = '"Gasto"'::regclass
          AND a.attname IN ('version', 'anuladoAt', 'montoAntesAnular', 'motivoAnulacion')
          AND a.attnum > 0 AND NOT a.attisdropped
      `)
      expect(columnas).toHaveLength(4)
      const porNombre = new Map(columnas.map(col => [col.attname, col]))
      expect(porNombre.get('version')?.tipo).toBe('integer')
      expect(porNombre.get('version')?.attnotnull).toBe(true)
      expect(porNombre.get('version')?.porDefecto).toBe('0')
      expect(porNombre.get('anuladoAt')?.tipo).toContain('with time zone')
      expect(porNombre.get('montoAntesAnular')?.tipo).toBe('numeric(10,2)')
      expect(porNombre.get('motivoAnulacion')?.tipo).toBe('character varying(500)')
    }, { timeout: 30000 })
  })
})
