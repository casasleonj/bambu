'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { normalizeName } from '@/lib/import/normalizer'

/* ================================================================
   TYPES — en espejo de lo que devuelve zona-service.ts / las rutas API
   ================================================================ */

interface ZonaResumen {
  id: string
  nombre: string
  activo: boolean
  _count?: { barrios: number }
}

interface BarrioOption {
  id: string
  nombre: string
}

interface BarrioEnZona {
  barrioId: string
  barrio: BarrioOption
  source: string
  otrasZonas: ZonaResumen[]
}

interface ZonaDetalle extends ZonaResumen {
  barrios: BarrioEnZona[]
}

interface OverlapPendiente {
  barrioId: string
  barrioNombre: string
  existingZones: ZonaResumen[]
}

interface ZonasClientProps {
  initialZonas: ZonaResumen[]
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function ZonasClient({ initialZonas }: ZonasClientProps) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const canWrite = role === 'ADMIN'

  const [zonas, setZonas] = useState<ZonaResumen[]>(initialZonas)
  const [listQuery, setListQuery] = useState('')
  const [loadingLista, setLoadingLista] = useState(false)
  const [nuevaZonaNombre, setNuevaZonaNombre] = useState('')
  const [creandoZona, setCreandoZona] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<ZonaDetalle | null>(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  const [barrioQuery, setBarrioQuery] = useState('')
  const [barrioResults, setBarrioResults] = useState<BarrioOption[]>([])
  const [buscandoBarrios, setBuscandoBarrios] = useState(false)
  const [agregandoBarrioId, setAgregandoBarrioId] = useState<string | null>(null)
  const [creandoBarrio, setCreandoBarrio] = useState(false)
  const [overlapPendiente, setOverlapPendiente] = useState<OverlapPendiente | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [quitandoBarrioId, setQuitandoBarrioId] = useState<string | null>(null)

  const [renombrando, setRenombrando] = useState(false)
  const [nombreEdit, setNombreEdit] = useState('')

  const listDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const barrioDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* -------------------------------------------------------------- */

  const refetchLista = useCallback(async (q: string) => {
    setLoadingLista(true)
    try {
      const res = await fetch(`/api/zonas?q=${encodeURIComponent(q)}`)
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) setZonas(data.data)
    } catch {
      toast.error('Error de red buscando zonas')
    } finally {
      setLoadingLista(false)
    }
  }, [])

  useEffect(() => {
    if (listDebounceRef.current) clearTimeout(listDebounceRef.current)
    listDebounceRef.current = setTimeout(() => refetchLista(listQuery), 300)
    return () => {
      if (listDebounceRef.current) clearTimeout(listDebounceRef.current)
    }
  }, [listQuery, refetchLista])

  const cargarDetalle = useCallback(async (id: string) => {
    setLoadingDetalle(true)
    try {
      const res = await fetch(`/api/zonas/${id}`)
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        setDetalle(data.zona)
        setNombreEdit(data.zona.nombre)
      } else {
        toast.error(data.error?.message || 'No se pudo cargar la zona')
      }
    } catch {
      toast.error('Error de red cargando la zona')
    } finally {
      setLoadingDetalle(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) {
      // cargarDetalle dispara un fetch real (detalle completo) — side
      // effect de red, no derivable durante el render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void cargarDetalle(selectedId)
    } else {
      setDetalle(null)
    }
  }, [selectedId, cargarDetalle])

