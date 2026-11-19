import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { huellaConciliacion, MAX_CENTAVOS_CONCILIACION } from '@/lib/cierre-conciliacion-ventas'
import { dayInBogota } from '@/lib/date-helpers'

// Solo ajustes comerciales inciertos. No se difiere la lectura de cobros,
// ni precios de entregas de hoy, ni un fallo de inventario.
const motivos = z.enum(['REVERSA_AMBIGUA', 'CUMPLIMIENTO_NO_VERIFICADO', 'VENTA_PREVIA_SIN_DETALLE_DE_CIERRE', 'NOTA_SIN_REVERSA_IDENTIFICADA'])
const caso = z.object({ id: z.string().length(64), pedidoId: z.string().min(1), motivo: motivos, numero: z.number().int().nullable() })
const snapshot = z.object({ version: z.literal(1), huella: z.string().length(64), subtotalCentavos: z.number().int(), casos: z.array(caso).min(1) })
export type VentasProvisional = z.infer<typeof snapshot>
export const ENTIDAD_REGULARIZACION = 'RegularizacionVentaCierre'
const pub = z.object({
  version: z.number().int().positive(), huella: z.string().length(64), casoId: z.string().length(64),
  operacion: z.enum(['RESOLVER', 'REVOCAR']), centavos: z.number().int().min(0).max(MAX_CENTAVOS_CONCILIACION),
  referencia: z.string().trim().min(15).max(500),
}).strict().refine(v => v.operacion !== 'REVOCAR' || v.centavos === 0)
export const SolicitudRegularizacion = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  casoId: z.string().length(64), huella: z.string().length(64),
  revisionEsperada: z.string().nullable(),
  operacion: z.enum(['RESOLVER', 'REVOCAR']),
  centavos: z.number().int().min(0).max(MAX_CENTAVOS_CONCILIACION),
  referencia: z.string().trim().min(15).max(500), confirmoEvidencia: z.literal(true),
}).strict().refine(v => v.operacion !== 'REVOCAR' || v.centavos === 0)
type Revision = z.infer<typeof pub> & { id: string; actor: string; fecha: string }
type Db = Pick<Prisma.TransactionClient, 'historial'>

export function prepararVentasProvisional(r: {
  fecha: string; totalVentas: number; ventasPorConciliar: readonly { pedidoId: string; motivo: string; numero?: number | null }[];
  unidadesError?: boolean; unidadesAproximadas?: readonly { unidades: object }[];
}): VentasProvisional | null {
  if (!r.ventasPorConciliar.length || r.unidadesError ||
    r.unidadesAproximadas?.some(p => Object.values(p.unidades).some(v => v !== 0))) return null
  const subtotalCentavos = Math.round(r.totalVentas * 100)
  if (!Number.isSafeInteger(subtotalCentavos) || Math.abs(subtotalCentavos) > MAX_CENTAVOS_CONCILIACION) return null
  const casos: VentasProvisional['casos'] = []
  for (const p of r.ventasPorConciliar) {
    const motivo = motivos.safeParse(p.motivo)
    if (!motivo.success) return null
    casos.push({ id: huellaConciliacion([r.fecha, p.pedidoId, p.motivo]), pedidoId: p.pedidoId, motivo: motivo.data, numero: p.numero ?? null })
  }
  casos.sort((a,b) => a.id.localeCompare(b.id))
  if (new Set(casos.map(p => p.id)).size !== casos.length) return null
  // Incluye el contexto de revisión (huella/días) y el subtotal, para no
  // aceptar una autorización si el problema o el importe cambió.
  const contexto = [...r.ventasPorConciliar].sort((a,b) =>
    a.pedidoId.localeCompare(b.pedidoId) || a.motivo.localeCompare(b.motivo))
  return { version: 1, huella: huellaConciliacion([r.fecha, subtotalCentavos, casos, contexto]), subtotalCentavos, casos }
}

