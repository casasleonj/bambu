'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-modal'
import { formatCurrency } from '@/lib/utils'
import { getTodayString } from '@/lib/dates'
import type { CierreData } from './types'

type Sueldo = NonNullable<CierreData['sueldosQueTocan']>[number]
type Medio = 'EFECTIVO' | 'NEQUI' | 'TRANSFERENCIA' | 'DAVIPLATA' | 'FUERA_DE_CAJA'

const ETIQUETAS: Record<Medio, string> = {
  EFECTIVO: 'Efectivo de la caja',
  NEQUI: 'Nequi',
  TRANSFERENCIA: 'Transferencia',
  DAVIPLATA: 'Daviplata',
  FUERA_DE_CAJA: 'Por fuera de la caja',
}

// #673 punto 2: día real en que se pagó el sueldo. Opcional: sin abrirlo, el pago es el de siempre.
type OtroDia = { abierto: boolean; fecha: string; motivo: string }
type ErroresOtroDia = { fecha?: string; motivo?: string }
const TEXTO_FECHA_FUTURA = 'No puedes elegir un día que no ha llegado. Elige hoy o uno anterior.'
const TEXTO_SIN_FECHA = 'Elige el día en que lo pagaste.'
const TEXTO_FECHA_INVALIDA = 'Esa fecha no existe. Revísala.'
const TEXTO_SIN_MOTIVO = 'Cuéntanos por qué se anota con otra fecha.'

