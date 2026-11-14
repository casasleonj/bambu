/**
 * #688 — la base de caja de un día (el efectivo con el que empezó) es UNA sola fuente: Config `BASE_DIA_<fecha>`,
 * la que se ingresa al empezar el día o se edita en «Caja base». El cierre solo la LEE: no inventa un valor por
 * defecto ni acepta el que mande la pantalla si no es la vigente.
 */
import type { Prisma } from '@prisma/client'

export const claveBaseDia = (fecha: string): string => `BASE_DIA_${fecha}`

export interface BaseDelDia { valor: number; actualizadaAt: Date }

/** La base vigente de la fecha, o null si no se ingresó (o es 0: sin efectivo inicial no hay cierre). */
export async function leerBaseDelDia(db: Pick<Prisma.TransactionClient, 'config'>, fecha: string): Promise<BaseDelDia | null> {
  const c = await db.config.findUnique({ where: { clave: claveBaseDia(fecha) } })
  if (!c) return null
  const valor = Number(c.valor)
  return Number.isFinite(valor) && valor > 0 ? { valor, actualizadaAt: c.updatedAt } : null
}

export class BaseFaltanteError extends Error {
  readonly code = 'BASE_FALTANTE'
  constructor(readonly fecha: string) { super('BASE_FALTANTE') }
}
export class BaseCambioError extends Error {
  readonly code = 'BASE_CAMBIO'
  constructor(readonly baseVigente: number, readonly baseEnviada: number) { super('BASE_CAMBIO') }
}

/** Lanza si la fecha no tiene base o si la enviada no es la vigente. Se llama dentro del lock del cierre. */
export async function exigirBaseVigente(db: Pick<Prisma.TransactionClient, 'config'>, fecha: string, baseEnviada: number): Promise<number> {
  const base = await leerBaseDelDia(db, fecha)
  if (!base) throw new BaseFaltanteError(fecha)
  if (base.valor !== Number(baseEnviada)) throw new BaseCambioError(base.valor, Number(baseEnviada))
  return base.valor
}
