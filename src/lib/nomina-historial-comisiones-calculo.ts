import { dayInBogota } from './date-helpers'

export interface PagoHistorialComision {
  id: string
  trabajadorId: string
  nombre: string
  concepto: string
  fechaTrabajo: string
  fechaPagoReal: string | null
  registradoAt: string
  monto: number
  metodo: string
  registradoPor: string | null
  correccion: { anterior: string | null; nueva: string; motivo: string; por: string; at: string } | null
}

export const claveJornadaComision = (p: Pick<PagoHistorialComision, 'trabajadorId' | 'fechaTrabajo' | 'concepto'>) =>
  JSON.stringify([p.trabajadorId, p.fechaTrabajo, p.concepto])

export function resumirPagosComision(pagos: readonly PagoHistorialComision[]) {
  const suma = pagos.reduce((s, p) => s + Math.round(p.monto * 100), 0)
  const efectivo = pagos.reduce((s, p) => s + (p.metodo === 'EFECTIVO' ? Math.round(p.monto * 100) : 0), 0)
  return { cantidadPagos: pagos.length, monto: suma / 100, efectivo: efectivo / 100,
    otrosMedios: (suma - efectivo) / 100, sinFechaVerificada: pagos.filter(p => p.fechaPagoReal === null).length }
}

export function agruparHistorialComisiones(pagos: readonly PagoHistorialComision[]) {
  const grupos = new Map<string, { trabajadorId: string; nombre: string; fechaTrabajo: string; concepto: string; pagos: PagoHistorialComision[] }>()
  const vistos = new Set<string>()
  for (const p of pagos) {
    if (vistos.has(p.id)) throw new Error('Pago repetido en historial de comisiones')
    vistos.add(p.id)
    const clave = claveJornadaComision(p)
    const grupo = grupos.get(clave) ?? { trabajadorId: p.trabajadorId, nombre: p.nombre, fechaTrabajo: p.fechaTrabajo, concepto: p.concepto, pagos: [] }
    grupo.pagos.push(p)
    grupos.set(clave, grupo)
  }
  return [...grupos.values()].sort((a, b) => b.fechaTrabajo.localeCompare(a.fechaTrabajo)
    || a.trabajadorId.localeCompare(b.trabajadorId) || a.concepto.localeCompare(b.concepto))
    .map(g => ({ ...g, pagos: g.pagos.sort((a, b) => a.registradoAt.localeCompare(b.registradoAt) || a.id.localeCompare(b.id)),
      subtotalFiltro: resumirPagosComision(g.pagos) }))
}

/** NULL conserva la ausencia de evidencia. La captura no acredita el desembolso. */
export function diaPagoParaConsulta(p: Pick<PagoHistorialComision, 'fechaPagoReal' | 'registradoAt'>) {
  return p.fechaPagoReal ?? dayInBogota(new Date(p.registradoAt))
}
