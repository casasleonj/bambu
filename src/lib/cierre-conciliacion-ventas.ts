import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'

// Evidencia administrativa append-only; no muta pedidos, NC ni cierres.
export const ENTIDAD_CONCILIACION_VENTAS = 'ConciliacionVentaCierre'
export const MAX_CENTAVOS_CONCILIACION = 9_999_999_999 // CierreDia.totalVentas: Decimal(10,2)
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const linea = z.object({
  dia, centavos: z.number().int().min(0).max(MAX_CENTAVOS_CONCILIACION),
  referencia: z.string().trim().min(15).max(500),
}).strict()
export const ConciliacionVentasDatos = z.object({
  huella: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.number().int().positive(),
  operacion: z.enum(['RESOLVER', 'REVOCAR']),
  lineas: z.array(linea).max(366),
}).strict().superRefine((d, ctx) => {
  if ((d.operacion === 'RESOLVER') !== (d.lineas.length > 0) ||
      new Set(d.lineas.map(l => l.dia)).size !== d.lineas.length) {
    ctx.addIssue({ code: 'custom', message: 'Días inválidos o repetidos' })
  }
})
export const ConciliacionVentasSolicitud = z.object({
  fecha: dia, pedidoId: z.string().min(1).max(160),
  revisionEsperada: z.string().nullable(),
  huella: z.string().regex(/^[a-f0-9]{64}$/),
  operacion: z.enum(['RESOLVER', 'REVOCAR']),
  lineas: z.array(linea).max(366),
  confirmoEvidencia: z.literal(true),
}).strict()
export type LineaConciliacionVenta = z.infer<typeof linea>
export type SolicitudConciliacion = z.infer<typeof ConciliacionVentasSolicitud>
export interface CasoConciliacionVenta {
  huella: string
  dias: string[]
  revision: string | null
}
export interface ConciliacionVentaAplicada {
  pedidoId: string
  numero: number | null
  huella: string
  revision: string
  lineas: LineaConciliacionVenta[]
}
export const claveConciliacion = (fecha: string, pedidoId: string) => JSON.stringify([fecha, pedidoId])
export const huellaConciliacion = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
export type UltimaConciliacion = z.infer<typeof ConciliacionVentasDatos> & { id: string }
type Db = Pick<Prisma.TransactionClient, 'historial'>

export async function leerUltimasConciliaciones(db: Db, fecha: string, ids: string[]) {
  const resultado = new Map<string, UltimaConciliacion>()
  if (!ids.length) return resultado
  const claves = new Map(ids.map(id => [claveConciliacion(fecha, id), id]))
  const filas = await db.historial.findMany({
    where: { entidad: ENTIDAD_CONCILIACION_VENTAS, registroId: { in: [...claves.keys()] }, accion: 'CREATE' },
    select: { id: true, registroId: true, datos: true, usuarioId: true },
  })
  const invalidas = new Set<string>()
  for (const f of filas) {
    const id = claves.get(f.registroId)
    if (!id) continue
    try {
      const datos = ConciliacionVentasDatos.safeParse(JSON.parse(f.datos))
      if (!datos.success || !f.usuarioId || f.id !== huellaConciliacion([f.registroId, datos.data.version])) {
        invalidas.add(id); continue
      }
      const anterior = resultado.get(id)
      if (!anterior || anterior.version < datos.data.version) resultado.set(id, { ...datos.data, id: f.id })
    } catch { invalidas.add(id) }
  }
  // Una traza malformada nunca vuelve válida una autorización anterior.
  if (invalidas.size) throw new Error('CONCILIACION_VENTAS_HISTORIAL_INVALIDO')
  return resultado
}

export function lineasCoinciden(dias: readonly string[], lineas: readonly LineaConciliacionVenta[]): boolean {
  return dias.length > 0 && lineas.length === dias.length &&
    new Set(lineas.map(l => l.dia)).size === dias.length &&
    dias.every(d => lineas.some(l => l.dia === d)) &&
    lineas.every(l => linea.safeParse(l).success) &&
    lineas.reduce((s, l) => s + l.centavos, 0) <= MAX_CENTAVOS_CONCILIACION
}
