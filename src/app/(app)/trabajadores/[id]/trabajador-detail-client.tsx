'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'
import { rolLabels, tipoPagoLabels } from '../trabajadores-client/types'
import DeudasTab from './deudas-tab'
import { formatearTelefonoParaInput } from '@/lib/telefono'

interface TrabajadorDetail {
  id: string
  nombre: string
  rol: string
  tipoPago: string
  usaMoto: boolean
  capacidadKg: number
  comPacaAgua: number
  comPacaHielo: number
  comBotellon: number
  comRepartAgua: number
  comRepartHielo: number
  comRepartBotellon: number
  salarioFijo: number
  telefono: string | null
  activo: boolean
  _count: {
    embarques: number
    nominas: number
    deudas: number
  }
}

export default function TrabajadorDetailClient({
  trabajador: initialTrabajador,
}: {
  trabajador: TrabajadorDetail
}) {
  const router = useRouter()
  const [trabajador, setTrabajador] = useState<TrabajadorDetail>(initialTrabajador)
  const [activeTab, setActiveTab] = useState<'info' | 'deudas'>('info')

  async function fetchTrabajador() {
    try {
      const res = await fetch(`/api/trabajadores/${trabajador.id}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.trabajador) {
        setTrabajador(data.trabajador)
      }
    } catch {
      // Silencioso: no queremos toast spam en cada evento
    }
  }

  useRealtimeListener(['trabajador.updated'], () => {
    fetchTrabajador()
  })

  useRealtimeListener(['trabajador.deleted'], (event) => {
    if (event.id === trabajador.id) {
      router.push('/trabajadores')
    }
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/trabajadores"
          className="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          &larr; Volver
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{trabajador.nombre}</h1>
          <div className="flex gap-2 mt-1">
            <Badge variant="default">{rolLabels[trabajador.rol] || trabajador.rol}</Badge>
            <Badge variant="secondary">{tipoPagoLabels[trabajador.tipoPago] || trabajador.tipoPago}</Badge>
            {!trabajador.activo && <Badge variant="destructive">Inactivo</Badge>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('info')}
            className={`pb-3 text-sm font-medium border-b-2 transition ${
              activeTab === 'info'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Informacion
          </button>
          <button
            onClick={() => setActiveTab('deudas')}
            className={`pb-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === 'deudas'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Deudas
            {trabajador._count.deudas > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                {trabajador._count.deudas}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && <InfoTab trabajador={trabajador} />}
      {activeTab === 'deudas' && <DeudasTab trabajadorId={trabajador.id} />}
    </div>
  )
}

function InfoTab({ trabajador }: { trabajador: TrabajadorDetail }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Datos personales */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Datos Personales</h2>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Telefono</span>
            <span className="text-sm font-medium">{formatearTelefonoParaInput(trabajador.telefono ?? '') || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Usa moto</span>
            <span className="text-sm font-medium">{trabajador.usaMoto ? 'Si' : 'No'}</span>
          </div>
          {trabajador.usaMoto && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Capacidad</span>
              <span className="text-sm font-medium">{trabajador.capacidadKg} kg</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Embarques</span>
            <span className="text-sm font-medium">{trabajador._count.embarques}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Nominas</span>
            <span className="text-sm font-medium">{trabajador._count.nominas}</span>
          </div>
        </div>
      </div>

      {/* Configuracion de pago */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Configuracion de Pago</h2>
        <div className="space-y-3">
          {trabajador.rol === 'SELLADOR' && (trabajador.tipoPago === 'COMISION' || trabajador.tipoPago === 'MIXTO') && (
            <>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Com. paca agua</span>
                <span className="text-sm font-medium">{formatCurrency(trabajador.comPacaAgua)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Com. paca hielo</span>
                <span className="text-sm font-medium">{formatCurrency(trabajador.comPacaHielo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Com. botellon</span>
                <span className="text-sm font-medium">{formatCurrency(trabajador.comBotellon)}</span>
              </div>
            </>
          )}
          {trabajador.usaMoto && (trabajador.tipoPago === 'COMISION' || trabajador.tipoPago === 'MIXTO') && (
            <>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Com. reparto agua</span>
                <span className="text-sm font-medium">{formatCurrency(trabajador.comRepartAgua)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Com. reparto hielo</span>
                <span className="text-sm font-medium">{formatCurrency(trabajador.comRepartHielo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Com. reparto botellon</span>
                <span className="text-sm font-medium">{formatCurrency(trabajador.comRepartBotellon)}</span>
              </div>
            </>
          )}
          {(trabajador.tipoPago === 'FIJO' || trabajador.tipoPago === 'MIXTO') && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Salario fijo</span>
              <span className="text-sm font-medium">{formatCurrency(trabajador.salarioFijo)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
