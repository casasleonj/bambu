'use client'

import {
  DIAS_SEMANA, ORDEN_DIAS, normalizarHorario, type TramoHorario,
} from '@/lib/negocio-horario'

const inputHora = 'w-[7.25rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100'

function sumarHoras(hhmm: string, horas: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const t = Math.min(h * 60 + m + horas * 60, 23 * 60 + 59)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/**
 * #836 F2 — Editor del horario de atención semanal de UN negocio. Varios tramos por día (turno
 * partido); un día sin tramos está cerrado; sin ningún tramo = «sin horario configurado».
 * Maqueta aprobada: docs/agentes/maquetas/836-programacion-entregas/ (03/04, pantalla 1).
 */
export function NegocioHorarioEditor({
  value, onChange, errores, disabled = false,
}: {
  value: TramoHorario[]
  onChange: (v: TramoHorario[]) => void
  errores: string[]
  disabled?: boolean
}) {
  const configurado = value.length > 0
  const delDia = (d: number) => value.filter((t) => t.diaSemana === d)
  const cambiar = (d: number, i: number, campo: 'desde' | 'hasta', v: string) => {
    let n = -1
    onChange(value.map((t) => (t.diaSemana === d && ++n === i ? { ...t, [campo]: v } : t)))
  }
  const quitar = (d: number, i: number) => {
    let n = -1
    onChange(value.filter((t) => !(t.diaSemana === d && ++n === i)))
  }
  const agregar = (d: number) => {
    const ts = normalizarHorario(delDia(d))
    const ultimo = ts[ts.length - 1]
    const nuevo: TramoHorario = ultimo
      ? { diaSemana: d, desde: ultimo.hasta, hasta: sumarHoras(ultimo.hasta, 2) }
      : { diaSemana: d, desde: '08:00', hasta: '18:00' }
    onChange([...value, nuevo])
  }
  const copiarLunes = () => {
    const lunes = delDia(1)
    if (lunes.length === 0) return
    onChange([...lunes, ...[2, 3, 4, 5, 6, 0].flatMap((d) => lunes.map((t) => ({ ...t, diaSemana: d })))])
  }

  return (
    <section aria-label="Horario de atención" data-testid="negocio-horario-editor" className="rounded-lg border border-gray-200 p-3">
      <h3 className="text-sm font-semibold text-gray-800">Horario de atención</h3>
      <p className="mb-2 text-xs text-gray-500">
        Horario de este negocio (no del cliente). Una pausa entre tramos cuenta como cerrado. Sin horario configurado, no se avisa nada.
      </p>
      <div className="divide-y divide-gray-100">
        {ORDEN_DIAS.map((d) => {
          const ts = delDia(d)
          return (
            <div key={d} role="group" aria-label={DIAS_SEMANA[d]} data-testid={`horario-dia-${d}`} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="w-full text-sm font-medium text-gray-700 sm:w-24">{DIAS_SEMANA[d]}</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
                {ts.length === 0 && (
                  <span className="text-sm text-gray-500" data-testid={`horario-cerrado-${d}`}>{configurado ? 'Cerrado' : '—'}</span>
                )}
                {ts.map((t, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <input type="time" aria-label={`${DIAS_SEMANA[d]} tramo ${i + 1} desde`} value={t.desde} disabled={disabled}
                      onChange={(e) => cambiar(d, i, 'desde', e.target.value)} className={inputHora} data-testid={`horario-desde-${d}-${i}`} />
                    <span className="text-gray-400">–</span>
                    <input type="time" aria-label={`${DIAS_SEMANA[d]} tramo ${i + 1} hasta`} value={t.hasta} disabled={disabled}
                      onChange={(e) => cambiar(d, i, 'hasta', e.target.value)} className={inputHora} data-testid={`horario-hasta-${d}-${i}`} />
                    <button type="button" disabled={disabled} onClick={() => quitar(d, i)} aria-label={`Quitar tramo ${i + 1} de ${DIAS_SEMANA[d]}`}
                      className="rounded px-1.5 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-red-600">✕</button>
                  </span>
                ))}
                <button type="button" disabled={disabled} onClick={() => agregar(d)} data-testid={`horario-agregar-${d}`}
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  {ts.length === 0 ? 'Abrir' : '＋ Tramo'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={disabled || delDia(1).length === 0} onClick={copiarLunes} data-testid="horario-copiar-lunes"
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          Copiar lunes a todos los días
        </button>
        {configurado && (
          <button type="button" disabled={disabled} onClick={() => onChange([])} data-testid="horario-quitar"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Quitar el horario
          </button>
        )}
      </div>
      {errores.length > 0 && (
        <div role="alert" data-testid="horario-errores" className="mt-2 space-y-1 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {errores.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}
    </section>
  )
}
