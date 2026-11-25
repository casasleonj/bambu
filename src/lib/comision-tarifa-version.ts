import { z } from 'zod'
import { parseDateParam } from './dates'

const tarifa = z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine(v => Number(v) <= 99999999.99)
const plan = z.object({
  version: z.literal(1), rol: z.string(), tipoPago: z.enum(['FIJO','COMISION','MIXTO']), usaMoto: z.boolean(),
  comPacaAgua: tarifa, comPacaHielo: tarifa, comBotellon: tarifa,
  comRepartAgua: tarifa, comRepartHielo: tarifa, comRepartBotellon: tarifa,
})
const general = z.object({ version: z.literal(1), valor: z.string().nullable() })
export type AmbitoTarifa = 'TRABAJADOR' | 'COM_REPARTIDOR'
export type VersionTarifa = { id: bigint; ambito: string; trabajadorId: string | null; fechaVigencia: Date; registradoAt: Date; datos: unknown }
export function diaVigenciaNormal(instante: Date): string {
  const hoy = instante.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const dia = new Date(hoy + 'T00:00:00Z')
  dia.setUTCDate(dia.getUTCDate()+1)
  return dia.toISOString().slice(0,10)
}

/** Selecciona una sola versión por ámbito y jornada. No infiere fechas anteriores
 * al baseline ni salta una versión no interpretable para usar otra antigua.
 * No es todavía un cálculo de nómina ni acredita lo realmente pagado. */
export function resolverVersionTarifa(versiones: readonly VersionTarifa[], ambito: AmbitoTarifa, trabajadorId: string | null, dia: string) {
  if (parseDateParam(dia, '') !== dia || !dia || (ambito==='TRABAJADOR' ? !trabajadorId : trabajadorId!==null)) {
    throw new Error('Identidad o jornada de tarifa inválida')
  }
  const candidatas = versiones.filter(v => v.ambito===ambito && v.trabajadorId===trabajadorId && v.fechaVigencia.toISOString().slice(0,10)<=dia)
  const elegida = candidatas.reduce<VersionTarifa | undefined>((actual,v) => {
    if (!actual || v.fechaVigencia>actual.fechaVigencia || (v.fechaVigencia.getTime()===actual.fechaVigencia.getTime() && v.id>actual.id)) return v
    return actual
  }, undefined)
  if (!elegida) return { estado: 'SIN_EVIDENCIA' as const }
  const parsed = ambito==='TRABAJADOR' ? plan.safeParse(elegida.datos) : general.safeParse(elegida.datos)
  if (!parsed.success) return { estado: 'NO_INTERPRETABLE' as const, versionId: elegida.id.toString() }
  return { estado: 'REGISTRADA' as const, versionId: elegida.id.toString(), fechaVigencia: elegida.fechaVigencia.toISOString().slice(0,10), datos: parsed.data }
}
