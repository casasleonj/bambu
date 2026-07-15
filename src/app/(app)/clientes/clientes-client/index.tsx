'use client'

import { generateUUID } from '@/lib/uuid'
import { useState, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { formatCurrency, formatLocalDate } from '@/lib/utils'
import {
  normalizarTelefono,
  formatearTelefonoParaInput,
  formatearTelefonoParaCopiar,
  formatearTelefonoParaLlamar,
} from '@/lib/telefono'
import { ErrorState } from '@/components/error-state'
import { SkeletonPage } from '@/components/skeleton'
import { Tooltip } from '@/components/tooltip'
import type { Cliente, Canal, ClientesClientProps, FormData } from './types'
import { PRODUCTOS_PRECIO } from './types'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { ClienteTable } from './cliente-table'
import { ClienteForm } from './cliente-form'
import { fetchResilient } from '@/lib/fetch-resilient'
import { fetchWithTimeout, FetchTimeoutError } from '@/lib/fetch-timeout'
import { ClienteHistorial } from './cliente-historial'
import { ClienteStats } from './cliente-stats'
import { NegocioForm } from '@/components/negocio-form'
import { NegocioDetailModal, type NegocioDetail } from '@/components/negocio-detail-modal'
import { calcularAlertasCliente } from '@/app/(app)/pedidos/pedidos-client/alertas-utils'
import { GuiaAlertaModal } from '@/components/guia-alerta-modal'
import { CasoGuiaModal } from '@/components/caso-guia-modal'
import type { AlertaTipo } from '@/lib/alertas-config'
import { getBadgeColor, ignorarAlerta } from '@/lib/alertas-config'
import { useEscapeGuard } from '@/hooks/use-escape-guard'
import { usePollingRefetch } from '@/hooks/use-polling-refetch'

export default function ClientesClient({
  initialClientes,
  initialLimiteFiados,
  openClienteId,
  filtroActivo,
  filtrosActivos,
}: ClientesClientProps) {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes)

  // FIX: sincronizar estado del cliente cuando el Server Component
  // re-renderiza con nuevos searchParams (ej: cambio de filtro en URL).
  // Sin esto, los filtros server-side no actualizan la UI.
  useEffect(() => {
    setClientes(initialClientes)
  }, [initialClientes])

  const { confirm, modal } = useConfirm()
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('info')
  const [isEdit, setIsEdit] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [formError, setFormError] = useState('')
  const [detailError, setDetailError] = useState<string | null>(null)
  const [alertasKey, setAlertasKey] = useState(0)
  const [formData, setFormData] = useState<FormData>({
    nombre: '',
    apellido: '',
    telefono: '',
    fuente: '',
    barrio: '',
    direccion: '',
    linkUbicacion: '',
    contactos: [],
    preciosEspeciales: '',
    notas: '',
    limitePedidosFiados: undefined,
    nombreNegocio: '',
    tipoNegocio: '',
    horaApertura: '',
    referencia: '',
  })

  const [sortBy, setSortBy] = useState<'nombre' | 'createdAt'>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [guiaTipo, setGuiaTipo] = useState<AlertaTipo | null>(null)
  const [guiaOpen, setGuiaOpen] = useState(false)
  const [casoCreado, setCasoCreado] = useState<any>(null)
  const [usuarios, setUsuarios] = useState<Array<{ id: string; username: string; rol: string }>>([])
  const [userRole, setUserRole] = useState<string | null>(null)

  // Negocios state
  const [negocios, setNegocios] = useState<NegocioDetail[]>([])
  const [negocioFormOpen, setNegocioFormOpen] = useState(false)
  const [negocioEditData, setNegocioEditData] = useState<{ id: string; nombre: string; tipoNegocio: string | null; direccion: string | null; barrio: string | null; referencia: string | null; linkUbicacion: string | null; horaApertura: string | null; rutaId: string | null } | null>(null)
  const [viewNegocioData, setViewNegocioData] = useState<NegocioDetail | null>(null)
  const [showNegocioDetail, setShowNegocioDetail] = useState(false)

  const puedeDesactivar = userRole === 'ADMIN' || userRole === 'CONTADOR'
  const puedeEliminarNegocio = userRole === 'ADMIN'

  const alertas = useMemo(() => {
    if (!selectedCliente) return []
    return calcularAlertasCliente(selectedCliente, selectedCliente.pedidos || [])
  }, [selectedCliente])

  const alertasAltas = useMemo(() => alertas.filter((a) => a.severidad === 'ALTA'), [alertas])

  useEffect(() => {
    fetch('/api/trabajadores')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const users = d.trabajadores
            .filter((t: any) => t.userId)
            .map((t: any) => ({ id: t.userId, username: t.nombre, rol: t.rol }))
          setUsuarios(users)
        }
      })
      .catch(err => console.warn('[init] trabajadores fetch failed', err))
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.user) setUserRole(d.user.rol)
      })
      .catch(err => console.warn('[init] profile fetch failed', err))
  }, [])

  useEffect(() => {
    if (!openClienteId || clientes.length === 0) return
    const cliente = clientes.find(c => c.id === openClienteId || c.clienteId === openClienteId)
    if (cliente) {
      setSelectedCliente(cliente)
      setShowDetail(true)
      setActiveTab('info')
    }
  }, [openClienteId, clientes])

  // Fetch negocios when a client is selected
  useEffect(() => {
    if (!selectedCliente) {
      setNegocios([])
      return
    }
    fetch(`/api/negocios?clienteId=${selectedCliente.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setNegocios(d.data)
        else setNegocios([])
      })
      .catch(() => setNegocios([]))
  }, [selectedCliente])

  // Escape closes side panel — registered in modal stack so it only fires
  // when no nested modal (NegocioForm, GuiaAlerta, etc.) is on top.
  useEscapeGuard(showDetail, () => {
    setShowDetail(false)
    setIsEditing(false)
    setDetailError(null)
  })

  const [canalActivo, setCanalActivo] = useState<Canal>('DOMICILIO')
  const [preciosEspecialesMap, setPreciosEspecialesMap] = useState<Record<Canal, Record<string, number | undefined>>>({
    DOMICILIO: {},
    PUNTO: {},
  })
  const [preciosBase, setPreciosBase] = useState<Record<Canal, Record<string, number>>>({
    DOMICILIO: {},
    PUNTO: {},
  })
  const [preciosLoaded, setPreciosLoaded] = useState(false)

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams('all=true')
      if (filtroActivo === 'bloqueado') params.set('bloqueado', 'true')
      else if (filtroActivo === 'reclamaciones') params.set('reclamaciones', 'gte3')
      else if (filtroActivo === 'noVerificado') params.set('noVerificado', 'true')
      if (filtrosActivos.mostrarNegocio !== 'todos') {
        params.set('mostrarNegocio', filtrosActivos.mostrarNegocio)
      }
      if (filtrosActivos.todosNegociosConLink) {
        params.set('todosNegociosConLink', 'true')
      }
      if (filtrosActivos.clienteConLink) {
        params.set('clienteConLink', 'true')
      }
      const res = await fetchWithTimeout(`/api/clientes?${params.toString()}`, {}, 10_000)
      if (!res.ok) throw new Error('Error al cargar clientes')
      const data = await res.json()
      setClientes(data.clientes || data.data || [])
    } catch (error) {
      const msg = error instanceof FetchTimeoutError
        ? 'La conexión tardó demasiado cargando clientes'
        : 'No se pudieron cargar los clientes'
      setFetchError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [filtroActivo, filtrosActivos])

  // Polling: refresh client list every 60s (replaces realtime SSE to cut Vercel cost).
  usePollingRefetch(fetchClientes, 60_000)

  // FIX REGRESION mobile 2026-06-10 ("no se pudieron cargar los clientes"):
  // NO disparar fetchClientes() en mount. El page.tsx server ya pasa
  // `initialClientes` con los datos correctos (filtrados si hay filtroActivo
  // en el URL: ?bloqueado=true, ?reclamaciones=gte3, ?noVerificado=true).
  // Hacer un fetch extra en mount causa:
  // - Round-trip innecesario a /api/clientes.
  // - Posible rate-limit en mobile con conexion lenta.
  // - Si el fetch falla, `setFetchError` setea el error y la UI de error
  //   REEMPLAZA la lista del SSR visualmente, aunque los datos
  //   ya estaban disponibles. Esto era el bug del user.
  //
  // Si el user cambia el filtroActivo, cliente-table.tsx usa
  // router.push con nuevos params, lo cual re-renderiza el layout server
  // y trae nuevos `initialClientes`. No necesitamos re-fetch en cliente.
  //
  // fetchClientes() todavia se llama despues de cada mutacion
  // (handleCreate, handleDelete, etc., lineas 465, 531, 592, 615, 637)
  // para refrescar la lista despues de cambios.

  const loadPreciosBase = useCallback(async () => {
    for (const canal of ['DOMICILIO', 'PUNTO'] as Canal[]) {
      try {
        const res = await fetch(`/api/precios/tabla?canal=${canal}`)
        const data = await res.json()
        const tabla = data.tabla || {}
        const baseMap: Record<string, number> = {}
        for (const prod of PRODUCTOS_PRECIO) {
          const tiers = tabla[prod.codigo] || []
          if (tiers.length > 0) {
            const baseTier = tiers.reduce((min: any, t: any) => t.cantMin < min.cantMin ? t : min, tiers[0])
            baseMap[prod.codigo] = Number(baseTier.precio)
          }
        }
        setPreciosBase(prev => ({ ...prev, [canal]: baseMap }))
      } catch (err) { console.warn('[loadPreciosBase] failed', err) }
    }
  }, [])

  function parsePreciosEspeciales(json: string | undefined): Record<Canal, Record<string, number | undefined>> {
    const empty: Record<Canal, Record<string, number | undefined>> = { DOMICILIO: {}, PUNTO: {} }
    if (!json) return empty
    try {
      const parsed = JSON.parse(json)
      if (parsed.DOMICILIO || parsed.PUNTO) {
        return {
          DOMICILIO: parsed.DOMICILIO || {},
          PUNTO: parsed.PUNTO || {},
        }
      }
      return { DOMICILIO: { ...parsed }, PUNTO: { ...parsed } }
    } catch {
      return empty
    }
  }

  function buildPreciosJson(): string {
    const result: Record<Canal, Record<string, number>> = { DOMICILIO: {}, PUNTO: {} }
    for (const canal of ['DOMICILIO', 'PUNTO'] as Canal[]) {
      for (const prod of PRODUCTOS_PRECIO) {
        const val = preciosEspecialesMap[canal][prod.codigo]
        if (val !== undefined && val > 0 && val !== preciosBase[canal][prod.codigo]) {
          result[canal][prod.codigo] = val
        }
      }
    }
    const hasAny = Object.values(result.DOMICILIO).length > 0 || Object.values(result.PUNTO).length > 0
    return hasAny ? JSON.stringify(result) : ''
  }

  const clientesFiltrados = useMemo(() => clientes.filter((c) => {
    const term = search.toLowerCase()
    const termTelefono = normalizarTelefono(term)
    const matchTelefono = termTelefono.length > 0
      ? (tel: string) => normalizarTelefono(tel).includes(termTelefono)
      : () => false
    return (
      c.nombre.toLowerCase().includes(term) ||
      (c.apellido ?? '').toLowerCase().includes(term) ||
      matchTelefono(c.telefono) ||
      c.nombreNegocio?.toLowerCase().includes(term) ||
      c.tipoNegocio?.toLowerCase().includes(term) ||
      c.barrio?.toLowerCase().includes(term) ||
      c.direccion?.toLowerCase().includes(term) ||
      c.notas?.toLowerCase().includes(term) ||
      c.contactos?.some(ct =>
        ct.nombre.toLowerCase().includes(term) ||
        matchTelefono(ct.telefono) ||
        ct.relacion?.toLowerCase().includes(term)
      ) ||
      c.negocios?.some(neg =>
        neg.nombre?.toLowerCase().includes(term) ||
        neg.direccion?.toLowerCase().includes(term) ||
        neg.barrio?.toLowerCase().includes(term) ||
        neg.tipoNegocio?.toLowerCase().includes(term) ||
        neg.referencia?.toLowerCase().includes(term)
      )
    )
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'createdAt') {
      return dir * (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
    }
    return dir * a.nombre.localeCompare(b.nombre)
  }), [clientes, search, sortBy, sortDir])

  async function openCreateModal() {
    setFormData({
      nombre: '',
      apellido: '',
      telefono: '',
      fuente: '',
      barrio: '',
      direccion: '',
      linkUbicacion: '',
      contactos: [],
      preciosEspeciales: '',
      notas: '',
      limitePedidosFiados: undefined,
      nombreNegocio: '',
      tipoNegocio: '',
      horaApertura: '',
      referencia: '',
    })
    setPreciosEspecialesMap({ DOMICILIO: {}, PUNTO: {} })
    setCanalActivo('DOMICILIO')
    setFormError('')
    setIsEdit(false)
    setIsEditing(false)
    setPreciosLoaded(false)
    setShowModal(true)
    await loadPreciosBase()
    setPreciosLoaded(true)
  }

  async function openEditModal() {
    if (!selectedCliente) return
    setFormData({
      nombre: selectedCliente.nombre,
      apellido: selectedCliente.apellido || '',
      telefono: selectedCliente.telefono,
      fuente: selectedCliente.fuente || '',
      barrio: selectedCliente.barrio || '',
      direccion: selectedCliente.direccion || '',
      linkUbicacion: selectedCliente.linkUbicacion || '',
      contactos: (selectedCliente.contactos as any[]) || [],
      preciosEspeciales: selectedCliente.preciosEspeciales || '',
      notas: selectedCliente.notas || '',
      limitePedidosFiados: selectedCliente.limitePedidosFiados || undefined,
      nombreNegocio: selectedCliente.nombreNegocio || '',
      tipoNegocio: selectedCliente.tipoNegocio || '',
      horaApertura: selectedCliente.horaApertura || '',
      referencia: selectedCliente.referencia || '',
    })
    setPreciosEspecialesMap(parsePreciosEspeciales(selectedCliente.preciosEspeciales))
    setCanalActivo('DOMICILIO')
    setIsEdit(true)
    setIsEditing(true)
    setPreciosLoaded(false)
    await loadPreciosBase()
    setPreciosLoaded(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setIsEdit(false)
    setFormError('')
  }

  const [saving, setSaving] = useState(false)

  /**
   * Sincroniza los contactos de un cliente con la nueva tabla ContactoCliente
   * (Fase 3 de la 1FN). Compara los contactos actuales del servidor
   * con los del form y hace POST/PATCH/DELETE individuales.
   *
   * Estrategia: diff por teléfono (es la clave única [clienteId, telefono]).
   * - Contactos en form con teléfono nuevo (sin match en server) → POST
   * - Contactos en server con teléfono que ya no está en form → DELETE
   * - Contactos en ambos con el mismo teléfono pero distinto nombre/relacion → PATCH
   * - Contactos en ambos con el mismo teléfono y mismos campos → unchanged
   *
   * Devuelve {ok, errors} donde ok es true si todas las ops fueron exitosas
   * (o no había nada que sincronizar).
   */
  async function syncContactos(
    clienteId: string,
    contactosActuales: Array<{ id?: string; telefono: string; nombre?: string; relacion?: string | null }>,
    contactosForm: Array<{ telefono: string; nombre: string; relacion?: string }>,
  ): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = []

    // Normalizar teléfonos para el diff (formato internacional colombiano)
    const norm = (t: string) => normalizarTelefono(t)
    const normRel = (r?: string | null) => (r ?? '').trim() || null

    // Map: telefono normalizado → { nombre, relacion, id? }
    const enForm = new Map<string, { nombre: string; relacion: string | null }>()
    for (const c of contactosForm) {
      const telNormalizado = normalizarTelefono(c.telefono)
      if (!c.nombre.trim() || !telNormalizado || telNormalizado.length < 7) continue
      enForm.set(telNormalizado, {
        nombre: c.nombre.trim(),
        relacion: normRel(c.relacion),
      })
    }

    // Map: telefono normalizado → { id, nombre, relacion } del server
    const enServer = new Map<string, { id: string; nombre: string; relacion: string | null }>()
    for (const c of contactosActuales) {
      if (c.id && c.telefono) {
        enServer.set(norm(c.telefono), {
          id: c.id,
          nombre: (c.nombre ?? '').trim(),
          relacion: normRel(c.relacion ?? null),
        })
      }
    }

    // DELETE: están en server pero NO en form
    for (const [tel, { id }] of enServer) {
      if (!enForm.has(tel)) {
        try {
          const res = await fetchWithTimeout(`/api/clientes/${clienteId}/contactos/${id}`, {
            method: 'DELETE',
          }, 10_000)
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            errors.push(`DELETE ${tel}: ${data.error?.message ?? res.status}`)
          }
        } catch (err) {
          errors.push(`DELETE ${tel}: ${err instanceof FetchTimeoutError ? 'timeout' : 'error de red'}`)
        }
      }
    }

    // POST: están en form pero NO en server (teléfono nuevo)
    for (const [tel, payload] of enForm) {
      if (!enServer.has(tel)) {
        try {
          const res = await fetchWithTimeout(`/api/clientes/${clienteId}/contactos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: payload.nombre,
              telefono: tel,
              relacion: payload.relacion ?? undefined,
            }),
          }, 10_000)
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            errors.push(`POST ${tel}: ${data.error?.message ?? res.status}`)
          }
        } catch (err) {
          errors.push(`POST ${tel}: ${err instanceof FetchTimeoutError ? 'timeout' : 'error de red'}`)
        }
      }
    }

    // PATCH: están en ambos pero cambiaron nombre o relacion
    for (const [tel, formPayload] of enForm) {
      const serverEntry = enServer.get(tel)
      if (!serverEntry) continue // ya manejado en POST
      const changed =
        serverEntry.nombre !== formPayload.nombre ||
        serverEntry.relacion !== formPayload.relacion
      if (!changed) continue
      try {
        const res = await fetchWithTimeout(`/api/clientes/${clienteId}/contactos/${serverEntry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: formPayload.nombre,
            relacion: formPayload.relacion,
          }),
        }, 10_000)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          errors.push(`PATCH ${tel}: ${data.error?.message ?? res.status}`)
        }
      } catch (err) {
        errors.push(`PATCH ${tel}: ${err instanceof FetchTimeoutError ? 'timeout' : 'error de red'}`)
      }
    }

    return { ok: errors.length === 0, errors }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (saving) return

    // Validación local antes de enviar
    if (!formData.nombre.trim()) {
      setFormError('El nombre es obligatorio')
      return
    }
    const telefonoNormalizado = normalizarTelefono(formData.telefono)
    if (!telefonoNormalizado) {
      setFormError('El teléfono es obligatorio')
      return
    }
    if (telefonoNormalizado.length < 7) {
      setFormError('Teléfono inválido. Debe tener al menos 7 dígitos.')
      return
    }

    setSaving(true)
    try {
      const preciosJson = buildPreciosJson()
      // NOTA: `contactos` ya no va en el body (Fase 3: la columna legacy
      // `Cliente.contactos Json?` no existe). Se sincroniza después via
      // sub-endpoints `POST/DELETE /api/clientes/[id]/contactos`.
      const { contactos: _contactosLegacy, telefono: _telefonoRaw, ...formDataSinContactos } = formData
      const body = {
        ...formDataSinContactos,
        telefono: telefonoNormalizado,
        preciosEspeciales: preciosJson || undefined,
        linkUbicacion: formData.linkUbicacion || null,
      }
      if (isEdit && selectedCliente) {
        // PUT no tiene server-side dedup todavía (admin-only, no field use);
        // se usa fetch directo. Offline-failure muestra toast.error normal.
        const res = await fetch(`/api/clientes/${selectedCliente.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          // Sincronizar contactos con la tabla ContactoCliente (1FN, Fase 3)
          // Diff contra los contactos originales del cliente seleccionado.
          const contactosOriginales = (selectedCliente.contactos as Array<{ id?: string; telefono: string }>) || []
          const contactosLimpios = formData.contactos.filter(
            c => {
              const tel = normalizarTelefono(c.telefono)
              return c.nombre.trim() && tel.length >= 7
            }
          )
          const sync = await syncContactos(selectedCliente.id, contactosOriginales, contactosLimpios)
          if (!sync.ok) {
            toast.error(`Cliente guardado, pero algunos contactos fallaron: ${sync.errors.join('; ')}`)
          }

          await fetchClientes()
          if (isEditing) {
            setIsEditing(false)
            setIsEdit(false)
            await viewCliente(selectedCliente.id)
          } else {
            setShowModal(false)
          }
          if (sync.ok) toast.success('Cliente actualizado')
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error?.message || 'Error al guardar cliente')
          toast.error(data.error?.formErrors?.[0] || data.error?.message || 'Error al guardar cliente')
        }
      } else {
        // POST: usa fetchResilient para offline-first (repartidor field use).
        // Si la red falla durante la creación, encola automáticamente.
        // Defensa adicional: nunca dejar el botón pegado más de 8s por si
        // fetchResilient no resuelve (ej. Service Worker interfiriendo o red
        // lenta que navigator.onLine reporta como online).
        const offlineId = generateUUID()
        const submitTimeoutMs = 8_000
        const result = await Promise.race([
          fetchResilient<{
            success: boolean
            deduped?: boolean
            cliente?: { id: string; nombre: string; telefono: string; direccion?: string; barrio?: string; [key: string]: unknown }
            error?: { message?: string; formErrors?: string[] }
          }>('/api/clientes', {
            method: 'POST',
            body: { ...body, offlineId },
            localEndpoint: 'crear-cliente',
          }),
          new Promise<
            { status: 'timeout' }
          >((resolve) => setTimeout(() => resolve({ status: 'timeout' }), submitTimeoutMs)),
        ])

        if (result.status === 'timeout') {
          setSaving(false)
          toast.info('La conexión tardó mucho. El cliente quedó guardado en el celular y se enviará cuando la red mejore.')
          setShowModal(false)
          return
        }

        if (result.status === 'offline') {
          setSaving(false)
          toast.info('Sin conexión. Cliente guardado, se creará al recuperar la red.')
          setShowModal(false)
          return
        }

        if (result.status === 'error') {
          setSaving(false)
          setFormError(result.error || 'Error al guardar cliente')
          toast.error(result.error || 'Error al guardar cliente')
          return
        }

        // status === 'ok' (puede ser deduped o freshly created)
        const data = result.data
        const newCliente = data.cliente || null
        const newClienteId = newCliente?.id

        // Cerrar modal y liberar botón INMEDIATAMENTE después de que el
        // servidor respondió. La sincronización de contactos y el refetch
        // de la lista corren en segundo plano para no congelar la UI en
        // conexiones rurales 2G/3G.
        setShowModal(false)
        setSaving(false)
        toast.success(data.deduped ? 'Cliente ya estaba creado' : 'Cliente creado exitosamente', {
          action: {
            label: 'Agregar negocio',
            onClick: () => {
              setNegocioEditData(null)
              setNegocioFormOpen(true)
              if (newCliente) {
                setTimeout(() => {
                  const dirInput = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Calle, número, referencias..."]')
                  const barrioInput = document.querySelector<HTMLInputElement>('input[placeholder="Ej: Centro"]')
                  if (dirInput && newCliente.direccion && !dirInput.value) {
                    dirInput.value = newCliente.direccion as string
                    dirInput.dispatchEvent(new Event('input', { bubbles: true }))
                  }
                  if (barrioInput && newCliente.barrio && !barrioInput.value) {
                    barrioInput.value = newCliente.barrio as string
                    barrioInput.dispatchEvent(new Event('input', { bubbles: true }))
                  }
                }, 100)
              }
            },
          },
        })

        // Sincronizar contactos y recargar lista en background.
        // Si falla, avisamos con toast pero NO volvemos a dejar el botón
        // trabado.
        ;(async () => {
          // Sincronizar contactos con la tabla ContactoCliente (1FN, Fase 3)
          // Si la creación fue deduped (cliente ya existía), NO sincronizamos:
          // los contactos del form podrían pisar los del cliente original.
          if (newClienteId && !data.deduped) {
            const contactosLimpios = formData.contactos.filter(
              c => {
                const tel = normalizarTelefono(c.telefono)
                return c.nombre.trim() && tel.length >= 7
              }
            )
            if (contactosLimpios.length > 0) {
              const sync = await syncContactos(
                newClienteId,
                [], // server vacío porque es cliente nuevo
                contactosLimpios,
              )
              if (!sync.ok) {
                toast.error(`Cliente creado, pero algunos contactos fallaron: ${sync.errors.join('; ')}`)
              }
            }
          }

          try {
            await fetchClientes()
          } catch (err) {
            toast.error('No se pudo actualizar la lista de clientes. Se actualizará al recargar.')
          }
        })()
      }
    } catch (error) {
      setFormError('Error de conexión al guardar')
      toast.error('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function viewCliente(id: string) {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const res = await fetchWithTimeout(`/api/clientes/${id}`, {}, 10_000)
      if (!res.ok) {
        // FIX REGRESION mobile 2026-06-10 ("no me abre el detalle"):
        // antes esto solo hacia toast.error y retornaba, sin abrir el modal.
        // El user pensaba que el click no funcionaba. Ahora abrimos el modal
        // con un cliente stub (solo el id) y mostramos el error dentro del
        // modal para que el user sepa que paso.
        setSelectedCliente({
          id,
          clienteId: id,
          nombre: 'No se pudo cargar el cliente',
          telefono: '',
          frecuencia: 'IRREGULAR',
          activo: true,
        } as Cliente)
        setShowDetail(true)
        setActiveTab('info')
        setDetailError(
          res.status === 404
            ? 'Cliente no encontrado.'
            : `Error al cargar el cliente (HTTP ${res.status}). Intenta de nuevo.`,
        )
        return
      }
      const data = await res.json()
      if (data.cliente) {
        setSelectedCliente(data.cliente)
        setShowDetail(true)
        setActiveTab('info')
        setDetailError(null)
      } else {
        setDetailError('Respuesta inesperada del servidor.')
        setShowDetail(true)
      }
    } catch (error) {
      setSelectedCliente({
        id,
        clienteId: id,
        nombre: 'Error de red',
        telefono: '',
        frecuencia: 'IRREGULAR',
        activo: true,
      } as Cliente)
      setShowDetail(true)
      setDetailError(
        'No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.',
      )
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm('Desactivar este cliente?')
    if (!ok) return
    try {
      const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchClientes()
        setShowDetail(false)
        setSelectedCliente(null)
        setDetailError(null)
        toast.success('Cliente desactivado')
      } else {
        toast.error('Error desactivando cliente')
      }
    } catch (error) {
      toast.error('Error desactivando cliente')
    }
  }

  function viewNegocio(neg: NegocioDetail) {
    setViewNegocioData(neg)
    setShowNegocioDetail(true)
  }

  function closeNegocioDetail() {
    setViewNegocioData(null)
    setShowNegocioDetail(false)
  }

  function handleEditNegocioFromDetail(neg: NegocioDetail) {
    setViewNegocioData(null)
    setShowNegocioDetail(false)
    setNegocioEditData({
      id: neg.id,
      nombre: neg.nombre,
      tipoNegocio: neg.tipoNegocio,
      direccion: neg.direccion,
      barrio: neg.barrio,
      referencia: neg.referencia || null,
      linkUbicacion: neg.linkUbicacion || null,
      horaApertura: neg.horaApertura || null,
      rutaId: neg.ruta?.id || null,
    })
    setNegocioFormOpen(true)
  }

  async function handleNegocioDeleted() {
    if (selectedCliente) {
      try {
        const res = await fetch(`/api/negocios?clienteId=${selectedCliente.id}`)
        if (res.ok) {
          const data = await res.json()
          if (data.success) setNegocios(data.data)
        }
      } catch {}
    }
    closeNegocioDetail()
  }

  async function toggleVerificado(id: string, verificado: boolean) {
    try {
      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificado }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(verificado ? 'Cliente verificado' : 'Marcado como no verificado')
        await viewCliente(id)
        await fetchClientes()
      } else {
        toast.error(data.error?.message || 'Error actualizando cliente')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  async function toggleBloqueado(id: string, bloqueado: boolean) {
    const ok = await confirm(bloqueado ? 'Bloquear fiados para este cliente?' : 'Desbloquear fiados para este cliente?')
    if (!ok) return
    try {
      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bloqueado }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(bloqueado ? 'Cliente bloqueado' : 'Cliente desbloqueado')
        await viewCliente(id)
        await fetchClientes()
      } else {
        toast.error(data.error?.message || 'Error actualizando cliente')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handlePrecioEspecialChange = useCallback((canal: Canal, codigo: string, valor: number | undefined) => {
    setPreciosEspecialesMap(prev => ({
      ...prev,
      [canal]: { ...prev[canal], [codigo]: Number.isFinite(valor as number) ? valor : undefined },
    }))
  }, [])

  if (loading && clientes.length === 0) {
    return <SkeletonPage hasStats={false} hasFilters cardCount={5} />
  }

  if (fetchError && clientes.length === 0) {
    return (
      <ErrorState
        title="No se pudieron cargar los clientes"
        message={fetchError}
        errorCode="FETCH_CLIENTES_ERROR"
        onRetry={fetchClientes}
      />
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Nuevo Cliente
        </button>
      </div>

      <ClienteTable
        clientes={clientesFiltrados}
        search={search}
        onSearchChange={setSearch}
        fetchError={fetchError}
        onRetry={fetchClientes}
        onCreateClick={openCreateModal}
        onViewCliente={viewCliente}
        onViewNegocio={viewNegocio}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(by, dir) => { setSortBy(by); setSortDir(dir) }}
        selectedClienteId={selectedCliente?.id}
        filtroActivo={filtroActivo}
        filtrosActivos={filtrosActivos}
      />

      <ClienteForm
        open={showModal}
        onClose={() => setShowModal(false)}
        isEdit={isEdit}
        formData={formData}
        onFormDataChange={setFormData}
        formError={formError}
        saving={saving}
        onSubmit={handleSubmit}
        canalActivo={canalActivo}
        onCanalActivoChange={setCanalActivo}
        preciosEspecialesMap={preciosEspecialesMap}
        onPrecioEspecialChange={handlePrecioEspecialChange}
        preciosBase={preciosBase}
        plantillaRecurrente={selectedCliente?.plantillaRecurrente}
        limiteGlobalFiados={initialLimiteFiados}
      />

      {/* Side Panel for Client Detail */}
      {showDetail && selectedCliente && (
        <>
          {/* Overlay — solo en mobile, desktop permite clic en lista lateral */}
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => { setShowDetail(false); setIsEditing(false); }}
          />
          {/* Panel */}
          <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-white shadow-xl z-50 flex flex-col overflow-hidden pointer-events-auto">
            {/* Panel header - mobile grip handle + back button */}
            <div className="md:hidden flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
              <button
                onClick={() => { setShowDetail(false); setIsEditing(false); }}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Volver
              </button>
              <div className="w-10 h-1 rounded-full bg-gray-300" />
              <div className="w-16" />
            </div>

            {/* FIX REGRESION mobile 2026-06-10 ("no me abre el detalle"):
                mostrar el error de carga dentro del modal en lugar de
                solo un toast. El user debe ver que el modal abrió y por
                que el contenido no se cargo. */}
            {detailError && !detailLoading && (
              <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-start gap-2" role="alert">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-red-700 font-medium">{detailError}</p>
                </div>
                <button
                  onClick={() => { setShowDetail(false); setIsEditing(false); setDetailError(null) }}
                  className="text-red-400 hover:text-red-600 p-1"
                  aria-label="Cerrar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {detailLoading ? (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-5 bg-gray-200 rounded w-48 animate-pulse" />
                    <div className="h-3 bg-gray-200 rounded w-24 animate-pulse" />
                  </div>
                </div>
                <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
                <div className="h-48 bg-gray-200 rounded-xl animate-pulse" />
              </div>
            ) : isEditing ? (
              /* Edit mode within panel */
              <div className="flex flex-col h-full min-h-0">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-800">Editar Cliente</h2>
                  <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 p-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <ClienteForm
                  inline
                  formId="cliente-form-inline"
                  isEdit={true}
                  formData={formData}
                  onFormDataChange={setFormData}
                  formError={formError}
                  saving={saving}
                  onSubmit={handleSubmit}
                  canalActivo={canalActivo}
                  onCanalActivoChange={setCanalActivo}
                  preciosEspecialesMap={preciosEspecialesMap}
                  onPrecioEspecialChange={handlePrecioEspecialChange}
                  preciosBase={preciosBase}
                  plantillaRecurrente={selectedCliente?.plantillaRecurrente}
                  limiteGlobalFiados={initialLimiteFiados}
                />
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
                  <button type="button" onClick={cancelEdit} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium">Cancelar</button>
                  <button type="submit" form="cliente-form-inline" disabled={saving || (isEdit && !preciosLoaded)}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : !preciosLoaded && isEdit ? 'Cargando precios...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
          <>
            {/* Header with avatar, name, and quick actions */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${
                    selectedCliente.saldoPendiente && selectedCliente.saldoPendiente > 0
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                  }`}>
                    {selectedCliente.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">
                      {selectedCliente.nombre} {selectedCliente.apellido}
                    </h2>
                    {selectedCliente.nombreNegocio && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {selectedCliente.nombreNegocio}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setShowDetail(false); setDetailError(null) }}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1 transition"
                  aria-label="Cerrar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Quick action bar */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <Tooltip content="Crear un pedido para este cliente" position="bottom">
                  <Link
                    href={`/pedidos?new=1&clienteId=${selectedCliente.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Crear Pedido
                  </Link>
                </Tooltip>
                <Tooltip content="Llamar al cliente" position="bottom">
                  <a
                    href={formatearTelefonoParaLlamar(selectedCliente.telefono)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Llamar
                  </a>
                </Tooltip>
                <Tooltip content="Editar información del cliente" position="bottom">
                  <button
                    onClick={openEditModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                  </button>
                </Tooltip>
                {selectedCliente.verificado ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium border border-green-200">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    Verificado
                  </span>
                ) : (
                  <Tooltip content="Marcar cliente como verificado" position="bottom">
                    <button
                      onClick={() => toggleVerificado(selectedCliente.id, true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 transition border border-amber-200"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Verificar
                    </button>
                  </Tooltip>
                )}
                {selectedCliente.bloqueado ? (
                  <Tooltip content="Desbloquear fiados para este cliente" position="bottom">
                    <button
                      onClick={() => toggleBloqueado(selectedCliente.id, false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 transition border border-red-200"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                      Desbloquear
                    </button>
                  </Tooltip>
                ) : (
                  <Tooltip content="Bloquear fiados para este cliente" position="bottom">
                    <button
                      onClick={() => toggleBloqueado(selectedCliente.id, true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-100 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Bloquear
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Recurring orders banner */}
            {selectedCliente.plantillaRecurrente?.activo && (
              <Link
                href={`/recurrentes/${selectedCliente.plantillaRecurrente.id}`}
                className="block px-4 py-3 bg-indigo-50 border-b border-indigo-100 cursor-pointer hover:bg-indigo-100 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-indigo-800">
                        Pedidos recurrentes activos — cada {selectedCliente.plantillaRecurrente.cadaNDias} días
                      </p>
                      {selectedCliente.plantillaRecurrente.proxGeneracion && (
                        <p className="text-xs text-indigo-600">
                          Próxima generación: {formatLocalDate(selectedCliente.plantillaRecurrente.proxGeneracion)}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-indigo-600 hover:underline">Gestionar →</span>
                </div>
              </Link>
            )}

            {/* Status banners */}
            {selectedCliente.saldoPendiente && selectedCliente.saldoPendiente > 0 && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-red-700 font-medium">Cuenta por cobrar</span>
                  </div>
                  <span className="text-lg font-bold text-red-600">
                    {formatCurrency(selectedCliente.saldoPendiente)}
                  </span>
                </div>
              </div>
            )}

            {(selectedCliente.frecuenciaSugerida || (selectedCliente.productosSugeridos && selectedCliente.productosSugeridos.length > 0)) && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-semibold text-blue-700 uppercase mb-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Patrón de consumo (guía)
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {selectedCliente.frecuenciaSugerida && (
                    <span className="text-blue-800 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Compra {selectedCliente.frecuenciaSugerida.label.toLowerCase()}
                    </span>
                  )}
                  {selectedCliente.productosSugeridos && selectedCliente.productosSugeridos.length > 0 && (
                    <span className="text-blue-800 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      Suele pedir: {selectedCliente.productosSugeridos.map(p =>
                        `${p.cantidadPromedio} ${p.nombre} (${p.frecuencia}%)`
                      ).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Alertas del cliente */}
            {alertas.length > 0 && (
              <div className={`px-4 py-3 border-b ${alertasAltas.length > 0 ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <svg className={`w-4 h-4 ${alertasAltas.length > 0 ? 'text-red-500' : 'text-amber-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className={`text-sm font-bold ${alertasAltas.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                      {alertas.length} alerta{alertas.length !== 1 ? 's' : ''} activa{alertas.length !== 1 ? 's' : ''}
                      {alertasAltas.length > 0 && ` (${alertasAltas.length} crítica${alertasAltas.length !== 1 ? 's' : ''})`}
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab('alertas')}
                    className={`text-xs font-medium underline ${alertasAltas.length > 0 ? 'text-red-600' : 'text-amber-600'}`}
                  >
                    Ver todas →
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {alertasAltas.slice(0, 3).map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-medium border border-red-200">
                      {a.detalle}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {[
                { key: 'info', label: 'Info', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )},
                { key: 'historial', label: 'Historial', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )},
                { key: 'stats', label: 'Stats', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                )},
                { key: 'alertas', label: 'Alertas', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )},
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition min-w-0 ${
                    activeTab === tab.key
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.key === 'alertas' && alertas.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full font-bold">
                      {alertas.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'info' && (
                <div className="space-y-5">
                  {/* Contact section */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Contacto
                    </h3>
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="text-sm text-gray-500">Teléfono</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <a href={formatearTelefonoParaLlamar(selectedCliente.telefono)} className="font-medium text-blue-600 hover:underline">
                            {formatearTelefonoParaInput(selectedCliente.telefono)}
                          </a>
                          <button
                            onClick={() => { navigator.clipboard.writeText(formatearTelefonoParaCopiar(selectedCliente.telefono)); toast.success('Teléfono copiado') }}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition"
                            aria-label="Copiar teléfono"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-sm text-gray-500">Zona</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{selectedCliente.barrio || '-'}</span>
                          {selectedCliente.linkUbicacion && (
                            <span className="text-blue-500 text-xs" title="Tiene ubicación en mapa">📍</span>
                          )}
                        </div>
                      </div>
                      {selectedCliente.linkUbicacion && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                              <circle cx="12" cy="9" r="2.5" />
                            </svg>
                            <span className="text-sm text-gray-500">Mapa</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={selectedCliente.linkUbicacion}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              Abrir en Maps
                            </a>
                            <button
                              onClick={() => { navigator.clipboard.writeText(selectedCliente.linkUbicacion || ''); toast.success('Link copiado') }}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition"
                              aria-label="Copiar link"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                            {/* Bloque 1: botón "Actualizar coordenadas" — recalcula
                                lat/lng desde linkUbicacion → GPS historial → Negocio. */}
                            <button
                              onClick={async () => {
                                if (!selectedCliente) return
                                const btn = document.getElementById('btn-geocode') as HTMLButtonElement | null
                                btn?.setAttribute('disabled', 'true')
                                try {
                                  const r = await fetch(`/api/clientes/${selectedCliente.id}/geocode`, { method: 'POST' })
                                  const data = await r.json()
                                  if (data.success) {
                                    if (data.coords) {
                                      toast.success(`Coordenadas actualizadas (${data.coords.origen})`)
                                      await fetchClientes()
                                    } else {
                                      toast.warning('No se pudieron obtener coords automáticamente')
                                    }
                                  } else {
                                    toast.error(data.error?.message || 'Error al geocodificar')
                                  }
                                } catch {
                                  toast.error('Error de red')
                                } finally {
                                  btn?.removeAttribute('disabled')
                                }
                              }}
                              id="btn-geocode"
                              className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition"
                              aria-label="Actualizar coordenadas desde link/GPS/negocio"
                              title="Recalcular lat/lng desde link / historial GPS / negocio"
                              data-testid="btn-geocode"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Bloque 1: mostrar coords si ya están calculadas */}
                      {(selectedCliente as any).lat != null && (selectedCliente as any).lng != null && (
                        <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 -mx-2 px-2 py-1 rounded" data-testid="coords-internas">
                          <span>Coords internas</span>
                          <span className="font-mono">
                            {(selectedCliente as any).lat}, {(selectedCliente as any).lng}
                            <span className="ml-1.5 px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] uppercase tracking-wide">
                              {(selectedCliente as any).geocodeOrigen || 'MANUAL'}
                            </span>
                          </span>
                        </div>
                      )}
                      {selectedCliente.direccion && (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            <span className="text-sm text-gray-500">Dirección</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-right max-w-[60%]">{selectedCliente.direccion}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(selectedCliente.direccion || ''); toast.success('Dirección copiada') }}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition shrink-0"
                              aria-label="Copiar dirección"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                      {selectedCliente.contactos && selectedCliente.contactos.length > 0 && (
                        <div className="pt-3 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Contactos adicionales</p>
                          <div className="space-y-2">
                            {(selectedCliente.contactos as any[]).map((contacto, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-2 bg-white rounded-lg p-2 border border-gray-100">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-700 truncate">{contacto.nombre}</p>
                                  {contacto.relacion && <p className="text-xs text-gray-400">{contacto.relacion}</p>}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <a
                                    href={formatearTelefonoParaLlamar(contacto.telefono)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
                                    aria-label={`Llamar a ${contacto.nombre}`}
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                  </a>
                                  <button
                                    onClick={() => { navigator.clipboard.writeText(formatearTelefonoParaCopiar(contacto.telefono)); toast.success('Teléfono copiado') }}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition"
                                    aria-label="Copiar teléfono"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </button>
                                  <span className="text-xs text-gray-500 font-mono ml-1">{formatearTelefonoParaInput(contacto.telefono)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Business section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Negocios
                      </h3>
                      <button
                        onClick={() => { setNegocioEditData(null); setNegocioFormOpen(true) }}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Agregar
                      </button>
                    </div>

                    {(negocios ?? []).length > 0 ? (
                      <div className="space-y-2.5">
                        {(negocios ?? []).map((neg) => {
                          const avatarColors = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500']
                          let hash = 0
                          for (let i = 0; i < neg.nombre.length; i++) hash = neg.nombre.charCodeAt(i) + ((hash << 5) - hash)
                          const avatarColor = avatarColors[Math.abs(hash) % avatarColors.length]
                          const initial = neg.nombre.charAt(0).toUpperCase()
                          const hasDetails = neg.tipoNegocio || neg.direccion || neg.barrio || neg.horaApertura || neg.ruta

                          return (
                            <div
                              key={neg.id}
                              className="bg-white rounded-xl border border-gray-200 p-3.5 transition hover:shadow-sm hover:border-gray-300 group cursor-pointer"
                              onClick={() => viewNegocio(neg)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  viewNegocio(neg)
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`Ver detalle de ${neg.nombre}`}
                            >
                              <div className="flex items-start gap-3">
                                {/* Avatar */}
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${avatarColor}`}>
                                  {initial}
                                </div>
                                <div className="flex-1 min-w-0">
                                  {/* Header: name + edit */}
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <h4 className="text-sm font-semibold text-gray-900 truncate">{neg.nombre}</h4>
                                      {neg.tipoNegocio && (
                                        <span className="inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                                          {neg.tipoNegocio}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setNegocioEditData({
                                          id: neg.id,
                                          nombre: neg.nombre,
                                          tipoNegocio: neg.tipoNegocio,
                                          direccion: neg.direccion,
                                          barrio: neg.barrio,
                                          referencia: neg.referencia || null,
                                          linkUbicacion: neg.linkUbicacion || null,
                                          horaApertura: neg.horaApertura || null,
                                          rutaId: neg.ruta?.id || null,
                                        })
                                        setNegocioFormOpen(true)
                                      }}
                                      className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition"
                                      title="Editar negocio"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                      </svg>
                                    </button>
                                  </div>

                                  {/* Detail rows */}
                                  {hasDetails && (
                                    <div className="mt-2 space-y-1">
                                      {neg.direccion && (
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                          </svg>
                                          <span className="truncate">{neg.direccion}</span>
                                        </div>
                                      )}
                                      {neg.barrio && !neg.direccion && (
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                          </svg>
                                          <span>{neg.barrio}</span>
                                        </div>
                                      )}
                                      {neg.horaApertura && (
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          <span>Abre a las {neg.horaApertura}</span>
                                        </div>
                                      )}
                                      {neg.ruta && (
                                        <div className="flex items-center gap-1.5 text-xs">
                                          <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                                          </svg>
                                          <span className="font-medium text-blue-600">{neg.ruta.nombre}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Footer: pedidos count */}
                                  {neg._count?.pedidos > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-100">
                                      <span className="text-[11px] text-gray-400">
                                        {neg._count.pedidos} pedido{neg._count.pedidos !== 1 ? 's' : ''}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : selectedCliente.nombreNegocio ? (
                      <div className="bg-gray-50 rounded-xl p-5 text-center border border-dashed border-gray-200">
                        <p className="text-sm font-medium text-gray-500">Los datos del negocio se gestionan en la pestaña Negocios.</p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-5 text-center border border-dashed border-gray-200">
                        <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <p className="text-sm font-medium text-gray-500">Sin negocios registrados</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Agrega un negocio para gestionar pedidos por separado
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Special prices section */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Precios Especiales
                    </h3>
                    {(() => {
                      const parsed = parsePreciosEspeciales(selectedCliente.preciosEspeciales)
                      const hasAny = Object.values(parsed.DOMICILIO).some(v => v !== undefined) || Object.values(parsed.PUNTO).some(v => v !== undefined)
                      if (!hasAny) return (
                        <div className="bg-gray-50 rounded-xl p-4 text-center">
                          <p className="text-sm text-gray-400">Sin precios especiales configurados</p>
                          <p className="text-xs text-gray-400 mt-1">Este cliente paga los precios de lista estándar</p>
                        </div>
                      )
                      return (
                        <div className="space-y-3">
                          {(['DOMICILIO', 'PUNTO'] as Canal[]).map((canal) => {
                            const items = Object.entries(parsed[canal]).filter(([_, v]) => v !== undefined)
                            if (items.length === 0) return null
                            return (
                              <div key={canal} className="bg-gray-50 rounded-xl p-4">
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{canal === 'DOMICILIO' ? 'A domicilio' : 'En punto'}</p>
                                <div className="flex flex-wrap gap-2">
                                  {items.map(([codigo, precio]) => {
                                    const info = PRODUCTOS_PRECIO.find(p => p.codigo === codigo)
                                    if (!info) return null
                                    const iconCfg = getProductoIconConfig(codigo)
                                    const Icon = iconCfg.Icon
                                    const precioEspecial = Number(precio)
                                    const precioBaseActual = preciosBase[canal]?.[codigo] || 0
                                    const desviacion = precioBaseActual > 0
                                      ? ((precioEspecial - precioBaseActual) / precioBaseActual) * 100
                                      : 0
                                    const mostrarDesviacion = Math.abs(desviacion) > 20
                                    return (
                                      <span
                                        key={codigo}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-sm shadow-sm"
                                      >
                                        <Icon size={16} />
                                        <span className="text-gray-600">{info.nombre}</span>
                                        <span className="font-semibold text-blue-700">{formatCurrency(precioEspecial)}</span>
                                        {mostrarDesviacion && (
                                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                            desviacion > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                          }`}>
                                            Base: {formatCurrency(precioBaseActual)} ({desviacion > 0 ? '+' : ''}{Math.round(desviacion)}%)
                                          </span>
                                        )}
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Notes */}
                  {selectedCliente.notas && (
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Notas
                      </h3>
                      <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedCliente.notas}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'historial' && <ClienteHistorial clienteId={selectedCliente.id} />}
              {activeTab === 'stats' && <ClienteStats clienteId={selectedCliente.id} />}

              {activeTab === 'alertas' && (
                <div key={alertasKey} className="space-y-3">
                  {alertas.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 font-medium">Sin alertas activas</p>
                      <p className="text-sm text-gray-400 mt-1">Este cliente no tiene comportamientos inusuales detectados.</p>
                    </div>
                  ) : (
                    alertas.map((alerta, idx) => (
                      <div key={`${alerta.tipo}-${idx}`} className="bg-white border rounded-xl p-4 hover:shadow-sm transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getBadgeColor(alerta.severidad)}`}>
                                {alerta.severidad === 'ALTA' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                                {alerta.severidad === 'MEDIA' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                {alerta.severidad === 'BAJA' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                {alerta.severidad}
                              </span>
                              <span className="text-sm font-semibold text-gray-800">{alerta.tipo.replace(/_/g, ' ')}</span>
                            </div>
                            <p className="text-sm text-gray-600">{alerta.detalle}</p>
                            <p className="text-xs text-gray-400 mt-1">{new Date(alerta.fecha).toLocaleDateString('es-CO')}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={() => { setGuiaTipo(alerta.tipo); setGuiaOpen(true) }}
                              className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition"
                            >
                              Ver guía
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch('/api/casos', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      alertaTipo: alerta.tipo,
                                      severidad: alerta.severidad,
                                      titulo: alerta.tipo.replace(/_/g, ' '),
                                      descripcion: alerta.detalle,
                                      clienteId: selectedCliente.id,
                                      pedidoId: alerta.pedidoId || null,
                                    }),
                                  })
                                  const data = await res.json()
                                  if (data.success) {
                                    setCasoCreado({
                                      ...data.caso,
                                      cliente: { id: selectedCliente.id, nombre: selectedCliente.nombre, telefono: selectedCliente.telefono },
                                      pedido: alerta.pedidoId ? { id: alerta.pedidoId, numero: 0, total: '0' } : null,
                                    })
                                  }
                                } catch {
                                  toast.error('Error creando caso')
                                }
                              }}
                              className="text-xs text-green-600 hover:bg-green-50 px-2 py-1 rounded transition"
                            >
                              Crear caso
                            </button>
                            {alerta.severidad !== 'ALTA' && (
                              <button
                                onClick={() => { ignorarAlerta(selectedCliente.id, alerta.tipo); toast.success('Alerta ignorada 24h'); setAlertasKey(k => k + 1) }}
                                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded transition"
                              >
                                Ignorar 24h
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              {puedeDesactivar && (
                <Tooltip content="Desactivar cliente (no se podrán crear pedidos)" position="top">
                  <button
                    onClick={() => handleDelete(selectedCliente.id)}
                    className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </button>
                </Tooltip>
              )}
            </div>
          </>
            )}
          </div>
        </>
      )}
      <GuiaAlertaModal
        tipo={guiaTipo}
        open={guiaOpen}
        onClose={() => setGuiaOpen(false)}
        contexto={selectedCliente ? { clienteId: selectedCliente.id } : undefined}
      />
      {casoCreado && (
        <CasoGuiaModal
          caso={casoCreado}
          contextData={{
            clienteVerificado: selectedCliente?.verificado,
            pedidoDisputa: selectedCliente?.pedidos?.some((p: any) => p.disputaAbierta),
            clienteConSaldo: selectedCliente?.pedidos?.some((p: any) => Number(p.saldo) > 0),
          }}
          usuarios={usuarios}
          onClose={() => setCasoCreado(null)}
        />
      )}
      {modal}

      {/* Negocio Form Modal */}
      {selectedCliente && (
        <NegocioForm
          key={negocioEditData?.id || 'new'}
          open={negocioFormOpen}
          onClose={() => { setNegocioFormOpen(false); setNegocioEditData(null) }}
          clienteId={selectedCliente.id}
          editData={negocioEditData}
          onSuccess={() => {
            // Refresh negocios list
            fetch(`/api/negocios?clienteId=${selectedCliente.id}`)
              .then(r => r.json())
              .then(d => { if (d.success) setNegocios(d.data) })
              .catch(() => {})
            toast.success(negocioEditData ? 'Negocio actualizado' : 'Negocio creado')
          }}
        />
      )}

      {/* Negocio Detail Modal */}
      {viewNegocioData && (
        <NegocioDetailModal
          key={viewNegocioData?.id || 'closed'}
          open={showNegocioDetail}
          onClose={closeNegocioDetail}
          negocio={viewNegocioData}
          canEdit={true}
          canDelete={puedeEliminarNegocio}
          clienteId={viewNegocioData.clienteId || selectedCliente?.id}
          onEdit={() => viewNegocioData && handleEditNegocioFromDetail(viewNegocioData)}
          onDeleted={handleNegocioDeleted}
        />
      )}
    </div>
  )
}
