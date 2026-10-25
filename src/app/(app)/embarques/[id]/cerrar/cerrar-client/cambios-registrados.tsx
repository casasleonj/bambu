import Link from 'next/link'
import { destinoDeCambio, type SustitucionCierre } from './cierre-logic'

interface Props {
  embarqueId: string
  sustituciones: SustitucionCierre[]
  cargando: boolean
  error: boolean
  onReintentar: () => void
}

/**
 * Cierre V2 (#446): los «cambios» ya no se teclean; son las sustituciones registradas en
 * la misión. Aquí se listan (producto, cantidad, a quién, motivo) con acceso directo a
 * registrar una nueva.
 */
export function CambiosRegistrados({ embarqueId, sustituciones, cargando, error, onReintentar }: Props) {
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="cambios-registrados">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-900">Cambios registrados</h3>
        <Link
          href={`/embarques/${embarqueId}`}
          className="min-h-11 inline-flex items-center text-sm font-medium text-blue-700 underline"
          data-testid="cambios-registrar-link"
        >
          Registrar cambio (pestaña Físico)
        </Link>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        Los cambios salen de lo que se registró en la misión; no se escriben aquí.
      </p>
      {cargando && <p className="mt-2 text-sm text-gray-500">Cargando cambios…</p>}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          No se pudieron cargar los cambios registrados.{' '}
          <button type="button" onClick={onReintentar} className="underline">Reintentar</button>
        </p>
      )}
      {!cargando && !error && sustituciones.length === 0 && (
        <p className="mt-2 text-sm text-gray-600" data-testid="cambios-vacio">No se registró ningún cambio en esta misión.</p>
      )}
      {sustituciones.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {sustituciones.map((s) => (
            <li key={s.id} data-testid="cambio-item">
              <b>{s.movimientoEntrega.cantidad}</b> × {s.movimientoEntrega.producto} → {destinoDeCambio(s)}
              {s.movimientoRecepcion?.metadata?.motivoDetalle ? ` · ${s.movimientoRecepcion.metadata.motivoDetalle}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
