'use client'

import { useState } from 'react'
import { Modal } from '@/components/modal'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { parseDateParam, todayStringBogota } from '@/lib/dates'

const mostrarDia = (fecha: string) => new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' })

/** #673: confirmación aprobada dentro del Modal y las tarjetas actuales. */
export function ConfirmarPagoComision({ nombre, monto, fechaTrabajo, porProduccion, medio, fechaInicial, ocupado, incierto, error, onClose, onConfirmar }: {
  nombre: string
  monto: number
  fechaTrabajo: string
  porProduccion: boolean
  medio: string
  fechaInicial: string
  ocupado: boolean
  incierto: boolean
  error: string | null
  onClose: () => void
  onConfirmar: (fechaPagoReal: string) => Promise<void>
}) {
  const [fecha, setFecha] = useState(fechaInicial)
  const valida = !!fecha && parseDateParam(fecha, '') === fecha && fecha <= todayStringBogota()
  const efectivo = medio === 'Efectivo'
  return (
    <Modal open onClose={() => { if (!ocupado) onClose() }} title="Registrar pago de comisión"
      overlayClassName="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:items-center" data-testid="confirmar-pago-comision">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (valida && !ocupado) void onConfirmar(fecha) }}>
        <h3 className="text-lg font-bold text-slate-900">Registrar pago de comisión</h3>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="font-bold text-slate-800">{nombre} · {formatCurrency(monto)}</p>
          <p className="mt-1 text-sm text-slate-600">Por el trabajo del {mostrarDia(fechaTrabajo)}.</p>
          <p className="mt-1 text-xs text-slate-600">{porProduccion ? 'Comisión por lo producido: pacas y botellones llenados.' : 'Comisión por las entregas del día de trabajo.'}</p>
          <p className="mt-1 text-sm font-semibold text-blue-900">Medio elegido: {medio}</p>
        </div>
        <label className="block text-sm font-semibold text-slate-700">
          Día en que se entregó el dinero
          <input type="date" required max={todayStringBogota()} value={fecha} onChange={event => setFecha(event.target.value)} disabled={ocupado || incierto}
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base disabled:opacity-70" data-testid="comision-fecha-pago" />
        </label>
        <p className="text-xs text-slate-500">El día trabajado se conserva. La fecha y hora en que haces este registro se guardan por separado.</p>
        {valida && <div className={`rounded-xl border p-3 text-sm ${efectivo ? 'border-blue-100 bg-blue-50 text-blue-900' : 'border-green-100 bg-green-50 text-green-900'}`}>
          <p className="font-bold">{efectivo ? `Sale de la caja del ${mostrarDia(fecha)}` : 'No se descuenta del efectivo de la caja'}</p>
          <p className="mt-1">{efectivo ? 'Se cuenta el día en que entregaste los billetes y monedas.' : `Queda registrado como pago por ${medio}.`}</p>
        </div>}
        {incierto && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Falta comprobar el resultado del envío anterior. El reintento conserva su fecha, medio, importe y clave; no registra otro pago.
        </p>}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="min-h-11 flex-1" disabled={ocupado} onClick={onClose}>{incierto ? 'Volver' : 'Cancelar'}</Button>
          <Button type="submit" className="min-h-11 flex-1" disabled={!valida || ocupado}>
            {ocupado ? 'Comprobando pago…' : incierto ? 'Comprobar el mismo pago' : 'Sí, ya le pagué'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
