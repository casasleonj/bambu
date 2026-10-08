'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface RelacionLite {
  id: string
  texto: string
}

interface BarrioRow {
  id: string
  nombre: string
  activo: boolean
  _count?: { clientes: number; negocios: number }
  aliases?: RelacionLite[]
  referencias?: RelacionLite[]
}

interface BarriosClientProps {
  initialBarrios: BarrioRow[]
}

/**
 * Catálogo canónico de Barrio: crear, corregir (renombrar), archivar/
 * reactivar, y (F4) administrar nombres alternativos y referencias
 * territoriales. "Consultar" incluye cuántos Cliente/Negocio tiene
 * vinculados cada uno — ayuda a distinguir un Barrio real de un posible
 * duplicado sin implementar la detección/saneamiento de duplicados en sí
 * (eso es trabajo aparte, explícitamente fuera de alcance acá).
 *
 * F4 (equipo, revisión 2026-10-07): "También se conoce como" (alias) y
 * "Referencias comunes" (referencia) se muestran como dos secciones
 * distintas — nunca agrupadas bajo una sola etiqueta genérica, porque el
 * ADMIN necesita distinguir cuál es cuál al decidir qué registrar. El
 * selector "¿Qué quieres registrar?" al agregar mapea internamente a
 * alias/referencia sin mostrar esos nombres técnicos en ningún texto.
 *
 * Cualquier cambio estructural del Barrio (crear/renombrar/archivar/
 * alias/referencia) vive ÚNICAMENTE acá — Zona y Cliente/Negocio solo lo
 * consumen de solo lectura.
 */
