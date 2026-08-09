'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface NegocioOption {
  id: string
  nombre: string
  tipoNegocio: string | null
  direccion: string | null
  barrio: string | null
  ruta: { nombre: string } | null
}

interface NegocioSelectorProps {
  clienteId: string
  clienteNombre: string
  clienteDireccion?: string | null
  clienteBarrio?: string | null
  selectedNegocioId: string | null
  onNegocioSelected: (negocioId: string | null, negocioData: { direccion: string | null; barrio: string | null } | null) => void
}

export function NegocioSelector({
  clienteId,
  clienteNombre,
  clienteDireccion,
  clienteBarrio,
  selectedNegocioId,
  onNegocioSelected,
}: NegocioSelectorProps) {
  const [negocios, setNegocios] = useState<NegocioOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Colapsado por defecto: solo se muestra el destino ya elegido (domicilio
  // principal o un negocio puntual), no la lista completa de opciones a la
  // vez. Evita el ruido visual de ver ambas direcciones simultáneamente.
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(false)
    if (!clienteId) {
      setNegocios([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    fetch(`/api/negocios?clienteId=${clienteId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar negocios')
        return res.json()
      })
      .then((data) => {
        if (data.success) {
          setNegocios(data.data)
        } else {
          setError(data.error || 'Error desconocido')
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error de red')
      })
      .finally(() => setLoading(false))
  }, [clienteId])

  const hasFormalNegocios = negocios.length > 0

  if (loading) return null
  if (!hasFormalNegocios) return null

  const negocioActivo = selectedNegocioId ? negocios.find((n) => n.id === selectedNegocioId) : null
  const resumenNombre = negocioActivo ? negocioActivo.nombre : clienteNombre
  const resumenIcono = negocioActivo ? '🏪' : '🏠'
  const resumenDireccion = negocioActivo ? negocioActivo.direccion : clienteDireccion
  const resumenBarrio = negocioActivo ? negocioActivo.barrio : clienteBarrio

  const elegir = (id: string | null, data: { direccion: string | null; barrio: string | null } | null) => {
    onNegocioSelected(id, data)
    setExpanded(false)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Negocio / Sucursal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
        )}

        {!expanded ? (
          // Resumen colapsado: una sola dirección visible, la del destino
          // ya elegido. No repite la lista completa de opciones.
          <button
            type="button"
            data-testid="negocio-selector-resumen"
            onClick={() => setExpanded(true)}
            className="w-full text-left px-3 py-2.5 rounded-lg border border-blue-500 bg-blue-50 ring-1 ring-blue-500 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium">
                {resumenIcono} {resumenNombre}
                {!negocioActivo && <span className="text-xs text-gray-400 ml-1">— domicilio principal</span>}
              </span>
              {(resumenDireccion || resumenBarrio) && (
                <div className="text-xs text-gray-500 mt-1 truncate">
                  {resumenDireccion && <span>{resumenDireccion}</span>}
                  {resumenBarrio && (
                    <span className="ml-1">
                      {resumenDireccion ? '—' : ''} {resumenBarrio}
                    </span>
                  )}
                </div>
              )}
            </div>
            <span className="text-xs text-blue-600 font-medium shrink-0">Cambiar</span>
          </button>
        ) : (
          <div>
            <Label>Seleccionar destino del pedido</Label>
            <div className="mt-2 space-y-1.5">
              {/* Option: no specific negocio (use client default) */}
              <button
                type="button"
                onClick={() => elegir(null, null)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
                  selectedNegocioId === null
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {selectedNegocioId === null && '✓ '}
                    🏠 {clienteNombre}
                    <span className="text-xs text-gray-400 ml-1">— domicilio principal</span>
                  </span>
                </div>
                {(clienteDireccion || clienteBarrio) && (
                  <div className="text-xs text-gray-500 mt-1">
                    {clienteDireccion && <span>{clienteDireccion}</span>}
                    {clienteBarrio && (
                      <span className="ml-1">
                        {clienteDireccion ? '—' : ''} {clienteBarrio}
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* Business options */}
              {negocios.map((negocio) => (
                <button
                  key={negocio.id}
                  type="button"
                  onClick={() => elegir(negocio.id, { direccion: negocio.direccion, barrio: negocio.barrio })}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
                    selectedNegocioId === negocio.id
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">
                        {selectedNegocioId === negocio.id && '✓ '}
                        {negocio.nombre}
                      </span>
                      {negocio.tipoNegocio && (
                        <span className="text-xs text-gray-500 ml-2">
                          ({negocio.tipoNegocio})
                        </span>
                      )}
                    </div>
                  </div>
                  {(negocio.direccion || negocio.barrio || negocio.ruta) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {negocio.direccion && <span>{negocio.direccion}</span>}
                      {negocio.barrio && (
                        <span className="ml-1">
                          {negocio.direccion ? '—' : ''} {negocio.barrio}
                        </span>
                      )}
                      {negocio.ruta && (
                        <span className="ml-2 text-blue-600">
                          📍 {negocio.ruta.nombre}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
