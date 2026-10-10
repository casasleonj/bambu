import type { Prisma, PrismaClient } from '@prisma/client'
import { PARAMETROS_POR_DEFECTO, REGLAS, type ParametrosVerificacion, type Regla, type Severidad } from './reglas'

export interface Hallazgo {
  ref: string
  numero: number | null
  detalle: Record<string, unknown>
}

export interface ResultadoRegla {
  id: string
  titulo: string
  severidad: Severidad
  cantidad: number
  /** Primeros `maxMuestras` hallazgos; `cantidad` cuenta todos. */
  hallazgos: Hallazgo[]
}

export interface ReporteIntegridad {
  generadoEn: string
  parametros: { corteReceivable: string; diasReportado: number }
  resumen: Record<Severidad, number>
  reglas: ResultadoRegla[]
}

export interface OpcionesVerificacion {
  parametros?: Partial<ParametrosVerificacion>
  maxMuestras?: number
  reglas?: readonly Regla[]
}

type TxCliente = Prisma.TransactionClient

/**
 * Ejecuta `fn` dentro de una transacción READ ONLY. Postgres rechaza cualquier
 * escritura con SQLSTATE 25006 (`read_only_sql_transaction`), aunque un bug
 * del llamador intente escribir.
 */
export async function enSoloLectura<T>(prisma: PrismaClient, fn: (tx: TxCliente) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      return fn(tx)
    },
    { timeout: 60_000, maxWait: 10_000 },
  )
}

/**
 * Verificador de integridad (plan v1.2 §5.A, PR-A). Solo lectura: devuelve el
 * reporte al llamador. No escribe en `Historial` ni en otra tabla, no notifica
 * y no corrige nada.
 */
export async function verificarIntegridad(
  prisma: PrismaClient,
  opciones: OpcionesVerificacion = {},
): Promise<ReporteIntegridad> {
  const parametros: ParametrosVerificacion = { ...PARAMETROS_POR_DEFECTO, ...opciones.parametros }
  const maxMuestras = opciones.maxMuestras ?? 50
  const reglas = opciones.reglas ?? REGLAS

  const resultados = await enSoloLectura(prisma, async (tx) => {
    const salida: ResultadoRegla[] = []
    for (const regla of reglas) {
      const filas = await tx.$queryRaw<Hallazgo[]>(regla.consulta(parametros))
      salida.push({
        id: regla.id,
        titulo: regla.titulo,
        severidad: regla.severidad,
        cantidad: filas.length,
        hallazgos: filas.slice(0, maxMuestras).map((f) => ({
          ref: String(f.ref),
          numero: f.numero === null ? null : Number(f.numero),
          detalle: f.detalle,
        })),
      })
    }
    return salida
  })

  const resumen: Record<Severidad, number> = { CRITICA: 0, ALTA: 0, MEDIA: 0, INFO: 0 }
  for (const r of resultados) resumen[r.severidad] += r.cantidad

  return {
    generadoEn: new Date().toISOString(),
    parametros: {
      corteReceivable: parametros.corteReceivable.toISOString(),
      diasReportado: parametros.diasReportado,
    },
    resumen,
    reglas: resultados,
  }
}
