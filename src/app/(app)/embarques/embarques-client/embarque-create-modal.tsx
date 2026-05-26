import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import { PESOS_KG, calcularPesoDesdeCarga, getCapacidadInfo, type CargaSnapshot } from '@/lib/embarque-capacidad'
import { useProductosDomicilio, getProductoEmoji } from '@/hooks/use-productos-domicilio'
import type { Trabajador, Ruta } from './types'

interface StockDisponible {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
}

export function EmbarqueCreateModal({
  open,
  onClose,
  onCreated,
  trabajadores,
  rutas,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  trabajadores: Trabajador[]
  rutas: Ruta[]
}) {
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
  const [submitting, setSubmitting] = useState(false)
  const { productos: productosDomicilio, loading: loadingProductos } = useProductosDomicilio()

  useEffect(() => {
    if (open) {
      fetch('/api/embarques?all=true&stock=true', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data.stock) setStockDisponible(data.stock)
        })
        .catch(() => {})
    }
  }, [open])

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

  async function createEmbarque() {
    if (!selectedTrabajadorId || submitting) return
    const cargaArr = Object.entries(carga)
      .filter(([, v]) => v > 0)
      .map(([producto, cargadas]) => ({ producto, cargadas }))
    if (cargaArr.length === 0) {
      toast.error('Agrega al menos un producto a la carga')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/embarques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trabajadorId: selectedTrabajadorId,
          rutaId: selectedRutaId || undefined,
          tipoMoto: tipoMoto || undefined,
          horaSalida: horaSalida || undefined,
          baseDinero,
          obs,
          carga: cargaArr,
        }),
      })
      const data = await res.json()
      if (data.success) {
        resetForm()
        onClose()
        onCreated()
        toast.success('Embarque creado')
      } else {
        toast.error(data.error?.message || 'Error creando embarque')
      }
    } catch {
      toast.error('Error creando embarque')
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
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">Nuevo Embarque</h2>
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
            <h3 className="text-sm font-semibold text-blue-800 mb-2">📦 Stock disponible hoy</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {PRODUCTOS.map(({ key, label, emoji }) => (
                <span key={key} className="text-blue-700">
                  {emoji} {label}: {(stockDisponible as unknown as Record<string, number>)[key] || 0}
                </span>
              ))}
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

        {hayStockInsuficiente && (
          <p className="text-xs text-red-600">⚠️ No hay suficiente stock para algunos productos</p>
        )}
        {excedeUnidades && (
          <p className="text-xs text-red-600 font-medium">⛔ Máximo {MAX_UNIDADES} unidades ({totalUnidades})</p>
        )}
        {capacidadInfo.nivel === 'excedido' && !excedeUnidades && (
          <p className="text-xs text-yellow-600">⚠️ Excede peso recomendado ({capacidadKg}kg) — proceder con precaución</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora de salida</label>
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
              className="w-full p-2 border rounded-lg"
              placeholder="$0"
            />
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
          onClick={createEmbarque}
          disabled={!selectedTrabajadorId || submitting || excedeUnidades}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creando...' : 'Crear'}
        </button>
      </div>
    </Modal>
  )
}
