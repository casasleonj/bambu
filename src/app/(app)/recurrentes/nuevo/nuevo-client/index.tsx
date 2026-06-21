'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { z } from 'zod'
import type { Cliente, NuevoRecurrenteForm, CanalRecurrente, TipoRecurrente } from './types'
import SectionCard from '../../_components/section-card'
import ChipGroup from '../../_components/chip-group'
import ProductStepper from '../../_components/product-stepper'
import { cn } from '@/lib/utils'

const NuevoRecurrenteSchema = z.object({
  clienteId: z.string().min(1, 'Selecciona un cliente'),
  cadaNDias: z.number().int().min(1, 'Mínimo 1 día'),
  canal: z.enum(['DOMICILIO', 'PUNTO']),
  tipo: z.enum(['ENVIO', 'PUNTO']),
  horaPreferida: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm').optional().or(z.literal('')),
  proxGeneracion: z.string().min(1, 'Selecciona una fecha'),
  pacaAgua: z.number().int().min(0),
  pacaHielo: z.number().int().min(0),
  botellon: z.number().int().min(0),
  bolsaAgua: z.number().int().min(0),
  bolsaHielo: z.number().int().min(0),
  notas: z.string().max(500).optional(),
}).refine((data) => data.pacaAgua + data.pacaHielo + data.botellon + data.bolsaAgua + data.bolsaHielo >= 3, {
  message: 'Mínimo 3 productos por entrega',
  path: ['productos'],
})

function formatDateInput(date: Date): string {
  return date.toLocaleDateString('en-CA')
}

function calcularProxGeneracionDefault(cadaNDias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + cadaNDias)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return formatDateInput(d)
}

interface ProductoConfig {
  codigo: string
  nombre: string
  aplicaDomicilio: boolean
  sobreCostoDomicilio: number
}

const PRODUCTOS_CONFIG_BASE = [
  { key: 'pacaAgua' as const, codigo: 'PACA_AGUA', label: 'Paca Agua', highlight: true, unit: 'und' },
  { key: 'pacaHielo' as const, codigo: 'PACA_HIELO', label: 'Paca Hielo', highlight: false, unit: 'und' },
  { key: 'botellon' as const, codigo: 'BOTELLON', label: 'Botellón 20LT', highlight: false, unit: 'und' },
  { key: 'bolsaAgua' as const, codigo: 'BOLSA_AGUA', label: 'Bolsa Agua', highlight: false, unit: 'und' },
  { key: 'bolsaHielo' as const, codigo: 'BOLSA_HIELO', label: 'Bolsa Hielo', highlight: false, unit: 'und' },
]

