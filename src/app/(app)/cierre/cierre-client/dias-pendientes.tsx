'use client'

import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** #306: un día por cerrar, como lo devuelve GET /api/cierre/pendientes. */
export interface DiaPendienteUI {
  fecha: string
  operaciones: number
  obligatorio: boolean
}

export type EstadoPendientes = 'cargando' | 'error' | 'ok'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function partes(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { d, m: m - 1, dow }
}

/** «sáb 31 oct» */
export function etiquetaDia(fecha: string): string {
  const { d, m, dow } = partes(fecha)
  return `${DIAS[dow]} ${d} ${MESES[m]}`
}

/** «el sábado 31 de octubre» */
export function etiquetaDiaLarga(fecha: string): string {
  const { d, m, dow } = partes(fecha)
  return `${DIAS_LARGO[dow]} ${d} de ${MESES_LARGO[m]}`
}

/** El día más antiguo con movimientos que sigue sin cierre y es anterior a `fecha` (bloquea el cierre de `fecha`). */
export function diaQueBloquea(dias: DiaPendienteUI[], fecha: string): DiaPendienteUI | null {
  const previos = dias.filter((d) => d.obligatorio && d.fecha < fecha).sort((a, b) => a.fecha.localeCompare(b.fecha))
  return previos[0] ?? null
}

function textoEstado(d: DiaPendienteUI, hoy: string, hayBloqueoPrevio: boolean): string {
  if (d.obligatorio) return `${d.operaciones} ${d.operaciones === 1 ? 'movimiento' : 'movimientos'} · hay que cerrarlo`
  if (d.fecha === hoy && hayBloqueoPrevio) return 'Se cierra después de los días con movimientos'
  if (d.fecha === hoy) return 'Hoy'
  return 'Sin movimientos · opcional'
}

interface Props {
  estado: EstadoPendientes
  dias: DiaPendienteUI[]
  fecha: string
  hoy: string
  deshabilitado: boolean
  onElegir: (fecha: string) => void
  onReintentar: () => void
}

/**
 * Elegir qué día se cierra (maqueta A del lote #305/#306/#408/#426). Un día con movimientos no se salta
 * (ni el administrador); uno sin movimientos es opcional y se puede cerrar después.
 */
export function DiasPendientes({ estado, dias, fecha, hoy, deshabilitado, onElegir, onReintentar }: Props) {
  if (estado === 'cargando') {
    return (
      <div data-testid="dias-pendientes-cargando" role="status" className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando días pendientes…
      </div>
    )
  }
  if (estado === 'error') {
    return (
      <div data-testid="dias-pendientes-error" role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
        <p className="font-semibold text-red-900">No se pudo revisar qué días faltan</p>
        <p className="mt-1 text-sm text-red-800">Revisa tu conexión y vuelve a intentar. No se cierra nada mientras tanto.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3 min-h-[44px]" onClick={onReintentar}>Reintentar</Button>
      </div>
    )
  }
  if (dias.length === 0) return null

  const bloqueo = diaQueBloquea(dias, fecha)
  const primeroObligatorio = dias.find((d) => d.obligatorio)
  return (
    <section data-testid="dias-pendientes" aria-labelledby="dias-pendientes-titulo" className="space-y-3 rounded-xl border bg-white p-4">
      <h2 id="dias-pendientes-titulo" className="font-semibold">¿Qué día vas a cerrar?</h2>
      <ul role="radiogroup" aria-labelledby="dias-pendientes-titulo" className="space-y-2">
        {dias.map((d) => {
          const elegido = d.fecha === fecha
          const hayBloqueoPrevio = !!primeroObligatorio && primeroObligatorio.fecha < d.fecha
          return (
            <li key={d.fecha}>
              <button
                type="button"
                role="radio"
                aria-checked={elegido}
                disabled={deshabilitado}
                data-testid={`dia-pendiente-${d.fecha}`}
                onClick={() => onElegir(d.fecha)}
                className={cn(
                  'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-60',
                  elegido ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
                )}
              >
                <span className="font-medium">{etiquetaDia(d.fecha)}{d.fecha === hoy ? ' (hoy)' : ''}</span>
                <span className={cn('text-xs sm:text-sm', d.obligatorio ? 'font-medium text-amber-700' : 'text-muted-foreground')}>
                  {textoEstado(d, hoy, hayBloqueoPrevio)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {bloqueo ? (
        <div data-testid="dias-pendientes-bloqueo" role="alert" className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-red-900">Antes hay un día por cerrar</p>
            <p className="mt-1 text-sm text-red-800">
              {`${etiquetaDiaLarga(bloqueo.fecha).replace(/^./, (c) => c.toUpperCase())} tuvo ${bloqueo.operaciones} ${bloqueo.operaciones === 1 ? 'movimiento' : 'movimientos'}. Ciérralo primero para que su dinero no se pierda de la contabilidad.`}
            </p>
            <Button type="button" className="mt-3 min-h-[44px]" disabled={deshabilitado} onClick={() => onElegir(bloqueo.fecha)}>
              Ir a cerrar {etiquetaDiaLarga(bloqueo.fecha).replace(/^(\S+)\s/, 'el $1 ')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Los días se cierran en orden cuando tienen movimientos. Los días sin movimientos son opcionales y se pueden cerrar cuando quieras.
        </p>
      )}
    </section>
  )
}
