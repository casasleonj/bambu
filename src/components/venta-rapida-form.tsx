'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEFAULT_PRICES } from '@/lib/prices'

interface VentaRapidaFormProps {
  precios: Record<string, number>
  onSubmit: (data: VentaRapidaData) => void | Promise<void>
}

interface VentaRapidaData {
  clienteId?: string
  clienteNuevo?: { nombre: string; telefono: string; direccion: string; barrio?: string }
  nombreMostrador?: string
  tipo: 'MOSTRADOR' | 'ENVIO'
  canal: 'PUNTO'
  ventaRapida: true
  productos: {
    pacaAgua: number
    pacaHielo: number
    botellonFab: number
    botellonDom: number
    bolsaAgua: number
    bolsaHielo: number
  }
  pagos: { metodo: string; monto: number }[]
  obs: string
  total: number
}

const PRODUCTOS = [
  { id: 'pacaAgua', nombre: 'Paca Agua', codigo: 'PACA_AGUA' },
  { id: 'pacaHielo', nombre: 'Paca Hielo', codigo: 'PACA_HIELO' },
  { id: 'botellonFab', nombre: 'Botellón Fábrica', codigo: 'BOTELLON_FAB' },
  { id: 'botellonDom', nombre: 'Botellón Domicilio', codigo: 'BOTELLON_DOM' },
  { id: 'bolsaAgua', nombre: 'Bolsa Agua', codigo: 'BOLSA_AGUA' },
  { id: 'bolsaHielo', nombre: 'Bolsa Hielo', codigo: 'BOLSA_HIELO' },
]



const METODOS_PAGO = [
  { id: 'EFECTIVO', nombre: 'Efectivo' },
  { id: 'TRANSFERENCIA', nombre: 'Transferencia' },
  { id: 'NEQUI', nombre: 'Nequi' },
  { id: 'DAVIPLATA', nombre: 'Daviplata' },
]

export function VentaRapidaForm({ precios, onSubmit }: VentaRapidaFormProps) {
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [nombreOpcional, setNombreOpcional] = useState('')
  const [quiereEnvio, setQuiereEnvio] = useState(false)
  const [envioData, setEnvioData] = useState({ nombre: '', telefono: '', direccion: '', barrio: '' })
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [submitting, setSubmitting] = useState(false)

  const getPrecio = (codigo: string) => precios[codigo] || DEFAULT_PRICES[codigo] || 0

  const total = PRODUCTOS.reduce((sum, prod) => {
    const cant = cantidades[prod.id] || 0
    return sum + cant * getPrecio(prod.codigo)
  }, 0)

  const increment = (id: string) => {
    setCantidades(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))
  }

  const decrement = (id: string) => {
    setCantidades(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) - 1) }))
  }

  const handleSubmit = async () => {
    if (total <= 0) {
      toast.error('Agrega al menos un producto')
      return
    }

    if (quiereEnvio && (!envioData.nombre || !envioData.telefono || !envioData.direccion)) {
      toast.error('Completa los datos de envío')
      return
    }

    setSubmitting(true)

    const data: VentaRapidaData = {
      tipo: quiereEnvio ? 'ENVIO' : 'MOSTRADOR',
      canal: 'PUNTO',
      ventaRapida: true,
      productos: {
        pacaAgua: cantidades.pacaAgua || 0,
        pacaHielo: cantidades.pacaHielo || 0,
        botellonFab: cantidades.botellonFab || 0,
        botellonDom: cantidades.botellonDom || 0,
        bolsaAgua: cantidades.bolsaAgua || 0,
        bolsaHielo: cantidades.bolsaHielo || 0,
      },
      pagos: [{ metodo: metodoPago, monto: total }],
      obs: nombreOpcional ? `Cliente: ${nombreOpcional}` : '',
      total,
    }

    if (quiereEnvio) {
      data.clienteNuevo = {
        nombre: envioData.nombre,
        telefono: envioData.telefono,
        direccion: envioData.direccion,
        barrio: envioData.barrio || undefined,
      }
    }

    if (!quiereEnvio) {
      data.nombreMostrador = nombreOpcional || undefined
    }

    await onSubmit(data)
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      {/* Nombre opcional */}
      {!quiereEnvio && (
        <div>
          <label className="text-sm text-gray-500">Nombre del cliente (opcional)</label>
          <Input
            value={nombreOpcional}
            onChange={(e) => setNombreOpcional(e.target.value)}
            placeholder="Dejar vacío para 'Mostrador'"
          />
        </div>
      )}

      {/* Productos con +/- */}
      <div className="space-y-2">
        <h3 className="font-semibold text-gray-700">Productos</h3>
        {PRODUCTOS.map((prod) => {
          const cant = cantidades[prod.id] || 0
          const precio = getPrecio(prod.codigo)
          if (precio <= 0) return null
          return (
            <div key={prod.id} className="flex items-center justify-between py-2 border-b border-gray-100">
              <div className="flex-1">
                <span className="font-medium text-sm">{prod.nombre}</span>
                <span className="text-xs text-gray-400 ml-2">${precio.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => decrement(prod.id)}
                  className="w-9 h-9 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-lg font-bold transition"
                  disabled={cant === 0}
                >
                  -
                </button>
                <span className="w-8 text-center font-bold text-lg">{cant}</span>
                <button
                  type="button"
                  onClick={() => increment(prod.id)}
                  className="w-9 h-9 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center text-lg font-bold transition"
                >
                  +
                </button>
                {cant > 0 && (
                  <span className="text-sm text-gray-500 w-20 text-right">
                    ${(cant * precio).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Toggle envío */}
      <div className="bg-gray-50 rounded-lg p-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={quiereEnvio}
            onChange={(e) => setQuiereEnvio(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300"
          />
          <span className="font-medium text-gray-700">¿Quiere envío a domicilio?</span>
        </label>

        {quiereEnvio && (
          <div className="mt-3 space-y-2 pl-8">
            <Input
              placeholder="Nombre *"
              value={envioData.nombre}
              onChange={(e) => setEnvioData(prev => ({ ...prev, nombre: e.target.value }))}
            />
            <Input
              placeholder="Celular *"
              value={envioData.telefono}
              onChange={(e) => setEnvioData(prev => ({ ...prev, telefono: e.target.value }))}
            />
            <Input
              placeholder="Dirección *"
              value={envioData.direccion}
              onChange={(e) => setEnvioData(prev => ({ ...prev, direccion: e.target.value }))}
            />
            <Input
              placeholder="Barrio (opcional)"
              value={envioData.barrio}
              onChange={(e) => setEnvioData(prev => ({ ...prev, barrio: e.target.value }))}
            />
          </div>
        )}
      </div>

      {/* Método de pago */}
      <div>
        <label className="text-sm text-gray-500 mb-1 block">Método de pago</label>
        <select
          value={metodoPago}
          onChange={(e) => setMetodoPago(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        >
          {METODOS_PAGO.map(m => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
      </div>

      {/* Total y botón cobrar */}
      <div className="border-t pt-4">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={total <= 0 || submitting}
          className="w-full py-6 text-lg font-bold bg-green-600 hover:bg-green-700"
          size="lg"
        >
          {submitting ? 'Procesando...' : `Cobrar $${total.toLocaleString()}`}
        </Button>
      </div>
    </div>
  )
}
