import { parseDateParam } from './dates'

export interface RangoJornadas {
  desde: string
  hasta: string
}

const DIA_MS = 86_400_000
const MAX_JORNADAS_DIAGNOSTICO = 31

function fechaCivil(dia: string): number {
  if (!dia || parseDateParam(dia, '') !== dia) throw new Error('Jornada inválida')
  return new Date(`${dia}T00:00:00Z`).getTime()
}

const diaCivil = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Ensayo de corte: no escoge fecha operativa ni autoriza liquidar ninguna jornada. */
export function planificarVentanasReparto(desde: string, hasta: string, corte: string) {
  const inicio = fechaCivil(desde)
  const fin = fechaCivil(hasta)
  const umbral = fechaCivil(corte)
  if (inicio > fin) throw new Error('Período invertido')
  const previo: RangoJornadas | null = inicio < umbral
    ? { desde, hasta: diaCivil(Math.min(fin, umbral - DIA_MS)) }
    : null
  const ventanas: RangoJornadas[] = []
  for (let cursor = Math.max(inicio, umbral); cursor <= fin;) {
    const ultimo = Math.min(fin, cursor + (MAX_JORNADAS_DIAGNOSTICO - 1) * DIA_MS)
    ventanas.push({ desde: diaCivil(cursor), hasta: diaCivil(ultimo) })
    cursor = ultimo + DIA_MS
  }
  return { modo: 'SIMULACION_NO_LIQUIDABLE' as const, corte, previo, ventanas, liquidable: false as const }
}
