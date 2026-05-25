'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatLocalDate } from '@/lib/utils'
import SectionCard from '../../_components/section-card'
import ChipGroup from '../../_components/chip-group'
import ProductStepper from '../../_components/product-stepper'
import { cn } from '@/lib/utils'

interface PlantillaSerialized {
  id: string
  clienteId: string
  activo: boolean
  cadaNDias: number
  tipo: string
  canal: string
  horaPreferida: string | null
  productos: Record<string, number>
  ultimaGeneracion: string | null
  proxGeneracion: string | null
  saltos: string[]
  notas: string | null
  cliente: {
    id: string
    nombre: string
    telefono: string
    barrio: string | null
    direccion: string | null
  }
}

type FormCanal = 'DOMICILIO' | 'PUNTO'
type FormTipo = 'ENVIO' | 'PUNTO'

interface ProductoConfig {
  codigo: string
  nombre: string
  aplicaDomicilio: boolean
  sobreCostoDomicilio: number
}

const TIPO_OPTIONS = [
  { value: 'ENVIO', label: 'Pedido remoto', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg> },
  { value: 'PUNTO', label: 'En mostrador', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
]

const CANAL_OPTIONS = [
  { value: 'DOMICILIO', label: 'Domicilio', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
  { value: 'PUNTO', label: 'Retira en local', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
]

const PRODUCTOS_CONFIG_BASE = [
  { key: 'pacaAgua' as const, codigo: 'PACA_AGUA', label: 'Paca Agua', highlight: true, unit: 'und' },
  { key: 'pacaHielo' as const, codigo: 'PACA_HIELO', label: 'Paca Hielo', highlight: false, unit: 'und' },
  { key: 'botellon' as const, codigo: 'BOTELLON', label: 'Botellón 20LT', highlight: false, unit: 'und' },
  { key: 'bolsaAgua' as const, codigo: 'BOLSA_AGUA', label: 'Bolsa Agua', highlight: false, unit: 'und' },
  { key: 'bolsaHielo' as const, codigo: 'BOLSA_HIELO', label: 'Bolsa Hielo', highlight: false, unit: 'und' },
]

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  PACA_AGUA: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  PACA_HIELO: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  BOTELLON: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
  BOLSA_AGUA: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  BOLSA_HIELO: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
}

export function EditarRecurrenteClient({ plantilla }: { plantilla: PlantillaSerialized }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [productosError, setProductosError] = useState('')

  const [cadaNDias, setCadaNDias] = useState(plantilla.cadaNDias)
  const [cadaNDiasDisplay, setCadaNDiasDisplay] = useState(String(plantilla.cadaNDias))
  const [tipo, setTipo] = useState<FormTipo>(plantilla.tipo as FormTipo)
  const [canal, setCanal] = useState<FormCanal>(plantilla.canal as FormCanal)
  const [horaPreferida, setHoraPreferida] = useState(plantilla.horaPreferida || '')
  const [activo, setActivo] = useState(plantilla.activo)

  const [cantidades, setCantidades] = useState({
    pacaAgua: plantilla.productos.PACA_AGUA || 0,
    pacaHielo: plantilla.productos.PACA_HIELO || 0,
    botellon: plantilla.productos.BOTELLON || 0,
    bolsaAgua: plantilla.productos.BOLSA_AGUA || 0,
    bolsaHielo: plantilla.productos.BOLSA_HIELO || 0,
  })

  const [notas, setNotas] = useState(plantilla.notas || '')

  // Product configs from DB
  const [productConfigs, setProductConfigs] = useState<ProductoConfig[]>([])
  const [configsLoading, setConfigsLoading] = useState(true)

  // Real-time prices
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, { precio: number; aplicaDomicilio: boolean; sobreCosto: number }>>({})
  const [preciosLoading, setPreciosLoading] = useState(false)
  const resolverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalPacas = Object.values(cantidades).reduce((a, b) => a + b, 0)

  // Filter products by canal (memoized to avoid infinite loop)
  const productosVisibles = useMemo(() => PRODUCTOS_CONFIG_BASE.filter(prod => {
    if (canal === 'PUNTO') return true
    const config = productConfigs.find(c => c.codigo === prod.codigo)
    return config ? config.aplicaDomicilio : true
  }), [canal, productConfigs])

  useEffect(() => {
    fetch('/api/productos/configs')
      .then(r => r.json())
      .then(d => {
        if (d.success) setProductConfigs(d.productos || [])
      })
      .catch(() => {})
      .finally(() => setConfigsLoading(false))
  }, [])

  // Resolve prices
  useEffect(() => {
    if (configsLoading) return
    if (resolverTimeoutRef.current) clearTimeout(resolverTimeoutRef.current)

    const items = productosVisibles
      .filter(p => (cantidades[p.key] || 0) > 0)
      .map(p => ({ codigo: p.codigo, cantidad: cantidades[p.key] || 0 }))

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
          body: JSON.stringify({ items, canal, clienteId: plantilla.clienteId }),
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
  }, [canal, cantidades, configsLoading, productosVisibles, plantilla.clienteId])

  // Clear quantities for products not available in new canal
  useEffect(() => {
    const unavailable = PRODUCTOS_CONFIG_BASE.filter(prod => {
      if (canal === 'PUNTO') return false
      const config = productConfigs.find(c => c.codigo === prod.codigo)
      return config && !config.aplicaDomicilio
    })
    if (unavailable.length > 0) {
      const updates: Record<string, number> = {}
      for (const prod of unavailable) {
        if (cantidades[prod.key] > 0) {
          updates[prod.key] = 0
        }
      }
      if (Object.keys(updates).length > 0) {
        setCantidades(prev => ({ ...prev, ...updates }))
        toast.info(`${unavailable.length} producto(s) no disponible(s) para domicilio`)
      }
    }
  }, [canal])

  const updateCantidad = (key: keyof typeof cantidades, value: number) => {
    setCantidades(prev => ({ ...prev, [key]: Math.max(0, value) }))
    setProductosError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (totalPacas < 3) {
      setProductosError('Mínimo 3 productos por entrega')
      toast.error('Mínimo 3 productos por entrega')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/recurrentes?id=${plantilla.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cadaNDias,
          tipo,
          canal,
          horaPreferida: horaPreferida || null,
          productos: { pacaAgua: cantidades.pacaAgua, pacaHielo: cantidades.pacaHielo, botellon: cantidades.botellon, bolsaAgua: cantidades.bolsaAgua, bolsaHielo: cantidades.bolsaHielo },
          notas: notas || null,
          activo,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Plantilla actualizada')
        router.push('/recurrentes')
      } else {
        toast.error(data.error?.message || 'Error al actualizar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  const inputBase = 'w-full px-3 py-2.5 border rounded-xl text-sm bg-white transition-all duration-150 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none'
  const inputNormal = 'border-gray-200 hover:border-gray-300'

  const canSubmit = !submitting && totalPacas > 0

  // Calculate total value
  const totalValor = Object.entries(cantidades).reduce((sum, [key, val]) => {
    const prodConfig = PRODUCTOS_CONFIG_BASE.find(p => p.key === key)
    if (prodConfig && preciosResueltos[prodConfig.codigo]) {
      sum += val * preciosResueltos[prodConfig.codigo].precio
    }
    return sum
  }, 0)

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/recurrentes" className="text-gray-400 hover:text-gray-600 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Editar Plantilla Recurrente</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* CLIENTE — read-only */}
        <SectionCard
          title="Cliente"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
        >
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                {plantilla.cliente.nombre.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-sm text-gray-800">{plantilla.cliente.nombre}</p>
                <p className="text-xs text-gray-500">{plantilla.cliente.telefono}{plantilla.cliente.barrio && ` · ${plantilla.cliente.barrio}`}</p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-0.5">
              {plantilla.ultimaGeneracion && <p>Última: {formatLocalDate(plantilla.ultimaGeneracion)}</p>}
              {plantilla.proxGeneracion && <p>Próxima: {formatLocalDate(plantilla.proxGeneracion)}</p>}
            </div>
          </div>
        </SectionCard>

        {/* PROGRAMACIÓN */}
        <SectionCard
          title="Programación"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cada cuántos días <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input type="number" min={1} required value={cadaNDiasDisplay}
                    onChange={(e) => {
                      setCadaNDiasDisplay(e.target.value)
                      const parsed = parseInt(e.target.value)
                      if (!isNaN(parsed) && parsed >= 1) {
                        setCadaNDias(parsed)
                      }
                    }}
                    onBlur={() => {
                      const parsed = parseInt(cadaNDiasDisplay)
                      const normalized = Math.max(1, parsed || 1)
                      setCadaNDiasDisplay(String(normalized))
                      setCadaNDias(normalized)
                    }}
                    className={cn(inputBase, inputNormal)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">días</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Horario preferido</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <input type="time" value={horaPreferida}
                    onChange={(e) => setHoraPreferida(e.target.value)}
                    className={cn(inputBase, inputNormal, 'pl-10')} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ChipGroup
                label="Origen del pedido"
                options={TIPO_OPTIONS}
                value={tipo}
                onChange={(v: string) => setTipo(v as FormTipo)}
              />
              <ChipGroup
                label="Entrega"
                options={CANAL_OPTIONS}
                value={canal}
                onChange={(v: string) => setCanal(v as FormCanal)}
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
                  const cantidad = cantidades[prod.key] || 0
                  const subtotal = cantidad * precioUnitario
                  const tieneRecargo = canal === 'DOMICILIO' && precioInfo?.aplicaDomicilio && precioInfo.sobreCosto > 0

                  return (
                    <div key={prod.key}>
                      <ProductStepper
                        label={prod.label}
                        icon={PRODUCT_ICONS[prod.codigo]}
                        value={cantidad}
                        onChange={(v: number) => updateCantidad(prod.key, v)}
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
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas adicionales para el repartidor..."
            className={cn(inputBase, inputNormal, 'resize-y')}
            rows={3}
          />
        </SectionCard>

        {/* ESTADO */}
        {plantilla.saltos && plantilla.saltos.length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              <p className="text-sm font-medium text-yellow-700">Saltos programados: {plantilla.saltos.length}</p>
            </div>
            <p className="text-xs text-yellow-600 ml-6">{plantilla.saltos.join(', ')}</p>
          </div>
        )}

        <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div className="relative">
              <input type="checkbox" checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="sr-only peer" />
              <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-600 transition-colors" />
              <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm font-medium text-gray-700">Plantilla activa</span>
          </label>
        </div>

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
                Guardando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Guardar cambios
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
