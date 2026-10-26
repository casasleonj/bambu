'use client'

// TEMPORAL-SIN-EMBARQUE(#472): tarjeta para encender/apagar la gestión temporal de
// pedidos sin embarques. Solo la ve el ADMIN. Apagar pide confirmación (esconde los
// botones a quien esté trabajando); encender no. Si el cambio falla, el interruptor
// vuelve a su posición. Se retira con la función (ver docs/pedidos/GESTION_TEMPORAL_SIN_EMBARQUE.md).
import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '@/components/modal'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/config-claves-restringidas'

export interface UltimoCambioGestion {
  /** ISO. */
  fecha: string
  /** Usuario que lo hizo; `null` si no hay registro (p. ej. se cambió por SQL). */
  por: string | null
}

export interface EstadoGestionSinEmbarques {
  activa: boolean
  cambio: UltimoCambioGestion | null
}

const formatoFecha = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })

export function GestionSinEmbarquesCard({ inicial, usuarioActual }: { inicial: EstadoGestionSinEmbarques; usuarioActual?: string | null }) {
  const [activa, setActiva] = useState(inicial.activa)
  const [cambio, setCambio] = useState<UltimoCambioGestion | null>(inicial.cambio)
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function guardar(nuevo: boolean) {
    if (guardando) return
    setGuardando(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE, valor: nuevo ? 'true' : 'false' }),
      })
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      if (!res.ok) {
        toast.error(json?.error?.message ?? 'No se pudo cambiar. Intenta de nuevo.')
        return // el interruptor queda como estaba
      }
      setActiva(nuevo)
      setCambio({ fecha: new Date().toISOString(), por: usuarioActual ?? null })
      setConfirmando(false)
      toast.success(nuevo ? 'Gestión sin embarques encendida' : 'Gestión sin embarques apagada')
    } catch {
      toast.error('No hay conexión. Revisa la señal e intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  function alternar() {
    if (activa) setConfirmando(true) // apagar pide confirmación
    else void guardar(true)
  }

  return (
    <Card data-testid="gestion-sin-embarques">
      <CardContent className="p-6">
        <h2 className="text-base font-semibold">Gestión temporal sin embarques</h2>
        <p className="mt-1 text-sm text-gray-600">
          Mientras Embarques no funcione, el administrador puede registrar entregas y cobros y corregir el canal desde el pedido.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-gray-900" id="gse-etiqueta">Gestionar pedidos sin embarques</span>
          <span className="flex items-center gap-3">
            <span
              data-testid="gse-estado"
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${activa ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}
            >
              {activa ? 'Encendido' : 'Apagado'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={activa}
              aria-labelledby="gse-etiqueta"
              data-testid="gse-interruptor"
              disabled={guardando}
              onClick={alternar}
              className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${activa ? 'bg-blue-700' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-all ${activa ? 'left-[25px]' : 'left-[3px]'}`} />
            </button>
          </span>
        </div>
        {!activa && (
          <p className="mt-3 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            Al <b>encender</b>, el administrador verá en la ficha de un pedido abierto «Registrar entrega» y «Corregir canal», y en Fiados las
            preguntas de quién recibió el dinero y cuándo.
          </p>
        )}
        <div className="mt-4 border-t border-gray-200 pt-3" data-testid="gse-ultimo-cambio">
          <b className="text-sm text-gray-900">Último cambio</b>
          <p className="mt-1 text-sm text-gray-600">
            {cambio
              ? `${activa ? 'Encendido' : 'Apagado'}${cambio.por ? ` por ${cambio.por}` : ''} el ${formatoFecha(cambio.fecha)}`
              : 'Sin cambios registrados todavía.'}
          </p>
        </div>
      </CardContent>

      {confirmando && (
        <Modal
          open
          onClose={() => !guardando && setConfirmando(false)}
          title="¿Apagar la gestión sin embarques?"
          className="bg-white w-full md:max-w-md md:rounded-2xl p-4"
          data-testid="gse-confirmar"
        >
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-bold text-gray-900">¿Apagar la gestión sin embarques?</h3>
            <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              <b>Qué pasa al apagar:</b>
              <ul className="mt-1 list-disc pl-5">
                <li>Los botones «Registrar entrega» y «Corregir canal» desaparecen de la ficha.</li>
                <li>En Fiados, el cobro vuelve a ser el de siempre, sin las preguntas de quién recibió.</li>
                <li>El servidor deja de aceptar registros nuevos de esta función.</li>
              </ul>
            </div>
            <p className="text-sm text-gray-700">
              <b>Se conserva todo lo ya registrado:</b> quién entregó, quién recibió el dinero y las comisiones.
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={guardando} onClick={() => setConfirmando(false)} className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" disabled={guardando} onClick={() => void guardar(false)} data-testid="gse-confirmar-apagar" className="min-h-[44px] flex-[2] rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
                {guardando ? 'Apagando…' : 'Sí, apagar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}
