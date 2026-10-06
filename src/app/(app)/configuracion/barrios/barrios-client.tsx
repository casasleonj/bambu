'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface BarrioRow {
  id: string
  nombre: string
  activo: boolean
  _count?: { clientes: number; negocios: number }
}

interface BarriosClientProps {
  initialBarrios: BarrioRow[]
}

/**
 * Catálogo canónico de Barrio: crear, corregir (renombrar) y
 * archivar/reactivar. "Consultar" incluye cuántos Cliente/Negocio tiene
 * vinculados cada uno — ayuda a distinguir un Barrio real de un posible
 * duplicado sin implementar la detección/saneamiento de duplicados en sí
 * (eso es trabajo aparte, explícitamente fuera de alcance acá).
 *
 * Cualquier cambio estructural del Barrio (crear/renombrar/archivar) vive
 * ÚNICAMENTE acá — Zona solo lo consume de solo lectura.
 */
export default function BarriosClient({ initialBarrios }: BarriosClientProps) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const canWrite = role === 'ADMIN' || role === 'ASISTENTE'

  const [barrios, setBarrios] = useState<BarrioRow[]>(initialBarrios)
  const [query, setQuery] = useState('')
  const [incluirArchivados, setIncluirArchivados] = useState(false)
  const [loading, setLoading] = useState(false)

  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)

  const [renombrandoId, setRenombrandoId] = useState<string | null>(null)
  const [nombreEdit, setNombreEdit] = useState('')
  const [archivandoId, setArchivandoId] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetch = useCallback(async (q: string, incluirInactivos: boolean) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ q, limit: '200' })
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
        {!loading && barrios.length === 0 && (
          <div className="p-3 text-sm text-gray-400">Sin barrios que coincidan.</div>
        )}
        {!loading && barrios.map((barrio) => (
          <div key={barrio.id} className="px-3 py-3 flex items-center justify-between gap-3">
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
        ))}
      </div>
    </div>
  )
}
