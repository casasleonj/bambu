'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useEscapeGuard } from '@/hooks/use-escape-guard'
import { generateUUID } from '@/lib/uuid'
import { getTodayString } from '@/lib/dates'
import { formatCurrency } from '@/lib/utils'
import type { PagoComisionCaja } from '@/lib/comision-pagada'

const dia = (d: string) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' })
const diaCorto = (d: string) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })
// La hora en es-CO termina en «p. m.»: sin este recorte la frase acabaría en «p. m..».
const registro = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }).replace(/\.$/, '')

type Errores = { fecha?: string; motivo?: string }

/**
 * #834 — «Cambiar el día de caja» / «Fijar el día real» de un pago de comisión. Solo ADMIN (quien lo monta decide si lo muestra).
 * Motivo obligatorio; el servidor deja el rastro y no reescribe `createdAt`, el día trabajado ni el cierre guardado de ningún día.
 */
export function CorregirDiaCaja({ pago, onCorregido }: { pago: PagoComisionCaja; onCorregido: () => void }) {
  const hoy = getTodayString()
  const sinVerificar = !pago.fechaPagoReal
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState(pago.fechaPagoReal ?? '')
  const [motivo, setMotivo] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)
  // Una clave por borrador: un reintento (por falla de red o doble toque) no guarda dos correcciones.
  const [offlineId, setOfflineId] = useState(() => `cdc-${generateUUID()}`)

  const cerrar = () => {
    if (enviando) return
    setAbierto(false)
    setErrores({})
    setMotivo('')
    setFecha(pago.fechaPagoReal ?? '')
  }
  useEscapeGuard(abierto, cerrar)

  const validar = (): Errores => {
    const e: Errores = {}
    if (!fecha) e.fecha = 'Elige el día en que salió el dinero.'
    else if (fecha > hoy) e.fecha = 'No puedes elegir un día que no ha llegado. Elige hoy o uno anterior.'
    else if (fecha < pago.fechaTrabajo) e.fecha = `No puede ser anterior al día trabajado (${diaCorto(pago.fechaTrabajo)}). Elige ese día o uno posterior.`
    else if (fecha === pago.fechaPagoReal) e.fecha = 'Ese ya es el día de caja de este pago.'
    if (motivo.trim().length < 3) e.motivo = 'Cuéntanos por qué se corrige.'
    return e
  }

  const guardar = async () => {
    const e = validar()
    if (e.fecha || e.motivo) { setErrores(e); return }
    setErrores({})
    setEnviando(true)
    try {
      const res = await fetch(`/api/nomina/pagos-comision/${pago.id}/corregir-fecha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaPagoReal: fecha, motivo: motivo.trim(), offlineId }),
      })
      const cuerpo = await res.json().catch(() => null)
      if (res.ok) {
        const cerrados: string[] = cuerpo?.data?.diasCerrados ?? cuerpo?.diasCerrados ?? []
        toast.success(`Día de caja corregido: ahora es el ${dia(fecha)}.${cerrados.length ? ` El cierre del ${cerrados.map(diaCorto).join(' y del ')} no cambia.` : ''}`)
        setOfflineId(`cdc-${generateUUID()}`)
        setAbierto(false)
        setMotivo('')
        onCorregido()
        return
      }
      const codigo: string | undefined = cuerpo?.error?.code
      const mensaje: string = cuerpo?.error?.message ?? 'No se pudo guardar la corrección.'
      // Errores de los campos: junto al campo, sin avisos flotantes; lo escrito se conserva para corregirlo.
      if (codigo === 'MOTIVO_REQUERIDO') setErrores({ motivo: 'Cuéntanos por qué se corrige.' })
      else if (codigo && ['FECHA_PAGO_FUTURA', 'FECHA_PAGO_INVALIDA', 'FECHA_PAGO_ANTERIOR_AL_TRABAJO', 'SIN_CAMBIO'].includes(codigo)) setErrores({ fecha: mensaje })
      else toast.error(mensaje)
    } catch {
      toast.error('Sin conexión: la corrección no se guardó. Vuelve a intentarlo.')
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <div className="mt-2" data-testid={`pago-corregir-dia-${pago.id}`}>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="min-h-[44px] text-[13px] text-blue-700 underline sm:min-h-8"
          data-testid={`pago-corregir-dia-abrir-${pago.id}`}
        >
          {sinVerificar ? 'Fijar el día real' : 'Cambiar el día de caja'}
        </button>
      </div>
    )
  }

  const id = `cdc-${pago.id}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={cerrar}>
      <div
        className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        data-testid={`pago-corregir-dia-modal-${pago.id}`}
      >
        <h3 id={`${id}-titulo`} className="text-lg font-bold text-gray-900">{sinVerificar ? 'Fijar el día real del pago' : 'Cambiar el día de caja'}</h3>
        <p className="text-sm text-gray-600">
          Pago de <b>{formatCurrency(pago.monto)}</b> en {pago.metodo.toLowerCase()} a {pago.nombre}. Trabajo del {dia(pago.fechaTrabajo)}. Registrado el {registro(pago.registradoAt)}.
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-fecha`} className="text-[13px] font-semibold text-slate-700">{sinVerificar ? '¿Qué día se entregó el dinero?' : '¿Qué día salió el dinero?'}</label>
          <input
            id={`${id}-fecha`}
            type="date"
            min={pago.fechaTrabajo}
            max={hoy}
            value={fecha}
            disabled={enviando}
            aria-invalid={errores.fecha ? true : undefined}
            aria-describedby={`${id}-fecha-ayuda`}
            onChange={(ev) => { setFecha(ev.target.value); setErrores({}) }}
            className={`h-11 w-full rounded-md border bg-white px-2 text-sm disabled:opacity-60 sm:h-9 ${errores.fecha ? 'border-red-700' : 'border-slate-300'}`}
            data-testid={`${id}-fecha`}
          />
          <p id={`${id}-fecha-ayuda`} className={`text-xs ${errores.fecha ? 'font-semibold text-red-700' : 'text-slate-500'}`}>{errores.fecha ?? 'Entre el día trabajado y hoy.'}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-motivo`} className="text-[13px] font-semibold text-slate-700">{sinVerificar ? '¿Cómo lo comprobaste?' : '¿Por qué se corrige?'}</label>
          <input
            id={`${id}-motivo`}
            type="text"
            maxLength={500}
            value={motivo}
            disabled={enviando}
            aria-invalid={errores.motivo ? true : undefined}
            aria-describedby={`${id}-motivo-ayuda`}
            onChange={(ev) => { setMotivo(ev.target.value); setErrores({}) }}
            className={`h-11 w-full rounded-md border bg-white px-2 text-sm disabled:opacity-60 sm:h-9 ${errores.motivo ? 'border-red-700' : 'border-slate-300'}`}
            data-testid={`${id}-motivo`}
          />
          <p id={`${id}-motivo-ayuda`} className={`text-xs ${errores.motivo ? 'font-semibold text-red-700' : 'text-slate-500'}`}>{errores.motivo ?? 'Obligatorio. Queda guardado con quién lo hizo y cuándo.'}</p>
        </div>
        <p role="note" className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[12.5px] text-blue-900">
          Si ese día ya está cerrado, su cierre <b>no cambia</b>: la corrección queda anotada y explica la diferencia de ese día.
        </p>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={cerrar} disabled={enviando} className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 disabled:opacity-60 sm:min-h-[38px]" data-testid={`${id}-cancelar`}>
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={enviando} className="min-h-[44px] flex-1 rounded-lg bg-green-600 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 sm:min-h-[38px]" data-testid={`${id}-guardar`}>
            {enviando ? 'Guardando…' : 'Guardar corrección'}
          </button>
        </div>
      </div>
    </div>
  )
}