export function leerSnapshotProvisional(reporte: unknown): VentasProvisional | null {
  if (!reporte || typeof reporte !== 'object' || Array.isArray(reporte)) return null
  const r = reporte as Record<string, unknown>
  if (r.ventasEstado !== 'PROVISIONAL') return null
  const p = snapshot.safeParse(r.ventasProvisional)
  if (!p.success || new Set(p.data.casos.map(c => c.id)).size !== p.data.casos.length ||
      Math.abs(p.data.subtotalCentavos) > MAX_CENTAVOS_CONCILIACION) throw Error('SNAPSHOT_PROVISIONAL_INVALIDO')
  return p.data
}
export const claveRegularizacion = (cierreId: string, casoId: string) => JSON.stringify([cierreId, casoId])
export function proyectarRegularizacion(p: VentasProvisional, revisiones: ReadonlyMap<string, Revision>) {
  const casos = p.casos.map(c => ({ ...c, revision: revisiones.get(c.id) ?? null }))
  const pendientes = casos.filter(c => c.revision?.operacion !== 'RESOLVER').length
  const ajusteCentavos = casos.reduce((s,c) => s + (c.revision?.operacion === 'RESOLVER' ? c.revision.centavos : 0), 0)
  const subtotal = p.subtotalCentavos - ajusteCentavos
  if (!Number.isSafeInteger(subtotal) || Math.abs(subtotal) > MAX_CENTAVOS_CONCILIACION) throw Error('REGULARIZACION_FUERA_DE_RANGO')
  return { huella: p.huella, estado: pendientes ? 'PROVISIONAL' as const : 'REGULARIZADO' as const, pendientes,
    subtotalOriginal: p.subtotalCentavos / 100, ajustePosterior: ajusteCentavos / 100,
    subtotalIdentificado: subtotal / 100, totalCertificado: pendientes ? null : subtotal / 100, casos }
}
export type RegularizacionVentas = ReturnType<typeof proyectarRegularizacion>

export async function leerRegularizaciones(db: Db, cierres: readonly { id: string; reporte: unknown; totalVentas: unknown; fecha: Date }[]) {
  const pendientes = cierres.flatMap(c => {
    const p = leerSnapshotProvisional(c.reporte)
    if (!p) return []
    if (p.subtotalCentavos !== Math.round(Number(c.totalVentas) * 100)) throw Error('SUBTOTAL_PROVISIONAL_INVALIDO')
    return [{ cierre: c, p }]
  })
  const claves = new Map(pendientes.flatMap(({ cierre, p }) => p.casos.map(c => [claveRegularizacion(cierre.id, c.id), { cierreId: cierre.id, p, c }] as const)))
  const filas = claves.size ? await db.historial.findMany({
    where: { entidad: ENTIDAD_REGULARIZACION, accion: 'CREATE', registroId: { in: [...claves.keys()] } },
    select: { id: true, registroId: true, datos: true, usuarioId: true, fecha: true },
  }) : []
  const revisiones = new Map<string, Map<string, Revision>>()
  const versiones = new Map<string, number[]>()
  for (const f of filas) {
    const clave = claves.get(f.registroId)
    const d = pub.safeParse(JSON.parse(f.datos))
    if (!clave || !d.success || !f.usuarioId || d.data.huella !== clave.p.huella || d.data.casoId !== clave.c.id ||
        f.id !== huellaConciliacion([f.registroId, d.data.version])) throw Error('REGULARIZACION_HISTORIAL_INVALIDO')
    const hist = versiones.get(f.registroId) ?? []
    hist.push(d.data.version); versiones.set(f.registroId, hist)
    const m = revisiones.get(clave.cierreId) ?? new Map<string, Revision>()
    if ((m.get(clave.c.id)?.version ?? 0) < d.data.version)
      m.set(clave.c.id, { ...d.data, id: f.id, actor: f.usuarioId, fecha: f.fecha.toISOString() })
    revisiones.set(clave.cierreId, m)
  }
  for (const v of versiones.values()) if (v.sort((a,b) => a-b).some((n,i) => n !== i+1)) throw Error('REGULARIZACION_HISTORIAL_INCOMPLETO')
  return new Map(pendientes.map(({ cierre, p }) => [cierre.id, proyectarRegularizacion(p, revisiones.get(cierre.id) ?? new Map())]))
}

export async function listarProvisionales(db: Pick<Prisma.TransactionClient, 'cierreDia' | 'historial'>) {
  const cierres = await db.cierreDia.findMany({
    where: { reporte: { path: ['ventasEstado'], equals: 'PROVISIONAL' } },
    select: { id: true, fecha: true, totalVentas: true, reporte: true }, orderBy: { fecha: 'asc' },
  })
  const estados = await leerRegularizaciones(db, cierres)
  return cierres.flatMap(c => {
    const r = estados.get(c.id)
    return r?.pendientes ? [{ fecha: dayInBogota(c.fecha), pendientes: r.pendientes }] : []
  })
}