const TIPO_OPTIONS = [
  { value: 'ENVIO', label: 'Pedido remoto', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg> },
  { value: 'PUNTO', label: 'En mostrador', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
]

const CANAL_OPTIONS = [
  { value: 'DOMICILIO', label: 'Domicilio', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
  { value: 'PUNTO', label: 'Retira en local', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
]

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  PACA_AGUA: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  PACA_HIELO: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  BOTELLON: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
  BOLSA_AGUA: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  BOLSA_HIELO: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
}

export default function NuevoRecurrenteClient() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Cliente[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [hasPlantilla, setHasPlantilla] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const hoy = formatDateInput(new Date())

  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [cadaNDiasDisplay, setCadaNDiasDisplay] = useState("1")

  const [formData, setFormData] = useState<NuevoRecurrenteForm>({
    clienteId: '', cadaNDias: 1,
    canal: 'DOMICILIO', tipo: 'ENVIO',
    horaPreferida: '',
    proxGeneracion: hoy,
    pacaAgua: 0, pacaHielo: 0, botellon: 0, bolsaAgua: 0, bolsaHielo: 0,
    notas: '',
  })

  // Product configs from DB
  const [productConfigs, setProductConfigs] = useState<ProductoConfig[]>([])
  const [configsLoading, setConfigsLoading] = useState(true)

  // Real-time prices
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, { precio: number; aplicaDomicilio: boolean; sobreCosto: number }>>({})
  const [preciosLoading, setPreciosLoading] = useState(false)
  const resolverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalPacas = formData.pacaAgua + formData.pacaHielo + formData.botellon + formData.bolsaAgua + formData.bolsaHielo
  const productosError = fieldErrors.productos

  // Filter products by canal (memoized to avoid infinite loop)
  const productosVisibles = useMemo(() => PRODUCTOS_CONFIG_BASE.filter(prod => {
    if (formData.canal === 'PUNTO') return true
    const config = productConfigs.find(c => c.codigo === prod.codigo)
    return config ? config.aplicaDomicilio : true
  }), [formData.canal, productConfigs])

  useEffect(() => {
    fetch('/api/productos/configs')
      .then(r => r.json())
      .then(d => {
        if (d.success) setProductConfigs(d.productos || [])
      })
      .catch(() => {})
      .finally(() => setConfigsLoading(false))
  }, [])

  // Resolve prices when canal or quantities change
  useEffect(() => {
    if (configsLoading) return
    if (resolverTimeoutRef.current) clearTimeout(resolverTimeoutRef.current)

    const items = productosVisibles
      .filter(p => (formData[p.key] || 0) > 0)
      .map(p => ({ codigo: p.codigo, cantidad: formData[p.key] || 0 }))

    if (items.length === 0) {
      setPreciosResueltos(prev => Object.keys(prev).length > 0 ? {} : prev)
      return
    }

    resolverTimeoutRef.current = setTimeout(async () => {
      setPreciosLoading(true)
      try {
        const res = await fetch('/api/precios/resolver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, canal: formData.canal, clienteId: selectedCliente?.id || undefined }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.precios) {
            const nuevos: Record<string, { precio: number; aplicaDomicilio: boolean; sobreCosto: number }> = {}
            for (const [codigo, info] of Object.entries(data.precios)) {
              const config = productConfigs.find(c => c.codigo === codigo)
              nuevos[codigo] = {
                precio: (info as any).precio,
                aplicaDomicilio: config?.aplicaDomicilio ?? false,
                sobreCosto: config?.sobreCostoDomicilio ? Number(config.sobreCostoDomicilio) : 0,
              }
            }
            setPreciosResueltos(nuevos)
          }
        }
      } catch { /* fallback */ }
      finally { setPreciosLoading(false) }
    }, 300)

    return () => { if (resolverTimeoutRef.current) clearTimeout(resolverTimeoutRef.current) }
  }, [formData.canal, formData.pacaAgua, formData.pacaHielo, formData.botellon, formData.bolsaAgua, formData.bolsaHielo, selectedCliente?.id, configsLoading, productosVisibles])

  // Clear quantities for products not available in new canal
  useEffect(() => {
    const unavailable = PRODUCTOS_CONFIG_BASE.filter(prod => {
      if (formData.canal === 'PUNTO') return false
      const config = productConfigs.find(c => c.codigo === prod.codigo)
      return config && !config.aplicaDomicilio
    })
    if (unavailable.length > 0) {
      const updates: Partial<NuevoRecurrenteForm> = {}
      for (const prod of unavailable) {
        if (formData[prod.key] > 0) {
          updates[prod.key] = 0
        }
      }
      if (Object.keys(updates).length > 0) {
        setFormData(prev => ({ ...prev, ...updates }))
        toast.info(`${unavailable.length} producto(s) no disponible(s) para domicilio`)
      }
    }
  }, [formData.canal])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const searchClientes = useCallback(async (term: string) => {
    if (!term.trim()) {
      setSearchResults([])
      setDropdownOpen(false)
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setSearching(true)
    try {
      const res = await fetch(`/api/clientes?all=true&search=${encodeURIComponent(term)}`, { signal: ctrl.signal, credentials: 'include' })
      const data = await res.json()
      if (ctrl.signal.aborted) return
      setSearchResults(data.clientes || data.data || [])
      setDropdownOpen(true)
      setHighlightedIndex(-1)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Error buscando clientes')
    } finally {
      setSearching(false)
    }
  }, [])

  function handleSearchChange(value: string) {
    setSearchTerm(value)
    setHasPlantilla(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchClientes(value), 300)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!dropdownOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => Math.min(i + 1, searchResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && searchResults[highlightedIndex]) {
        selectCliente(searchResults[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false)
    }
  }

  async function selectCliente(cliente: Cliente) {
    setSelectedCliente(cliente)
    setFormData(prev => ({ ...prev, clienteId: cliente.id }))
    setSearchTerm('')
    setSearchResults([])
    setDropdownOpen(false)
    setHasPlantilla(false)
    setFieldErrors(prev => ({ ...prev, clienteId: '' }))

    try {
      const res = await fetch(`/api/clientes/${cliente.id}`)
      const data = await res.json()
      if (data.success && data.cliente?.plantillaRecurrente?.activo) {
        setHasPlantilla(true)
        toast.error(`Este cliente ya tiene una plantilla recurrente (cada ${data.cliente.plantillaRecurrente.cadaNDias} días)`)
      }
    } catch {
      // Silently fail precheck
    }
  }

  function clearCliente() {
    setSelectedCliente(null)
    setFormData(prev => ({ ...prev, clienteId: '' }))
    setHasPlantilla(false)
  }

  function updateCadaNDias(val: string) {
    setCadaNDiasDisplay(val)
    const parsed = parseInt(val)
    if (!isNaN(parsed) && parsed >= 1) {
      setFormData(prev => ({ ...prev, cadaNDias: parsed }))
      setFieldErrors(prev => ({ ...prev, cadaNDias: '' }))
    }
  }

  function blurCadaNDias() {
    const parsed = parseInt(cadaNDiasDisplay)
    const normalized = Math.max(1, parsed || 1)
    setCadaNDiasDisplay(String(normalized))
    setFormData(prev => ({ ...prev, cadaNDias: normalized }))
  }

  function updateField<K extends keyof NuevoRecurrenteForm>(key: K, value: NuevoRecurrenteForm[K]) {
    setFormData(prev => ({ ...prev, [key]: value }))
    setFieldErrors(prev => ({ ...prev, [key]: '' }))
  }

  function updateProducto(key: keyof NuevoRecurrenteForm, value: number) {
    setFormData(prev => ({ ...prev, [key]: Math.max(0, value) }))
    setFieldErrors(prev => ({ ...prev, productos: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})

    const parsed = NuevoRecurrenteSchema.safeParse(formData)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path[0] as string
        errors[path] = issue.message
      }
      setFieldErrors(errors)
      toast.error('Corrige los errores del formulario')
      return
    }

    if (hasPlantilla) {
      toast.error('Este cliente ya tiene una plantilla recurrente')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/recurrentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: formData.clienteId,
          cadaNDias: formData.cadaNDias,
          canal: formData.canal,
          tipo: formData.tipo,
          proxGeneracion: formData.proxGeneracion ? `${formData.proxGeneracion}T00:00:00.000Z` : undefined,
          horaPreferida: formData.horaPreferida || null,
          productos: {
            pacaAgua: formData.pacaAgua, pacaHielo: formData.pacaHielo,
            botellon: formData.botellon,
            bolsaAgua: formData.bolsaAgua, bolsaHielo: formData.bolsaHielo,
          },
          notas: formData.notas,
        }),
      })
      const data = await res.json()
      if (data.success) { toast.success('Plantilla recurrente creada'); router.push('/recurrentes') }
      else toast.error(data.error?.message || 'Error al crear')
    } catch { toast.error('Error de conexión') }
    finally { setSubmitting(false) }
  }

  function proxGeneracionEsDomingo(): boolean {
    if (!formData.proxGeneracion) return false
    const d = new Date(formData.proxGeneracion + 'T00:00:00')
    return d.getDay() === 0
  }

  function fixSundayDate(): string {
    if (!formData.proxGeneracion) return formData.proxGeneracion
    const d = new Date(formData.proxGeneracion + 'T00:00:00')
    if (d.getDay() === 0) d.setDate(d.getDate() + 1)
    return formatDateInput(d)
  }

  const hasErrors = Object.values(fieldErrors).some(e => e)
  const canSubmit = !submitting && !hasPlantilla && !hasErrors && totalPacas > 0 && selectedCliente !== null

  const inputBase = 'w-full px-3 py-2.5 border rounded-xl text-sm bg-white transition-all duration-150 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none'
  const inputError = 'border-red-300 focus:border-red-400 focus:ring-red-500/20'
  const inputNormal = 'border-gray-200 hover:border-gray-300'

  // Calculate total value from resolved prices
  const totalValor = Object.entries(formData).reduce((sum, [key, val]) => {
    if (key === 'pacaAgua' || key === 'pacaHielo' || key === 'botellon' || key === 'bolsaAgua' || key === 'bolsaHielo') {
      const prodConfig = PRODUCTOS_CONFIG_BASE.find(p => p.key === key)
      if (prodConfig && preciosResueltos[prodConfig.codigo]) {
        sum += (val as number) * preciosResueltos[prodConfig.codigo].precio
      }
    }
    return sum
  }, 0)

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => router.push('/recurrentes')} className="text-gray-400 hover:text-gray-600 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nueva Plantilla Recurrente</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* CLIENTE */}
        <SectionCard
          title="Cliente"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
          className="overflow-visible"
        >
          {selectedCliente ? (
            <div className="animate-fade-in-up">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                    {selectedCliente.nombre.charAt(0).toUpperCase()}
                  </div>
                    <div>
                      <p className="font-medium text-sm text-gray-800" data-testid="cliente-seleccionado-nombre">{selectedCliente.nombre}</p>
                      <p className="text-xs text-gray-500">{selectedCliente.telefono}{selectedCliente.barrio && ` · ${selectedCliente.barrio}`}</p>
                    </div>
                </div>
                <button type="button" onClick={clearCliente} aria-label="Cambiar cliente"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-100 transition">
                  Cambiar
                </button>
              </div>
              {hasPlantilla && (
                <div className="mt-2 flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-xl animate-shake">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  <p className="text-xs font-medium text-red-700">Este cliente ya tiene una plantilla recurrente activa</p>
                </div>
              )}
            </div>
          ) : (
            <div ref={dropdownRef} className="relative z-20">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  id="cliente-search"
                  type="text"
                  placeholder="Buscar por nombre, teléfono, dirección o barrio..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={cn(inputBase, fieldErrors.clienteId ? inputError : inputNormal, 'pl-10')}
                  aria-expanded={dropdownOpen}
                  aria-controls="cliente-results"
                  aria-autocomplete="list"
                  data-testid="cliente-search-input"
                />
                {searching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                  </span>
                )}
              </div>

              {searching && searchResults.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-lg overflow-hidden">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="px-3 py-2.5 flex items-center gap-3 border-b last:border-b-0">
                      <div className="w-6 h-6 rounded-full bg-gray-100 animate-pulse" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
                        <div className="h-2 w-20 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {dropdownOpen && !searching && (
                <div id="cliente-results" role="listbox" className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map((c, idx) => (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={idx === highlightedIndex}
                        onClick={() => selectCliente(c)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        data-testid="cliente-option"
                        data-cliente-id={c.id}
                        className={cn(
                          'w-full text-left px-3 py-2.5 flex items-center gap-3 border-b last:border-b-0 transition-colors',
                          idx === highlightedIndex ? 'bg-blue-50' : 'hover:bg-blue-50/50'
                        )}
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-semibold flex-shrink-0">
                          {c.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-gray-800 block truncate">{c.nombre}</span>
                          <span className="text-xs text-gray-400">{c.telefono}{c.barrio && ` · ${c.barrio}`}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-sm text-gray-400 text-center">Sin coincidencias</div>
                  )}
                </div>
              )}
              {fieldErrors.clienteId && <p className="text-xs text-red-600 mt-1.5 font-medium">{fieldErrors.clienteId}</p>}
            </div>
          )}
        </SectionCard>

        {/* PROGRAMACIÓN */}
        <SectionCard
          title="Programación"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="cada-n-dias" className="block text-sm font-medium text-gray-700 mb-1.5">Cada cuántos días <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input id="cada-n-dias" type="number" min={1} required
                    value={cadaNDiasDisplay}
                    onChange={(e) => updateCadaNDias(e.target.value)}
                    onBlur={blurCadaNDias}
                    className={cn(inputBase, fieldErrors.cadaNDias ? inputError : inputNormal)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">días</span>
                </div>
                {fieldErrors.cadaNDias && <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.cadaNDias}</p>}
                <p className="text-xs text-gray-400 mt-1">Siguiente: {calcularProxGeneracionDefault(formData.cadaNDias)}</p>
              </div>
              <div>
                <label htmlFor="prox-generacion" className="block text-sm font-medium text-gray-700 mb-1.5">Primera entrega <span className="text-red-500">*</span></label>
                <input id="prox-generacion" type="date"
                  min={hoy}
                  value={formData.proxGeneracion}
                  onChange={(e) => updateField('proxGeneracion', e.target.value)}
                  className={cn(inputBase, fieldErrors.proxGeneracion ? inputError : inputNormal)} />
                {fieldErrors.proxGeneracion && <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.proxGeneracion}</p>}
                {proxGeneracionEsDomingo() && (
                  <div className="flex items-center gap-2 mt-1.5 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                    <svg className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    <p className="text-xs text-orange-700">Cae en domingo</p>
                    <button type="button" onClick={() => updateField('proxGeneracion', fixSundayDate())} className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-auto">→ Lunes</button>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">Primera entrega programada. Luego se repite cada {formData.cadaNDias} días.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="hora-preferida" className="block text-sm font-medium text-gray-700 mb-1.5">Horario preferido</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <input id="hora-preferida" type="time"
                    value={formData.horaPreferida}
                    onChange={(e) => updateField('horaPreferida', e.target.value)}
                    className={cn(inputBase, fieldErrors.horaPreferida ? inputError : inputNormal, 'pl-10')} />
                </div>
                {fieldErrors.horaPreferida && <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.horaPreferida}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ChipGroup
                label="Origen del pedido"
                options={TIPO_OPTIONS}
                value={formData.tipo}
                onChange={(v: string) => updateField('tipo', v as TipoRecurrente)}
              />
              <ChipGroup
                label="Entrega"
                options={CANAL_OPTIONS}
                value={formData.canal}
                onChange={(v: string) => updateField('canal', v as CanalRecurrente)}
              />
            </div>
          </div>
        </SectionCard>

        {/* PRODUCTOS */}
        <SectionCard
          title="Productos por entrega"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
        >
          <div className="space-y-4">
            {configsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 p-3 animate-pulse">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-gray-100" />
                      <div className="h-4 w-20 bg-gray-100 rounded" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-9 h-9 rounded-lg bg-gray-100" />
                      <div className="flex-1 h-9 bg-gray-100 rounded" />
                      <div className="w-9 h-9 rounded-lg bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-children">
                {productosVisibles.map((prod) => {
                  const precioInfo = preciosResueltos[prod.codigo]
                  const precioUnitario = precioInfo?.precio || 0
                  const cantidad = formData[prod.key] || 0
                  const subtotal = cantidad * precioUnitario
                  const tieneRecargo = formData.canal === 'DOMICILIO' && precioInfo?.aplicaDomicilio && precioInfo.sobreCosto > 0

                  return (
                    <div key={prod.key}>
                      <ProductStepper
                        label={prod.label}
                        icon={PRODUCT_ICONS[prod.codigo]}
                        value={cantidad}
                        onChange={(v: number) => updateProducto(prod.key, v)}
                        highlight={prod.highlight}
                        unit={prod.unit}
                      />
                      {cantidad > 0 && precioUnitario > 0 && (
                        <div className="mt-1.5 px-2 py-1 bg-gray-50 rounded-lg text-xs flex justify-between items-center">
                          <span className="text-gray-500">
                            ${precioUnitario.toLocaleString()}{tieneRecargo && <span className="text-orange-500 ml-1">+domicilio</span>}
                          </span>
                          <span className="font-semibold text-gray-700">${subtotal.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Total with value */}
            <div className={cn(
              'flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200',
              totalPacas > 0 && totalPacas < 3
                ? 'bg-red-50 border-red-200'
                : 'bg-gray-50 border-gray-200'
            )}>
              <div className="flex items-center gap-2">
                <svg className={cn('w-4 h-4', totalPacas > 0 && totalPacas < 3 ? 'text-red-400' : 'text-gray-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span className={cn('text-sm font-semibold', totalPacas > 0 && totalPacas < 3 ? 'text-red-700' : 'text-gray-700')}>
                  Total: {totalPacas} {totalPacas === 1 ? 'paca' : 'pacas'}
                  {totalPacas > 0 && totalPacas < 3 && <span className="ml-1 text-xs font-normal">(mín. 3)</span>}
                </span>
              </div>
              {totalValor > 0 && (
                <span className="text-sm font-bold text-gray-900">${Math.round(totalValor).toLocaleString()}</span>
              )}
              {preciosLoading && (
                <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              )}
            </div>
            {productosError && (
              <p className="text-xs text-red-600 font-medium animate-shake">{productosError}</p>
            )}
          </div>
        </SectionCard>

        {/* NOTAS */}
        <SectionCard
          title="Observaciones"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
        >
          <textarea
            value={formData.notas}
            onChange={(e) => updateField('notas', e.target.value)}
            placeholder="Notas adicionales para el repartidor..."
            className={cn(inputBase, inputNormal, 'resize-y')}
            rows={3}
          />
        </SectionCard>

        {/* SUBMIT */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              'flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2',
              canSubmit
                ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {submitting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Crear Plantilla
              </>
            )}
          </button>
          <button type="button" onClick={() => router.push('/recurrentes')}
            className="px-4 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition text-sm font-medium">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
