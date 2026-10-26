'use client'

// TEMPORAL-SIN-EMBARQUE(#472): campos «¿Quién recibió el dinero?» y «¿Cuándo se
// recibió?» del cobro de un fiado. Solo el ADMIN con la gestión temporal encendida.
import { useId } from 'react'
import { DIAS_MAX_ATRAS, hoyBogota, sumarDias, type Repartidor } from './logica'
import type { DatosCobroOficina, ErroresCobro } from './logica-cobro'

interface Props {
  datos: DatosCobroOficina
  errores: ErroresCobro
  /** Mostrar los errores (después del primer intento de confirmar). */
  intento: boolean
  repartidores: Repartidor[]
  onChange: (cambios: Partial<DatosCobroOficina>) => void
}

const CAMPO = 'w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900'
const ETIQUETA = 'mb-1 block text-xs font-medium text-gray-700'
const ERROR = 'mt-1 text-sm text-red-700'

export function CobroOficinaCampos({ datos, errores, intento, repartidores, onChange }: Props) {
  const hoy = hoyBogota()
  // La pantalla monta la vista de escritorio Y la móvil (una oculta por CSS): cada
  // copia necesita su propio grupo de opciones y sus propios ids, o el navegador
  // desmarca la opción visible al marcar la oculta.
  const uid = useId()
  const grupo = `cobro-quien-${uid}`
  const idRepartidor = `cobro-repartidor-${uid}`
  const idFecha = `cobro-fecha-${uid}`
  return (
    <div className="space-y-3" data-testid="cobro-oficina">
      <div>
        <span className={ETIQUETA}>¿Quién recibió el dinero? *</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <input
              type="radio"
              name={grupo}
              className="h-5 w-5"
              data-testid="cobro-recibio-oficina"
              checked={datos.quien === 'OFICINA'}
              onChange={() => onChange({ quien: 'OFICINA', repartidorId: '' })}
            />
            Se pagó en la oficina
          </label>
          <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <input
              type="radio"
              name={grupo}
              className="h-5 w-5"
              data-testid="cobro-recibio-repartidor"
              checked={datos.quien === 'REPARTIDOR'}
              onChange={() => onChange({ quien: 'REPARTIDOR' })}
            />
            Lo recibió un repartidor
          </label>
        </div>
        {intento && errores.quien && <p className={ERROR}>{errores.quien}</p>}
      </div>

      {datos.quien === 'REPARTIDOR' && (
        <div>
          <label htmlFor={idRepartidor} className={ETIQUETA}>¿Qué repartidor? *</label>
          <select
            id={idRepartidor}
            className={CAMPO}
            value={datos.repartidorId}
            onChange={(e) => onChange({ repartidorId: e.target.value })}
          >
            <option value="">Elegir repartidor…</option>
            {repartidores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          {intento && errores.repartidor && <p className={ERROR}>{errores.repartidor}</p>}
        </div>
      )}

      <div>
        <label htmlFor={idFecha} className={ETIQUETA}>¿Cuándo se recibió?</label>
        <input
          id={idFecha}
          type="date"
          className={CAMPO}
          value={datos.fecha}
          min={sumarDias(hoy, -DIAS_MAX_ATRAS)}
          max={hoy}
          onChange={(e) => onChange({ fecha: e.target.value || hoy })}
        />
        <p className="mt-1 text-xs text-gray-600">Hasta {DIAS_MAX_ATRAS} días atrás. No un día ya cerrado.</p>
        {intento && errores.fecha && <p className={ERROR}>{errores.fecha}</p>}
      </div>
    </div>
  )
}
