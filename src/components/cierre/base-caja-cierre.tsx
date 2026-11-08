'use client'

// #688 — la base de caja en el cierre: se LEE (nunca se escribe aquí salvo la de un día atrasado sin base) y se
// muestra de dónde viene. Avisa si cambió, exige ingresarla si falta y frena el cierre si cambió mientras se revisaba.

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { openBaseCajaModal } from '@/components/base-caja-loader'
import { avisarBaseCajaActualizada } from '@/lib/client/base-caja-evento'
import { diaCorto } from '@/lib/dia-corto'
import { formatCurrency } from '@/lib/utils'

const horaBogota = (iso: string | null) => iso
  ? new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' })
  : null

/** «Base de caja de hoy · actualizada 7:42 a. m. · Editar en Caja base» */
export function FuenteBaseCaja({ fecha, hoy, actualizadaAt, puedeEditar, diaCerrado, valor }: {
  fecha: string; hoy: boolean; actualizadaAt: string | null; puedeEditar: boolean; diaCerrado: boolean; valor: number
}) {
  const hora = horaBogota(actualizadaAt)
  return (
    <p data-testid="base-caja-fuente" className="mt-2 text-xs text-slate-600">
      Base de caja {hoy ? 'de hoy' : `del ${diaCorto(fecha)}`}{hora ? ` · actualizada ${hora}` : ''}
      {puedeEditar && hoy && !diaCerrado && (
        <> · <button type="button" data-testid="base-caja-editar" onClick={() => openBaseCajaModal(String(valor))} className="font-semibold text-blue-700 underline">Editar en Caja base</button></>
      )}
    </p>
  )
}

/** Aviso cuando la base cambió con la pantalla abierta. */
export function AvisoBaseActualizada({ antes, ahora, debeHaberAntes, debeHaberAhora, onEntendido }: {
  antes: number; ahora: number; debeHaberAntes: number; debeHaberAhora: number; onEntendido: () => void
}) {
  return (
    <div role="status" data-testid="base-caja-aviso" className="mt-2 rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
      <p className="font-bold">Base de caja actualizada</p>
      <p>Pasó de {formatCurrency(antes)} a {formatCurrency(ahora)}; el efectivo que debe haber pasó de {formatCurrency(debeHaberAntes)} a {formatCurrency(debeHaberAhora)}. Se actualizó sola.</p>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onEntendido}>Entendido</Button>
    </div>
  )
}

/** Falta la base de esa fecha: no se inventa un valor. Hoy → modal de base de caja; día atrasado → se guarda como la base de esa fecha. */
export function BaseCajaFaltante({ fecha, hoy, puedeIngresar }: { fecha: string; hoy: boolean; puedeIngresar: boolean }) {
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dia = hoy ? 'de hoy' : `del ${diaCorto(fecha)}`

  async function guardar() {
    const n = Number(valor.replace(/\D/g, ''))
    if (!Number.isInteger(n) || n <= 0) { setError('Escribe un valor mayor que $ 0.'); return }
    setError(null); setGuardando(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: `BASE_DIA_${fecha}`, valor: String(n) }),
      })
      if (!res.ok) { setError('No se pudo guardar la base de caja. Intenta de nuevo.'); return }
      toast.success(`Base de caja ${dia} guardada`)
      avisarBaseCajaActualizada()
    } catch {
      setError('No hay conexión. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div role="alert" data-testid="base-caja-faltante" className="mt-2 rounded-xl border-[1.5px] border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-bold">⚠ Falta la base de caja {dia}</p>
      {!puedeIngresar && <p>Pídele a la administración o a la asistente que la ingrese; esta pantalla se actualiza sola.</p>}
      {puedeIngresar && hoy && (
        <>
          <p>Sin el efectivo con el que empezó el día no se puede calcular cuánto debe haber ni cerrar.</p>
          <Button type="button" size="sm" className="mt-2" data-testid="base-caja-ingresar" onClick={() => openBaseCajaModal()}>Ingresar base de caja</Button>
        </>
      )}
      {puedeIngresar && !hoy && (
        <>
          <p>No se ingresó base ese día. Se guarda como la base de caja de esa fecha (queda registrada, no solo en esta pantalla).</p>
          <label htmlFor="base-faltante" className="mt-2 block text-xs font-bold">Efectivo con el que empezó el {diaCorto(fecha)}</label>
          <input id="base-faltante" data-testid="base-caja-input" inputMode="numeric" placeholder="$ 0" value={valor} onChange={(e) => setValor(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900" />
          {error && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
          <Button type="button" size="sm" className="mt-2" data-testid="base-caja-guardar" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : `Guardar base del ${diaCorto(fecha)}`}</Button>
        </>
      )}
    </div>
  )
}

/** El servidor (o la lectura previa) detectó que la base cambió: no se cerró el día. */
export function DialogoBaseCambio({ antes, ahora, debeHaberAntes, debeHaberAhora, onRevisar }: {
  antes: number; ahora: number; debeHaberAntes: number; debeHaberAhora: number; onRevisar: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="base-cambio-titulo" data-testid="base-caja-cambio" className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
        <h2 id="base-cambio-titulo" className="text-base font-bold text-slate-900">La base de caja cambió</h2>
        <p className="mt-1 text-sm text-slate-700">Mientras revisabas, alguien editó la base de caja. No se cerró el día.</p>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5"><dt>Antes</dt><dd className="font-bold">{formatCurrency(antes)}</dd></div>
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5"><dt>Ahora</dt><dd className="font-bold">{formatCurrency(ahora)}</dd></div>
        </dl>
        <p className="mt-2 text-sm text-slate-700">El efectivo que debe haber pasó de {formatCurrency(debeHaberAntes)} a {formatCurrency(debeHaberAhora)}. Revisa y vuelve a confirmar.</p>
        <Button type="button" className="mt-3 w-full" data-testid="base-caja-revisar" onClick={onRevisar}>Revisar y confirmar de nuevo</Button>
      </div>
    </div>
  )
}