export default function BarriosClient({ initialBarrios }: BarriosClientProps) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const canWrite = role === 'ADMIN' || role === 'ASISTENTE'
  // Alias/Referencia son más sensibles (afectan resolución territorial de
  // TODOS los Barrios, no solo el propio) — mismo nivel de restricción que
  // Zona (solo ADMIN), más estricto que el canWrite general de Barrio.
  const canWriteReferencias = role === 'ADMIN'

  const [barrios, setBarrios] = useState<BarrioRow[]>(initialBarrios)
  const [query, setQuery] = useState('')
  const [incluirArchivados, setIncluirArchivados] = useState(false)
  const [loading, setLoading] = useState(false)

  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)

  const [renombrandoId, setRenombrandoId] = useState<string | null>(null)
  const [nombreEdit, setNombreEdit] = useState('')
  const [archivandoId, setArchivandoId] = useState<string | null>(null)

  // Formulario "+ Agregar" (alias/referencia) — uno abierto a la vez.
  const [agregandoEnBarrioId, setAgregandoEnBarrioId] = useState<string | null>(null)
  const [tipoNuevo, setTipoNuevo] = useState<'alias' | 'referencia'>('alias')
  const [textoNuevo, setTextoNuevo] = useState('')
  const [guardandoRelacion, setGuardandoRelacion] = useState(false)
  const [eliminandoRelacionId, setEliminandoRelacionId] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetch = useCallback(async (q: string, incluirInactivos: boolean) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ q, limit: '200', incluirRelaciones: '1' })
      if (incluirInactivos) params.set('incluirInactivos', '1')
      const res = await fetch(`/api/barrios?${params.toString()}`)
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) setBarrios(data.data)
    } catch {
      toast.error('Error de red buscando barrios')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => refetch(query, incluirArchivados), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, incluirArchivados, refetch])

  const handleCrear = async () => {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    setCreando(true)
    try {
      const res = await fetch('/api/barrios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        toast.success(`Barrio "${data.barrio.nombre}" creado`)
        setNuevoNombre('')
        await refetch(query, incluirArchivados)
      } else {
        toast.error(data.error?.message || 'No se pudo crear el barrio')
      }
    } catch {
      toast.error('Error de red creando el barrio')
    } finally {
      setCreando(false)
    }
  }

  const handleGuardarNombre = async (id: string) => {
    const nombre = nombreEdit.trim()
    if (!nombre) {
      setRenombrandoId(null)
      return
    }
    try {
      const res = await fetch(`/api/barrios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        toast.success('Barrio renombrado')
        setRenombrandoId(null)
        await refetch(query, incluirArchivados)
      } else {
        toast.error(data.error?.message || 'No se pudo renombrar')
      }
    } catch {
      toast.error('Error de red renombrando el barrio')
    }
  }

  const handleToggleActivo = async (barrio: BarrioRow) => {
    const nuevoActivo = !barrio.activo
    setArchivandoId(barrio.id)
    try {
      const res = await fetch(`/api/barrios/${barrio.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: nuevoActivo }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        toast.success(nuevoActivo ? 'Barrio reactivado' : 'Barrio archivado')
        await refetch(query, incluirArchivados)
      } else {
        toast.error(data.error?.message || 'No se pudo actualizar el barrio')
      }
    } catch {
      toast.error('Error de red actualizando el barrio')
    } finally {
      setArchivandoId(null)
    }
  }

  const abrirFormularioRelacion = (barrioId: string) => {
    setAgregandoEnBarrioId(barrioId)
    setTipoNuevo('alias')
    setTextoNuevo('')
  }

  const cerrarFormularioRelacion = () => {
    setAgregandoEnBarrioId(null)
    setTextoNuevo('')
  }

  const handleGuardarRelacion = async () => {
    const texto = textoNuevo.trim()
    if (!texto || !agregandoEnBarrioId) return
    setGuardandoRelacion(true)
    try {
      const endpoint = tipoNuevo === 'alias' ? 'alias' : 'referencias'
      const res = await fetch(`/api/barrios/${agregandoEnBarrioId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        toast.success(tipoNuevo === 'alias' ? 'Otro nombre agregado' : 'Referencia agregada')
        cerrarFormularioRelacion()
        await refetch(query, incluirArchivados)
      } else {
        toast.error(data.error?.message || 'No se pudo registrar')
      }
    } catch {
      toast.error('Error de red registrando')
    } finally {
      setGuardandoRelacion(false)
    }
  }

  const handleEliminarRelacion = async (barrioId: string, relacion: RelacionLite, tipo: 'alias' | 'referencia') => {
    setEliminandoRelacionId(relacion.id)
    try {
      const endpoint = tipo === 'alias' ? 'alias' : 'referencias'
      const res = await fetch(`/api/barrios/${barrioId}/${endpoint}/${relacion.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success) {
        toast.success('Eliminado')
        await refetch(query, incluirArchivados)
      } else {
        toast.error(data.error?.message || 'No se pudo eliminar')
      }
    } catch {
      toast.error('Error de red eliminando')
    } finally {
      setEliminandoRelacionId(null)
    }
  }

  // El checkbox dice "Mostrar archivados" — debe filtrar a SOLO archivados,
  // no mezclarlos con los activos. La API (`incluirInactivos=1`) trae
  // ambos a la vez (sin ese flag, filtra a activos en el propio query);
  // el filtro final a "solo archivados" se hace acá para no tener que
  // introducir un tercer modo en el servicio/API solo para esta pantalla.
  const barriosFiltrados = incluirArchivados ? barrios.filter((b) => !b.activo) : barrios

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Barrios</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catálogo canónico de Barrio: crear, corregir y administrar. Las Zonas agrupan barrios de este catálogo —
          no se crean barrios nuevos desde Zonas.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar barrio..." className="flex-1" />
        <label className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
          <input
            type="checkbox"
            checked={incluirArchivados}
            onChange={(e) => setIncluirArchivados(e.target.checked)}
          />
          Mostrar archivados
        </label>
      </div>

      {canWrite && (
        <div className="flex gap-2">
          <Input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre del barrio nuevo"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCrear() }}
          />
          <Button onClick={handleCrear} disabled={creando || !nuevoNombre.trim()}>
            {creando ? '...' : '+ Nuevo barrio'}
          </Button>
        </div>
      )}

      <div className="border rounded-lg divide-y">
        {loading && <div className="p-3 text-sm text-gray-400">Buscando...</div>}
        {!loading && barriosFiltrados.length === 0 && (
          <div className="p-3 text-sm text-gray-400">
            {incluirArchivados ? 'Sin barrios archivados.' : 'Sin barrios que coincidan.'}
          </div>
        )}
        {!loading && barriosFiltrados.map((barrio) => (
          <div key={barrio.id} className="px-3 py-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              {renombrandoId === barrio.id ? (
                <div className="flex gap-2 items-center flex-1">
                  <Input
                    value={nombreEdit}
                    onChange={(e) => setNombreEdit(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGuardarNombre(barrio.id) }}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => handleGuardarNombre(barrio.id)}>Guardar</Button>
                  <Button size="sm" variant="outline" onClick={() => setRenombrandoId(null)}>Cancelar</Button>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{barrio.nombre}</span>
                    {!barrio.activo && <Badge variant="secondary">Archivado</Badge>}
                  </div>
                  <span className="text-xs text-gray-500">
                    {barrio._count?.clientes ?? 0} cliente{barrio._count?.clientes === 1 ? '' : 's'} ·{' '}
                    {barrio._count?.negocios ?? 0} negocio{barrio._count?.negocios === 1 ? '' : 's'}
                  </span>
                </div>
              )}

              {canWrite && renombrandoId !== barrio.id && (
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setRenombrandoId(barrio.id); setNombreEdit(barrio.nombre) }}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    disabled={archivandoId === barrio.id}
                    onClick={() => handleToggleActivo(barrio)}
                    className="text-xs text-red-600 hover:text-red-800 underline disabled:opacity-50"
                  >
                    {archivandoId === barrio.id ? '...' : barrio.activo ? 'Archivar' : 'Reactivar'}
                  </button>
                </div>
              )}
            </div>

            {/* F4: también se conoce como / referencias comunes — secciones
                separadas a propósito, nunca agrupadas bajo una sola etiqueta. */}
            <div className="pl-0 space-y-2 text-sm">
              <RelacionSeccion
                etiqueta="También se conoce como"
                items={barrio.aliases ?? []}
                tipo="alias"
                barrioId={barrio.id}
                canWrite={canWriteReferencias}
                eliminandoId={eliminandoRelacionId}
                onEliminar={handleEliminarRelacion}
              />
              <RelacionSeccion
                etiqueta="Referencias comunes"
                items={barrio.referencias ?? []}
                tipo="referencia"
                barrioId={barrio.id}
                canWrite={canWriteReferencias}
                eliminandoId={eliminandoRelacionId}
                onEliminar={handleEliminarRelacion}
              />

              {canWriteReferencias && agregandoEnBarrioId !== barrio.id && (
                <button
                  type="button"
                  onClick={() => abrirFormularioRelacion(barrio.id)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  + Agregar
                </button>
              )}

              {canWriteReferencias && agregandoEnBarrioId === barrio.id && (
                <div className="border rounded-md p-3 space-y-2 bg-gray-50 max-w-sm">
                  <p className="text-xs font-medium text-gray-700">¿Qué quieres registrar?</p>
                  <div className="space-y-1">
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="radio"
                        name={`tipo-${barrio.id}`}
                        checked={tipoNuevo === 'alias'}
                        onChange={() => setTipoNuevo('alias')}
                        className="mt-0.5"
                      />
                      <span>
                        Otro nombre para este barrio
                        <span className="block text-gray-500">Ejemplo: &quot;Antillana&quot;</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="radio"
                        name={`tipo-${barrio.id}`}
                        checked={tipoNuevo === 'referencia'}
                        onChange={() => setTipoNuevo('referencia')}
                        className="mt-0.5"
                      />
                      <span>
                        Una referencia para ubicarlo mejor
                        <span className="block text-gray-500">Ejemplo: &quot;Antillana 2&quot;</span>
                      </span>
                    </label>
                  </div>
                  <Input
                    value={textoNuevo}
                    onChange={(e) => setTextoNuevo(e.target.value)}
                    placeholder="Texto"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGuardarRelacion() }}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleGuardarRelacion} disabled={guardandoRelacion || !textoNuevo.trim()}>
                      {guardandoRelacion ? '...' : 'Guardar'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={cerrarFormularioRelacion}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RelacionSeccion({
  etiqueta,
  items,
  tipo,
  barrioId,
  canWrite,
  eliminandoId,
  onEliminar,
}: {
  etiqueta: string
  items: RelacionLite[]
  tipo: 'alias' | 'referencia'
  barrioId: string
  canWrite: boolean
  eliminandoId: string | null
  onEliminar: (barrioId: string, relacion: RelacionLite, tipo: 'alias' | 'referencia') => void
}) {
  if (items.length === 0) return null

  return (
    <div>
      <span className="text-xs text-gray-500">{etiqueta}</span>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {items.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700"
          >
            {item.texto}
            {canWrite && (
              <button
                type="button"
                disabled={eliminandoId === item.id}
                onClick={() => onEliminar(barrioId, item, tipo)}
                className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                aria-label={`Quitar "${item.texto}"`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