  // Búsqueda de barrios para agregar a la zona seleccionada.
  useEffect(() => {
    if (!selectedId || !canWrite) return
    if (barrioDebounceRef.current) clearTimeout(barrioDebounceRef.current)
    barrioDebounceRef.current = setTimeout(() => {
      setBuscandoBarrios(true)
      fetch(`/api/barrios?q=${encodeURIComponent(barrioQuery)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.data) setBarrioResults(data.data)
        })
        .catch(() => {})
        .finally(() => setBuscandoBarrios(false))
    }, 250)
    return () => {
      if (barrioDebounceRef.current) clearTimeout(barrioDebounceRef.current)
    }
  }, [barrioQuery, selectedId, canWrite])

  /* -------------------------------------------------------------- */

  const handleCrearZona = async () => {
    const nombre = nuevaZonaNombre.trim()
    if (!nombre) return
    setCreandoZona(true)
    try {
      const res = await fetch('/api/zonas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        toast.success(`Zona "${data.zona.nombre}" creada`)
        setNuevaZonaNombre('')
        await refetchLista(listQuery)
        setSelectedId(data.zona.id)
      } else {
        toast.error(data.error?.message || 'No se pudo crear la zona')
      }
    } catch {
      toast.error('Error de red creando la zona')
    } finally {
      setCreandoZona(false)
    }
  }

  const handleGuardarNombre = async () => {
    if (!detalle || !nombreEdit.trim() || nombreEdit.trim() === detalle.nombre) {
      setRenombrando(false)
      return
    }
    try {
      const res = await fetch(`/api/zonas/${detalle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombreEdit.trim() }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        toast.success('Zona renombrada')
        setRenombrando(false)
        await Promise.all([cargarDetalle(detalle.id), refetchLista(listQuery)])
      } else {
        toast.error(data.error?.message || 'No se pudo renombrar')
      }
    } catch {
      toast.error('Error de red renombrando la zona')
    }
  }

  const handleToggleActivo = async () => {
    if (!detalle) return
    const nuevoActivo = !detalle.activo
    try {
      const res = await fetch(`/api/zonas/${detalle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: nuevoActivo }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        toast.success(nuevoActivo ? 'Zona reactivada' : 'Zona archivada')
        await Promise.all([cargarDetalle(detalle.id), refetchLista(listQuery)])
      } else {
        toast.error(data.error?.message || 'No se pudo actualizar la zona')
      }
    } catch {
      toast.error('Error de red actualizando la zona')
    }
  }

  const intentarAgregarBarrio = async (barrio: BarrioOption, confirmOverlap = false) => {
    if (!detalle) return
    setAgregandoBarrioId(barrio.id)
    try {
      const res = await fetch(`/api/zonas/${detalle.id}/barrios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barrioId: barrio.id, confirmOverlap }),
      })
      const data = await res.json().catch(() => ({ success: false }))

      if (!res.ok) {
        toast.error(data.error?.message || 'No se pudo agregar el barrio')
        return
      }

      if (data.requiresConfirmation) {
        // Solapamiento detectado: NO se persistió nada todavía. Mostrar el
        // diálogo de confirmación explícita (ALS §7-8) — nunca crear en
        // silencio.
        setOverlapPendiente({
          barrioId: barrio.id,
          barrioNombre: barrio.nombre,
          existingZones: data.existingZones ?? [],
        })
        return
      }

      toast.success(`"${barrio.nombre}" agregado a la zona`)
      setBarrioQuery('')
      setOverlapPendiente(null)
      // Igual que handleQuitarBarrio: refrescar también la lista de zonas
      // (no solo el detalle) para que el contador "X barrios" del panel
      // izquierdo se actualice sin tener que recargar la página.
      await Promise.all([cargarDetalle(detalle.id), refetchLista(listQuery)])
    } catch {
      toast.error('Error de red agregando el barrio')
    } finally {
      setAgregandoBarrioId(null)
      setConfirmando(false)
    }
  }

  /**
   * Crea un Barrio canónico nuevo al vuelo y lo agrega a la zona, cuando
   * la búsqueda no encuentra ninguno. Mismo patrón que `BarrioSelect`
   * (selector de Cliente/Negocio): el backend es la única fuente de
   * verdad de unicidad (P2002 -> reintenta la búsqueda antes de fallar).
   * Esto es una acción EXPLÍCITA del ADMIN (escribe el nombre y hace clic
   * en "+ Crear") — no es conversión automática/silenciosa de un string
   * legacy en Barrio.
   */
  const handleCrearBarrio = async () => {
    const nombre = barrioQuery.trim()
    if (!nombre || !detalle) return
    setCreandoBarrio(true)
    try {
      const res = await fetch('/api/barrios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success && data.barrio) {
        await intentarAgregarBarrio(data.barrio)
        return
      }
      if (res.status === 409) {
        const retry = await fetch(`/api/barrios?q=${encodeURIComponent(nombre)}`)
        const retryData = await retry.json().catch(() => ({ success: false }))
        const exacto = (retryData.data as BarrioOption[] | undefined)?.find(
          (b) => normalizeName(b.nombre) === normalizeName(nombre),
        )
        if (exacto) {
          await intentarAgregarBarrio(exacto)
          return
        }
      }
      toast.error(data.error?.message || 'No se pudo crear el barrio')
    } catch {
      toast.error('No se pudo crear el barrio (sin conexión)')
    } finally {
      setCreandoBarrio(false)
    }
  }

  const handleConfirmarOverlap = async () => {
    if (!overlapPendiente) return
    setConfirmando(true)
    await intentarAgregarBarrio({ id: overlapPendiente.barrioId, nombre: overlapPendiente.barrioNombre }, true)
  }

  const handleQuitarBarrio = async (barrioId: string, barrioNombre: string) => {
    if (!detalle) return
    setQuitandoBarrioId(barrioId)
    try {
      const res = await fetch(`/api/zonas/${detalle.id}/barrios/${barrioId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        toast.success(`"${barrioNombre}" quitado de la zona`)
        await Promise.all([cargarDetalle(detalle.id), refetchLista(listQuery)])
      } else {
        toast.error(data.error?.message || 'No se pudo quitar el barrio')
      }
    } catch {
      toast.error('Error de red quitando el barrio')
    } finally {
      setQuitandoBarrioId(null)
    }
  }

  /* -------------------------------------------------------------- */

  const barriosYaEnZona = new Set(detalle?.barrios.map((b) => b.barrioId) ?? [])
  const resultadosFiltrados = barrioResults.filter((b) => !barriosYaEnZona.has(b.id))
  const barrioQueryTrim = barrioQuery.trim()
  // Contra TODOS los resultados (no solo los filtrados): si el barrio ya
  // existe pero está filtrado por pertenecer a esta misma zona, no tiene
  // sentido ofrecer "+ Crear" (chocaría con P2002 sin motivo).
  const barrioExactMatch = barrioResults.find((b) => normalizeName(b.nombre) === normalizeName(barrioQueryTrim))
  const showCrearBarrio = barrioQueryTrim !== '' && !barrioExactMatch && !buscandoBarrios

  return (
    <div className="p-4 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Zonas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Territorio administrativo. Una Zona agrupa Barrios; un Barrio puede pertenecer a varias Zonas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
        {/* ---------------- Lista de zonas ---------------- */}
        <div className="space-y-3">
          <Input
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="Buscar zona..."
            className="w-full"
          />

          {canWrite && (
            <div className="flex gap-2">
              <Input
                value={nuevaZonaNombre}
                onChange={(e) => setNuevaZonaNombre(e.target.value)}
                placeholder="Nombre de la nueva zona"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCrearZona() }}
              />
              <Button size="sm" onClick={handleCrearZona} disabled={creandoZona || !nuevaZonaNombre.trim()}>
                {creandoZona ? '...' : '+ Nueva'}
              </Button>
            </div>
          )}

          <div className="border rounded-lg divide-y">
            {loadingLista && <div className="p-3 text-sm text-gray-400">Buscando...</div>}
            {!loadingLista && zonas.length === 0 && (
              <div className="p-3 text-sm text-gray-400">Sin zonas todavía.</div>
            )}
            {zonas.map((zona) => (
              <button
                key={zona.id}
                type="button"
                onClick={() => setSelectedId(zona.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 hover:bg-gray-50 transition',
                  selectedId === zona.id && 'bg-blue-50',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{zona.nombre}</span>
                  {!zona.activo && <Badge variant="secondary">Archivada</Badge>}
                </div>
                <span className="text-xs text-gray-500">
                  {zona._count?.barrios ?? 0} barrio{zona._count?.barrios === 1 ? '' : 's'}
                  {zona.activo ? ' · Activa' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ---------------- Detalle de zona ---------------- */}
        <div>
          {!selectedId && (
            <div className="text-sm text-gray-400 p-6 text-center border rounded-lg">
              Selecciona una zona para ver sus barrios.
            </div>
          )}

          {selectedId && loadingDetalle && !detalle && (
            <div className="text-sm text-gray-400 p-6">Cargando...</div>
          )}

          {detalle && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  {renombrando ? (
                    <div className="flex gap-2 items-center">
                      <Input
                        value={nombreEdit}
                        onChange={(e) => setNombreEdit(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleGuardarNombre() }}
                        autoFocus
                      />
                      <Button size="sm" onClick={handleGuardarNombre}>Guardar</Button>
                      <Button size="sm" variant="outline" onClick={() => { setRenombrando(false); setNombreEdit(detalle.nombre) }}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{detalle.nombre}</h2>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => setRenombrando(true)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Renombrar
                        </button>
                      )}
                    </div>
                  )}
                  <Badge variant={detalle.activo ? 'default' : 'secondary'} className="mt-1">
                    {detalle.activo ? 'Activa' : 'Archivada'}
                  </Badge>
                </div>

                {canWrite && (
                  <Button
                    size="sm"
                    variant={detalle.activo ? 'outline' : 'secondary'}
                    onClick={handleToggleActivo}
                  >
                    {detalle.activo ? 'Archivar' : 'Reactivar'}
                  </Button>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Barrios de esta zona</h3>

                {canWrite && (
                  <div className="relative mb-3">
                    <Input
                      value={barrioQuery}
                      onChange={(e) => setBarrioQuery(e.target.value)}
                      placeholder="Buscar o agregar barrio..."
                    />
                    {barrioQuery.trim() !== '' && (
                      <div className="absolute z-20 mt-1 w-full border border-gray-200 rounded-lg bg-white shadow-lg max-h-56 overflow-y-auto">
                        {buscandoBarrios && <div className="px-3 py-2.5 text-sm text-gray-400">Buscando...</div>}
                        {!buscandoBarrios && resultadosFiltrados.length === 0 && (
                          <div className="px-3 py-2.5 text-sm text-gray-400">Sin resultados.</div>
                        )}
                        {!buscandoBarrios && resultadosFiltrados.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            disabled={agregandoBarrioId === b.id}
                            onClick={() => intentarAgregarBarrio(b)}
                            className="w-full text-left px-3 py-2.5 text-sm border-b last:border-b-0 border-gray-100 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                          >
                            {agregandoBarrioId === b.id ? 'Agregando...' : b.nombre}
                          </button>
                        ))}
                        {showCrearBarrio && (
                          <button
                            type="button"
                            onClick={handleCrearBarrio}
                            disabled={creandoBarrio}
                            className="w-full text-left px-3 py-2.5 text-sm text-blue-600 font-medium border-t border-gray-100 hover:bg-blue-50 transition disabled:opacity-50"
                          >
                            {creandoBarrio ? 'Creando...' : `+ Crear "${barrioQueryTrim}"`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <ul className="border rounded-lg divide-y">
                  {detalle.barrios.length === 0 && (
                    <li className="p-3 text-sm text-gray-400">Sin barrios todavía.</li>
                  )}
                  {detalle.barrios.map(({ barrioId, barrio, otrasZonas }) => (
                    <li key={barrioId} className="px-3 py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm font-medium">{barrio.nombre}</span>
                        {otrasZonas.length > 0 && (
                          <div className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
                            <Badge variant="outline" className="border-amber-300 text-amber-700">Compartido</Badge>
                            <span>
                              También en: {otrasZonas.map((z) => z.nombre).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                      {canWrite && (
                        <button
                          type="button"
                          disabled={quitandoBarrioId === barrioId}
                          onClick={() => handleQuitarBarrio(barrioId, barrio.nombre)}
                          className="text-xs text-red-600 hover:text-red-800 underline shrink-0 disabled:opacity-50"
                        >
                          {quitandoBarrioId === barrioId ? 'Quitando...' : 'Quitar'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Diálogo de confirmación de solapamiento ---------------- */}
      {overlapPendiente && detalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="overlap-confirm-modal">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-3">Barrio compartido</h3>
            <p className="text-sm text-gray-700 mb-2">
              &quot;{overlapPendiente.barrioNombre}&quot; ya pertenece a{' '}
              {overlapPendiente.existingZones.map((z) => `Zona ${z.nombre}`).join(', ')}.
            </p>
            <p className="text-sm text-gray-700 mb-2">
              Puedes agregarlo también a Zona {detalle.nombre}.
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Esto no mueve ni reasigna automáticamente clientes, negocios o pedidos.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOverlapPendiente(null)} disabled={confirmando}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleConfirmarOverlap} disabled={confirmando}>
                {confirmando ? 'Agregando...' : `Agregar también a Zona ${detalle.nombre}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
