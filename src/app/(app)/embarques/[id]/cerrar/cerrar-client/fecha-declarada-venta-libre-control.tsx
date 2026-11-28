'use client'

import { useState } from 'react'
import { diaColombia, errorDeclaracionFechaVentaLibre, type DeclaracionFechaVentaLibre } from '@/lib/declaracion-fecha-venta-libre-630'

/**
 * #630 F1-B1b. Componente compartido por cierre V1 y V2.
 * No persiste nada por sí solo: confirmar aquí prepara la declaración para
 * el cierre transaccional, con preview y offlineId existentes.
 */
export function FechaDeclaradaVentaLibreControl({
  index, valor, onChange,
}: {
  index: number
  valor?: DeclaracionFechaVentaLibre
  onChange: (valor?: DeclaracionFechaVentaLibre) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [intentado, setIntentado] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const modo = valor?.precision ?? 'DESCONOCIDA'
  const error = errorDeclaracionFechaVentaLibre(valor)
  const id = 'vl-fecha-' + index

  const cambiar = (v?: DeclaracionFechaVentaLibre) => {
    onChange(v)
    setIntentado(false)
    setConfirmado(false)
  }
  const confirmar = () => {
    setIntentado(true)
    setConfirmado(!error)
  }

  return (
    <section className="min-w-0 max-w-full rounded-lg border border-blue-100 bg-blue-50/50 p-3" data-testid={'vl-fecha-declarada-' + index}>
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={id + '-panel'}
        onClick={() => setAbierto(!abierto)}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-medium text-blue-700"
      >
        <span>¿Cuándo ocurrió esta venta?</span>
        <span aria-hidden="true">{abierto ? '⌃' : '⌄'}</span>
      </button>
      {!abierto && valor && (
        <p className="text-xs text-blue-800">
          {valor.precision === 'DIA'
            ? 'Día declarado: ' + valor.fecha + ' · hora sin verificar'
            : 'Fecha y hora declaradas: ' + valor.fecha + ' ' + (valor.hora ?? '')}
        </p>
      )}
      {abierto && (
        <div id={id + '-panel'} className="min-w-0 space-y-3 pt-2">
          <fieldset className="min-w-0 space-y-2">
            <legend className="text-xs font-medium text-gray-700">Precisión del dato</legend>
            {([
              ['DESCONOCIDA', 'No conozco el momento'],
              ['DIA', 'Conozco el día'],
              ['INSTANTE', 'Conozco día y hora'],
            ] as const).map(([opcion, texto]) => (
              <label key={opcion} className="flex min-h-9 items-center gap-2 text-sm text-gray-800">
                <input
                  type="radio" name={id + '-modo'} value={opcion} checked={modo === opcion}
                  onChange={() => cambiar(opcion === 'DESCONOCIDA' ? undefined : {
                    precision: opcion, fecha: valor?.fecha ?? '',
                    ...(opcion === 'INSTANTE' ? { hora: valor?.precision === 'INSTANTE' ? valor.hora : '' } : {}),
                  })}
                />
                {texto}
              </label>
            ))}
          </fieldset>
          {valor && (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block min-w-0 space-y-1 text-xs font-medium text-gray-700" htmlFor={id + '-dia'}>
                <span>Día de la venta (declarado)</span>
                <input
                  id={id + '-dia'} type="date" value={valor.fecha}
                  max={diaColombia(new Date())}
                  aria-invalid={intentado && Boolean(error)}
                  onChange={(e) => cambiar({ ...valor, fecha: e.target.value })}
                  className="block h-11 min-w-0 w-full max-w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                />
              </label>
              {valor.precision === 'INSTANTE' && (
                <label className="block min-w-0 space-y-1 text-xs font-medium text-gray-700" htmlFor={id + '-hora'}>
                  <span>Hora declarada</span>
                  <input
                    id={id + '-hora'} type="time" value={valor.hora ?? ''}
                    onChange={(e) => cambiar({ ...valor, hora: e.target.value })}
                    aria-invalid={intentado && Boolean(error)}
                    className="block h-11 min-w-0 w-full max-w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  />
                </label>
              )}
            </div>
          )}
          <p className="rounded-lg bg-blue-100/70 p-2 text-xs text-blue-900">
            Dato declarado, no certificado. La hora del cierre no demuestra la hora física de entrega.
            No cambia ventas, caja, inventario ni comisiones.
          </p>
          {intentado && error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {confirmado && (
            <p role="status" className="text-xs font-medium text-green-800">
              {valor ? 'Declaración lista. Se guardará únicamente cuando confirmes el cierre.' : 'Sin fecha conocida. Puedes cerrar normalmente.'}
            </p>
          )}
          <button
            type="button" onClick={confirmar}
            className="min-h-11 rounded-lg border border-blue-300 bg-white px-4 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            Confirmar declaración
          </button>
        </div>
      )}
    </section>
  )
}
