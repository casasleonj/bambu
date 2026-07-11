import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import { PESOS_KG, calcularPesoDesdeCarga, getCapacidadInfo, type CargaSnapshot } from '@/lib/embarque-capacidad'
import { useProductosDomicilio, getProductoEmoji } from '@/hooks/use-productos-domicilio'
import type { Trabajador, Ruta, EmbarqueEditable } from './types'

interface StockDisponible {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
}

interface EmbarqueFormModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  trabajadores: Trabajador[]
  rutas: Ruta[]
  mode: 'create' | 'edit'
  embarque?: EmbarqueEditable | null
}

export function EmbarqueFormModal({
  open,
  onClose,
  onSaved,
  trabajadores,
  rutas,
  mode,
  embarque,
}: EmbarqueFormModalProps) {
  const isEdit = mode === 'edit'
  const [selectedTrabajadorId, setSelectedTrabajadorId] = useState('')
  const [selectedRutaId, setSelectedRutaId] = useState('')
  const [tipoMoto, setTipoMoto] = useState('')
  const [obs, setObs] = useState('')
  const [baseDinero, setBaseDinero] = useState(0)
  const [horaSalida, setHoraSalida] = useState('')
  const [carga, setCarga] = useState<Record<string, number>>({
    PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0,
  })
  const [stockDisponible, setStockDisponible] = useState<StockDisponible | null>(null)
  const [tieneStockEstimado, setTieneStockEstimado] = useState(false)
  const [confirmOverride, setConfirmOverride] = useState(false)
  const [overrideMotivo, setOverrideMotivo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { productos: productosDomicilio, loading: loadingProductos } = useProductosDomicilio()

  // Initialize form on open
  useEffect(() => {
    if (open) {
      if (isEdit && embarque) {
        setSelectedTrabajadorId(embarque.trabajador.id)
        setSelectedRutaId(embarque.ruta?.id || '')
        setTipoMoto(embarque.tipoMoto || '')
        setObs(embarque.obs || '')
        setBaseDinero(Number(embarque.baseDinero) || 0)
        if (embarque.horaSalida) {
          const d = new Date(embarque.horaSalida)
          const hours = d.getHours().toString().padStart(2, '0')
          const minutes = d.getMinutes().toString().padStart(2, '0')
          setHoraSalida(`${hours}:${minutes}`)
        } else {
          setHoraSalida('')
        }
        // Load carga from productos
        const cargaInit: Record<string, number> = { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }
        for (const prod of (embarque.productos || [])) {
          cargaInit[prod.producto] = prod.cargadas
        }
        // Fallback to legacy fields if no productos
        if (embarque.productos?.length === 0) {
          cargaInit.PACA_AGUA = (embarque as any).pacasAgua || 0
          cargaInit.PACA_HIELO = (embarque as any).pacasHielo || 0
        }
        setCarga(cargaInit)
      } else {
        const now = new Date()
        const hours = now.getHours().toString().padStart(2, '0')
        const minutes = now.getMinutes().toString().padStart(2, '0')
        setHoraSalida(`${hours}:${minutes}`)
        setSelectedTrabajadorId('')
        setSelectedRutaId('')
        setTipoMoto('')
        setObs('')
        setBaseDinero(0)
        setCarga({ PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
      }
      setConfirmOverride(false)
      setOverrideMotivo('')

      fetch('/api/embarques?all=true&stock=true', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data.stock) setStockDisponible(data.stock)
          if (data.tieneStockEstimado) setTieneStockEstimado(data.tieneStockEstimado)
        })
        .catch(() => {})
    }
  }, [open, isEdit, embarque])

  const PRODUCTOS = productosDomicilio.map(p => ({
    key: p.codigo,
    label: p.nombre,
    emoji: getProductoEmoji(p.codigo),
  }))

  const selectedTrabajador = trabajadores.find(t => t.id === selectedTrabajadorId)
  const capacidadKg = selectedTrabajador?.capacidadKg || 500

  const cargaSnapshot: CargaSnapshot = {
    PACA_AGUA: carga.PACA_AGUA || 0,
    PACA_HIELO: carga.PACA_HIELO || 0,
    BOTELLON: carga.BOTELLON || 0,
    BOLSA_AGUA: carga.BOLSA_AGUA || 0,
    BOLSA_HIELO: carga.BOLSA_HIELO || 0,
  }
  const pesoKg = calcularPesoDesdeCarga(cargaSnapshot)
  const totalUnidades = Object.values(carga).reduce((s, v) => s + v, 0)
  const capacidadInfo = getCapacidadInfo(totalUnidades, pesoKg, capacidadKg)

  const MAX_UNIDADES = 70
  const excedeUnidades = totalUnidades > MAX_UNIDADES

  const hayStockInsuficiente = stockDisponible
    ? Object.entries(carga).some(([key, val]) => val > (stockDisponible as unknown as Record<string, number>)[key])
    : false

  const stockStatus = stockDisponible ? (() => {
    const sd = stockDisponible as unknown as Record<string, number>
    const totalDisponible = (sd.PACA_AGUA || 0) + (sd.PACA_HIELO || 0) + (sd.BOTELLON || 0)
    const totalCargado = (carga.PACA_AGUA || 0) + (carga.PACA_HIELO || 0) + (carga.BOTELLON || 0)

    if (totalDisponible === 0) return { nivel: 'sin-stock' as const, label: 'Sin stock registrado', color: 'text-gray-500' }
    if (totalCargado === 0) return { nivel: 'ideal' as const, label: 'Sin carga', color: 'text-gray-500' }

    const pct = (totalCargado / totalDisponible) * 100
    if (pct <= 80) return { nivel: 'suficiente' as const, label: 'Stock suficiente', color: 'text-green-600' }
    if (pct <= 100) return { nivel: 'ajustado' as const, label: 'Stock ajustado', color: 'text-yellow-600' }
    return { nivel: 'insuficiente' as const, label: 'Stock insuficiente', color: 'text-red-600' }
  })() : null

  const productosConDeficit = stockDisponible
    ? PRODUCTOS.filter(({ key }) => {
        const val = carga[key] || 0
        const max = (stockDisponible as unknown as Record<string, number>)[key] || 0
        return val > max && max > 0
      })
    : []

  const requiereMotivo = productosConDeficit.some(({ key }) => {
    const val = carga[key] || 0
    const max = (stockDisponible as unknown as Record<string, number>)[key] || 0
    return val - max > 10
  })

  async function handleSubmit() {
    if (!selectedTrabajadorId || submitting) return
    if (!horaSalida) {
      toast.error('Hora de salida requerida')
      return
    }
    const cargaArr = Object.entries(carga)
      .filter(([, v]) => v > 0)
      .map(([producto, cargadas]) => ({ producto, cargadas }))
    if (cargaArr.length === 0) {
      toast.error('Agrega al menos un producto a la carga')
      return
    }
    if (baseDinero === 0) {
      toast.warning('Base dinero: $0 — ¿Seguro que no necesita cambio?')
    }
    setSubmitting(true)
    try {
      const url = isEdit ? `/api/embarques/${embarque!.id}` : '/api/embarques'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trabajadorId: selectedTrabajadorId,
          rutaId: selectedRutaId || undefined,
          tipoMoto: tipoMoto || undefined,
          horaSalida,
          baseDinero,
          obs,
          carga: cargaArr,
          overrideMotivo: overrideMotivo || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        resetForm()
        onClose()
        onSaved()
        toast.success(isEdit ? 'Embarque actualizado' : 'Embarque creado')
      } else {
        toast.error(data.error?.message || (isEdit ? 'Error actualizando embarque' : 'Error creando embarque'))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : (isEdit ? 'Error actualizando embarque' : 'Error creando embarque')
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setSelectedTrabajadorId('')
    setSelectedRutaId('')
    setTipoMoto('')
    setObs('')
    setBaseDinero(0)
    setHoraSalida('')
    setCarga({ PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    setConfirmOverride(false)
    setOverrideMotivo('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">{isEdit ? 'Editar Embarque' : 'Nuevo Embarque'}</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Repartidor</label>
          <select
            value={selectedTrabajadorId}
            onChange={(e) => {
              setSelectedTrabajadorId(e.target.value)
              const repartidorRuta = rutas.find(r => r.repartidorId === e.target.value)
              if (repartidorRuta) setSelectedRutaId(repartidorRuta.id)
            }}
            className="w-full p-2 border rounded-lg"
          >
            <option value="">Seleccionar...</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>

        {selectedTrabajador && (
          <p className="text-xs text-gray-500">Capacidad: {capacidadKg}kg</p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ruta (opcional)</label>
          <select
            value={selectedRutaId}
            onChange={(e) => setSelectedRutaId(e.target.value)}
            className="w-full p-2 border rounded-lg"
          >
            <option value="">Sin ruta</option>
            {rutas.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de moto (opcional)</label>
          <input
            type="text"
            value={tipoMoto}
            onChange={(e) => setTipoMoto(e.target.value)}
            placeholder="Ej: Moto carro grande"
            className="w-full p-2 border rounded-lg"
          />
        </div>

        {loadingProductos && (
          <p className="text-xs text-gray-400">Cargando productos...</p>
        )}

        {stockDisponible && !loadingProductos && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-blue-800">📦 Stock disponible hoy</h3>
              {stockStatus && (
                <span className={`text-xs font-medium ${stockStatus.color}`}>
                  {stockStatus.label}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {PRODUCTOS.map(({ key, label, emoji }) => (
                <span key={key} className="text-blue-700">
                  {emoji} {label}: {(stockDisponible as unknown as Record<string, number>)[key] || 0}
                </span>
              ))}
            </div>
          </div>
        )}

        {tieneStockEstimado && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Stock estimado activo</p>
                <p className="text-xs text-amber-700">
                  Se está usando stock estimado porque el stock registrado es bajo.
                  Registre producción real al final del turno para comisiones correctas.
                </p>
              </div>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Carga del Motocarga</h3>
          <div className="space-y-2">
            {PRODUCTOS.map(({ key, label, emoji }) => {
              const peso = (carga[key] || 0) * PESOS_KG[key as keyof typeof PESOS_KG]
              const stockMax = stockDisponible ? (stockDisponible as unknown as Record<string, number>)[key] : null
              const excedeStock = stockMax !== null && (carga[key] || 0) > stockMax
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-sm w-32">{emoji} {label}</span>
                  <input
                    type="number"
                    min={0}
                    value={carga[key] || 0}
                    onChange={(e) => setCarga(prev => ({ ...prev, [key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                    onFocus={(e) => e.target.select()}
                    className={`w-20 p-1 border rounded text-center ${excedeStock ? 'border-red-400 bg-red-50' : ''}`}
                  />
                  <span className="text-xs text-gray-500 w-16">{peso.toFixed(1)}kg</span>
                  {excedeStock && (
                    <span className="text-xs text-red-600">⚠️ Stock: {stockMax}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {totalUnidades > 0 && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${capacidadInfo.color}`}>
            <span className="text-lg">{capacidadInfo.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {capacidadInfo.label}: {pesoKg.toFixed(1)}kg / {capacidadKg}kg ({capacidadInfo.porcentaje.toFixed(0)}%)
              </p>
              <p className="text-xs">{totalUnidades} unidades</p>
            </div>
          </div>
        )}

        {!tieneStockEstimado && hayStockInsuficiente && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <h3 className="text-sm font-semibold text-red-800">Stock insuficiente</h3>
            </div>
            <div className="space-y-1 text-xs text-red-700">
              {productosConDeficit.map(({ key, label, emoji }) => {
                const val = carga[key] || 0
                const max = (stockDisponible as unknown as Record<string, number>)[key] || 0
                return (
                  <p key={key}>
                    {emoji} {label}: Stock {max} → Pedís {val} (faltan {val - max})
                  </p>
                )
              })}
            </div>
            <p className="text-xs text-red-600">
              Stock comprometido hoy: {totalUnidades} unidades
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmOverride}
                onChange={(e) => setConfirmOverride(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-red-800">
                Confirmo que hay stock físico en zona de embarque
              </span>
            </label>
            {requiereMotivo && (
              <div>
                <label className="text-xs text-red-700 font-medium">
                  Motivo (déficit &gt; 10 unidades):
                </label>
                <textarea
                  value={overrideMotivo}
                  onChange={(e) => setOverrideMotivo(e.target.value)}
                  placeholder="Ej: Producción entregó 15 pacas extras esta mañana"
                  className="w-full mt-1 px-2 py-1 border border-red-300 rounded text-sm"
                  rows={2}
                />
              </div>
            )}
          </div>
        )}
        {excedeUnidades && (
          <p className="text-xs text-red-600 font-medium">⛔ Máximo {MAX_UNIDADES} unidades ({totalUnidades})</p>
        )}
        {capacidadInfo.nivel === 'excedido' && !excedeUnidades && (
          <p className="text-xs text-yellow-600">⚠️ Excede peso recomendado ({capacidadKg}kg) — proceder con precaución</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora de salida *</label>
            <input
              type="time"
              value={horaSalida}
              onChange={(e) => setHoraSalida(e.target.value)}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base dinero (cambio)</label>
            <input
              type="number"
              min={0}
              value={baseDinero}
              onChange={(e) => setBaseDinero(parseInt(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              className="w-full p-2 border rounded-lg"
              placeholder="$0"
            />
            {baseDinero === 0 && (
              <p className="text-xs text-amber-600 mt-1">️ Sin base de dinero</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="w-full p-2 border rounded-lg"
            rows={2}
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={handleClose} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button
          onClick={handleSubmit}
          disabled={!selectedTrabajadorId || submitting || excedeUnidades || (!tieneStockEstimado && hayStockInsuficiente && !confirmOverride)}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (isEdit ? 'Actualizando...' : 'Creando...') : (isEdit ? 'Guardar Cambios' : 'Crear')}
        </button>
      </div>
    </Modal>
  )
}