const fechaLegible = (f: string) => new Date(`${f}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })

function PagoOtroDia({ id, fechaSueldo, valor, errores, deshabilitado, hoy, onAbrir, onCambiar, onVolver }: {
  id: string
  fechaSueldo: string
  valor: OtroDia | undefined
  errores: ErroresOtroDia | undefined
  deshabilitado: boolean
  hoy: string
  onAbrir: () => void
  onCambiar: (cambio: Partial<OtroDia>) => void
  onVolver: () => void
}) {
  if (!valor?.abierto) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        disabled={deshabilitado}
        data-testid={`sueldo-otro-dia-${id}`}
        className="mt-1 min-h-[44px] self-start text-[13px] text-blue-700 underline disabled:opacity-60 sm:min-h-8"
      >
        Lo pagué otro día
      </button>
    )
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2" data-testid={`sueldo-otro-dia-campos-${id}`}>
      <div className="flex flex-col gap-1">
        <label htmlFor={`sueldo-fecha-${id}`} className="text-[13px] font-semibold text-slate-700">¿Qué día lo pagaste?</label>
        <input
          id={`sueldo-fecha-${id}`}
          type="date"
          max={hoy}
          value={valor.fecha}
          disabled={deshabilitado}
          aria-invalid={errores?.fecha ? true : undefined}
          aria-describedby={`sueldo-fecha-ayuda-${id}`}
          onChange={(e) => onCambiar({ fecha: e.target.value })}
          className={`h-11 w-full rounded-md border bg-white px-2 text-sm disabled:opacity-60 sm:h-9 ${errores?.fecha ? 'border-red-700' : 'border-slate-300'}`}
          data-testid={`sueldo-fecha-${id}`}
        />
        <p id={`sueldo-fecha-ayuda-${id}`} className={`text-xs ${errores?.fecha ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
          {errores?.fecha ?? 'Opcional. Si lo pagaste antes o después de lo previsto, indícalo.'}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`sueldo-motivo-${id}`} className="text-[13px] font-semibold text-slate-700">¿Por qué se anota con otra fecha?</label>
        <input
          id={`sueldo-motivo-${id}`}
          type="text"
          maxLength={500}
          value={valor.motivo}
          disabled={deshabilitado}
          aria-invalid={errores?.motivo ? true : undefined}
          aria-describedby={`sueldo-motivo-ayuda-${id}`}
          onChange={(e) => onCambiar({ motivo: e.target.value })}
          className={`h-11 w-full rounded-md border bg-white px-2 text-sm disabled:opacity-60 sm:h-9 ${errores?.motivo ? 'border-red-700' : 'border-slate-300'}`}
          data-testid={`sueldo-motivo-${id}`}
        />
        <p id={`sueldo-motivo-ayuda-${id}`} className={`text-xs ${errores?.motivo ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
          {errores?.motivo ?? 'Queda guardado con el pago.'}
        </p>
      </div>
      <p role="note" className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[12.5px] text-blue-900">
        No cambia el periodo que cubre este sueldo ({fechaLegible(fechaSueldo)}): solo el día en que salió el dinero.
      </p>
      <button type="button" onClick={onVolver} disabled={deshabilitado} data-testid={`sueldo-volver-hoy-${id}`} className="min-h-[44px] text-[13px] text-blue-700 underline disabled:opacity-60 sm:min-h-8">
        Volver a hoy
      </button>
    </div>
  )
}

/**
 * «Sueldos que tocan» (#644): sueldos fijos cuya fecha de pago ya llegó y no se han pagado. El monto sale del servidor.
 * Se paga con el medio elegido; solo el efectivo de la caja baja el efectivo del cierre (#641). El sueldo del
 * administrador viene marcado «por fuera de la caja».
 */
export function SueldosQueTocan({
  sueldos, puedePagar, diaCerrado, onPagado,
}: {
  sueldos: Sueldo[]
  puedePagar: boolean
  diaCerrado: boolean
  onPagado: () => void
}) {
  const { confirm, modal } = useConfirm()
  const [pagando, setPagando] = useState<string | null>(null)
  const [medios, setMedios] = useState<Record<string, Medio>>({})
  const [otroDia, setOtroDia] = useState<Record<string, OtroDia>>({})
  const [errores, setErrores] = useState<Record<string, ErroresOtroDia>>({})
  const hoy = getTodayString()

  if (sueldos.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="sueldos-vacio">No hay sueldos por pagar hoy.</p>
  }

  const llave = (s: Sueldo) => `${s.trabajadorId}|${s.fecha}`
  const medioDe = (s: Sueldo): Medio => medios[llave(s)] ?? (s.fueraDeCaja ? 'FUERA_DE_CAJA' : 'EFECTIVO')
  /** Día real elegido, solo si es distinto de hoy; con hoy o sin abrir el bloque, es el pago normal. */
  const diaElegido = (s: Sueldo): string | null => {
    const o = otroDia[llave(s)]
    return o?.abierto && o.fecha && o.fecha !== hoy ? o.fecha : null
  }
  const quitarErrores = (k: string) => setErrores((previos) => { const { [k]: _quitado, ...resto } = previos; return resto })

  const pagar = async (s: Sueldo) => {
    const medio = medioDe(s)
    const k = llave(s)
    const o = otroDia[k]
    // #673: con «Lo pagué otro día» abierto se valida aquí, antes de confirmar; el servidor vuelve a validar.
    if (o?.abierto) {
      const err: ErroresOtroDia = {}
      if (!o.fecha) err.fecha = TEXTO_SIN_FECHA
      else if (o.fecha > hoy) err.fecha = TEXTO_FECHA_FUTURA
      else if (o.fecha < hoy && o.motivo.trim().length < 3) err.motivo = TEXTO_SIN_MOTIVO
      if (err.fecha || err.motivo) { setErrores((previos) => ({ ...previos, [k]: err })); return }
    }
    quitarErrores(k)
    const fechaPago = diaElegido(s)
    const motivoFecha = (o?.motivo ?? '').trim()
    const notaFecha = fechaPago ? ` Se anota como pagado el ${fechaLegible(fechaPago)} (se registra hoy, ${fechaLegible(hoy)}). Motivo: ${motivoFecha}.` : ''
    const ok = await confirm({
      message: `¿Pagar ${formatCurrency(s.monto)} del sueldo de ${s.nombre}?`,
      description: (medio === 'EFECTIVO'
        ? `Corresponde al pago del ${fechaLegible(s.fecha)}. Este dinero sale de la caja. Confírmalo solo si ya se lo diste.`
        : `Corresponde al pago del ${fechaLegible(s.fecha)}. Se paga con ${ETIQUETAS[medio].toLowerCase()}: queda anotado en la nómina y no baja el efectivo de la caja.`) + notaFecha,
      confirmLabel: 'Sí, pagar',
    })
    if (!ok) return
    setPagando(llave(s))
    try {
      const res = await fetch('/api/nomina/sueldo/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trabajadorId: s.trabajadorId, fecha: s.fecha,
          metodo: medio === 'FUERA_DE_CAJA' ? 'EFECTIVO' : medio,
          fueraDeCaja: medio === 'FUERA_DE_CAJA',
          ...(fechaPago ? { fechaPago, motivoFecha } : {}),
        }),
      })
      if (res.ok) {
        toast.success(`Sueldo pagado a ${s.nombre}${fechaPago && medio === 'EFECTIVO' ? `. Resta de la caja del ${fechaLegible(fechaPago)}.` : ''}`)
        setOtroDia((previos) => { const { [k]: _quitado, ...resto } = previos; return resto })
      } else {
        const cuerpo = await res.json().catch(() => null)
        const codigo: string | undefined = cuerpo?.error?.code
        // Errores de la fecha: se muestran junto al campo y no se refresca nada (no cambió nada).
        if (codigo === 'MOTIVO_FECHA_REQUERIDO') { setErrores((previos) => ({ ...previos, [k]: { motivo: TEXTO_SIN_MOTIVO } })); return }
        if (codigo === 'FECHA_PAGO_FUTURA') { setErrores((previos) => ({ ...previos, [k]: { fecha: TEXTO_FECHA_FUTURA } })); return }
        if (codigo === 'FECHA_PAGO_INVALIDA') { setErrores((previos) => ({ ...previos, [k]: { fecha: TEXTO_FECHA_INVALIDA } })); return }
        toast.error(cuerpo?.error?.message ?? 'No se pudo pagar el sueldo')
      }
      onPagado()
    } catch {
      toast.error('Sin conexión: el pago no se registró. Vuelve a intentarlo.')
    } finally {
      setPagando(null)
    }
  }

  return (
    <div className="space-y-2" data-testid="sueldos-que-tocan">
      {sueldos.map((s) => (
        <div key={llave(s)} className="rounded-xl border border-slate-200 bg-white p-3" data-testid={`sueldo-${s.trabajadorId}-${s.fecha}`}>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-base">💼</span>
            <div className="min-w-[10rem] flex-1">
              <p className="font-bold text-slate-800">{s.nombre}</p>
              <p className="text-xs text-slate-500">Sueldo del {fechaLegible(s.fecha)} (toca hoy) · {formatCurrency(s.monto)}</p>
            </div>
            <span className="ml-12 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 sm:ml-0">
              Pendiente{s.fueraDeCaja ? ' · por fuera de la caja' : ''}
            </span>
          </div>
          {puedePagar && !diaCerrado && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label={`Con qué se paga a ${s.nombre}`}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={medioDe(s)}
                onChange={(e) => setMedios({ ...medios, [llave(s)]: e.target.value as Medio })}
                data-testid={`sueldo-medio-${s.trabajadorId}`}
              >
                {(Object.keys(ETIQUETAS) as Medio[]).map((m) => <option key={m} value={m}>{ETIQUETAS[m]}</option>)}
              </select>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={pagando === llave(s)} onClick={() => pagar(s)} data-testid={`pagar-sueldo-${s.trabajadorId}`}>
                {pagando === llave(s) ? 'Pagando…' : `Pagar ${formatCurrency(s.monto)}`}
              </Button>
              <span className="text-[11px] text-slate-500">
                {medioDe(s) === 'EFECTIVO'
                  ? (diaElegido(s) ? `Sale de la caja del ${fechaLegible(diaElegido(s) as string)} (efectivo)` : 'Sale de la caja de hoy (efectivo)')
                  : 'No resta de la caja'}
              </span>
            </div>
          )}
          {puedePagar && !diaCerrado && (
            <PagoOtroDia
              id={`${s.trabajadorId}-${s.fecha}`}
              fechaSueldo={s.fecha}
              valor={otroDia[llave(s)]}
              errores={errores[llave(s)]}
              deshabilitado={pagando === llave(s)}
              hoy={hoy}
              onAbrir={() => setOtroDia({ ...otroDia, [llave(s)]: { abierto: true, fecha: '', motivo: '' } })}
              onCambiar={(cambio) => { setOtroDia({ ...otroDia, [llave(s)]: { ...(otroDia[llave(s)] ?? { abierto: true, fecha: '', motivo: '' }), ...cambio } }); quitarErrores(llave(s)) }}
              onVolver={() => { setOtroDia((previos) => { const { [llave(s)]: _quitado, ...resto } = previos; return resto }); quitarErrores(llave(s)) }}
            />
          )}
        </div>
      ))}
      {modal}
    </div>
  )
}
