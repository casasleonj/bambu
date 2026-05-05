'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Cliente, NuevoRecurrenteForm } from './types'

const PRODUCTOS = [
  { key: 'pacaAgua', label: 'Paca Agua' },
  { key: 'pacaHielo', label: 'Paca Hielo' },
  { key: 'botellonFab', label: 'Bot. Fabrica' },
  { key: 'botellonDom', label: 'Bot. Domicilio' },
  { key: 'bolsaAgua', label: 'Bolsa Agua' },
  { key: 'bolsaHielo', label: 'Bolsa Hielo' },
] as const

export default function NuevoRecurrenteClient() {
  const router = useRouter()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState<NuevoRecurrenteForm>({
    clienteId: '', frecuencia: 'SEMANAL',
    pacaAgua: 0, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0,
    obs: '',
  })

  useEffect(() => {
    fetch('/api/clientes?all=true')
      .then((r) => r.json())
      .then((data) => setClientes(data.clientes || []))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.clienteId) { toast.error('Selecciona un cliente'); return }
    const totalPacas = formData.pacaAgua + formData.pacaHielo + formData.botellonFab + formData.botellonDom + formData.bolsaAgua + formData.bolsaHielo
    if (totalPacas === 0) { toast.error('Debes especificar al menos un producto'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/recurrentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: formData.clienteId,
          frecuencia: formData.frecuencia,
          productos: {
            pacaAgua: formData.pacaAgua, pacaHielo: formData.pacaHielo,
            botellonFab: formData.botellonFab, botellonDom: formData.botellonDom,
            bolsaAgua: formData.bolsaAgua, bolsaHielo: formData.bolsaHielo,
          },
          obs: formData.obs,
        }),
      })
      const data = await res.json()
      if (data.success) { toast.success('Recurrente creado'); router.push('/recurrentes') }
      else toast.error(data.error || 'Error al crear')
    } catch { toast.error('Error de conexion') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nuevo Pedido Recurrente</h1>
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <select required value={formData.clienteId}
              onChange={(e) => setFormData({ ...formData, clienteId: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">Seleccionar cliente...</option>
              {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nombre} ({c.telefono})</option>))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia</label>
            <select value={formData.frecuencia}
              onChange={(e) => setFormData({ ...formData, frecuencia: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="DIARIO">Diario</option>
              <option value="SEMANAL">Semanal</option>
              <option value="QUINCENAL">Quincenal</option>
              <option value="MENSUAL">Mensual</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Productos por entrega</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PRODUCTOS.map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <input type="number" min={0}
                    value={formData[key as keyof NuevoRecurrenteForm] as number}
                    onChange={(e) => setFormData({ ...formData, [key]: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
            <textarea value={formData.obs}
              onChange={(e) => setFormData({ ...formData, obs: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
              {submitting ? 'Creando...' : 'Crear Recurrente'}
            </button>
            <button type="button" onClick={() => router.push('/recurrentes')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}
