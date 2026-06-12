'use client'

import { useState, useMemo } from 'react'
import { Modal } from '@/components/modal'
import { CasoDetail } from './caso-detail'

interface Caso {
  id: string
  alertaTipo: string
  severidad: string
  titulo: string
  descripcion: string | null
  clienteId: string | null
  pedidoId: string | null
  status: string
  asignadoAId: string | null
  creadoPorId: string
  notasResolucion: string | null
  resueltoEn: string | null
  cerradoEn: string | null
  createdAt: string
  updatedAt: string
  cliente: { id: string; nombre: string; telefono: string } | null
  pedido: { id: string; numero: number; total: number } | null
  asignadoA: { id: string; username: string } | null
  creadoPor: { id: string; username: string } | null
  _count: { eventos: number }
}

interface Usuario {
  id: string
  username: string
  rol: string
}

interface CasosClientProps {
  initialCasos: Caso[]
  usuarios: Usuario[]
}

const STATUS_LABELS: Record<string, string> = {
  ABIERTO: 'Abierto',
  EN_PROCESO: 'En Proceso',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
}

const STATUS_COLORS: Record<string, string> = {
  ABIERTO: 'bg-red-100 text-red-700 border-red-200',
  EN_PROCESO: 'bg-amber-100 text-amber-700 border-amber-200',
  RESUELTO: 'bg-green-100 text-green-700 border-green-200',
  CERRADO: 'bg-gray-100 text-gray-600 border-gray-200',
}

const SEVERIDAD_DOT: Record<string, string> = {
  ALTA: 'bg-red-500',
  MEDIA: 'bg-amber-500',
  BAJA: 'bg-blue-500',
}

const TIPO_LABELS: Record<string, string> = {
  '1ER_PEDIDO': '1er pedido hoy',
  '2DO_PEDIDO': '2do pedido hoy',
  '3RO_PEDIDO': '3ro+ pedido hoy',
  MONTO_ANOMALO: 'Monto anómalo',
  FIADO_REcurrente: 'Fiado recurrente',
  CLIENTE_BLOQUEADO: 'Cliente bloqueado',
  DISPUTA_ABIERTA: 'Disputa abierta',
  RECLAMACIONES_MULTIPLES: 'Cliente conflictivo',
  RECLAMACION_ACTIVA: 'Reclamación activa',
  PROMESA_PROXIMA_VENCER: 'Pago próximo a vencer',
  NO_ENTREGADO_REPETIDO: 'Entregas fallidas',
  DEVOLUCIONES_ANORMALES: 'Devoluciones sospechosas',
  ROTURAS_ANORMALES: 'Roturas sospechosas',
  DESCUENTO_NO_JUSTIFICADO: 'Descuento sin justificar',
  NOTA_CREDITO_FRECUENTE: 'Notas de crédito frecuentes',
  PRECIO_POR_DEBAJO_TABLA: 'Precio por debajo de tabla',
  REPARTIDOR_DEUDA_ALTA: 'Deuda de repartidor alta',
  CLIENTE_NO_VERIFICADO: 'Cliente no verificado',
  MULTIPLES_PEDIDOS_RAPIDO: 'Pedidos muy seguidos',
  CAMBIO_PRECIO_BRUSCO: 'Cambio de precio brusco',
}

function tiempoAbierto(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime()
  const horas = Math.floor(diff / (1000 * 60 * 60))
  if (horas < 1) return '< 1h'
  if (horas < 24) return `${horas}h`
  const dias = Math.floor(horas / 24)
  return `${dias}d ${horas % 24}h`
}

export default function CasosClient({ initialCasos, usuarios }: CasosClientProps) {
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS')
  const [filtroSeveridad, setFiltroSeveridad] = useState<string>('TODAS')
  const [soloMios, setSoloMios] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCaso, setSelectedCaso] = useState<Caso | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const filtrados = useMemo(() => {
    return initialCasos
      .filter((c) => {
        if (filtroStatus !== 'TODOS' && c.status !== filtroStatus) return false
        if (filtroSeveridad !== 'TODAS' && c.severidad !== filtroSeveridad) return false
        if (soloMios && !c.asignadoAId) return false
        if (searchTerm) {
          const s = searchTerm.toLowerCase()
          const match =
            c.titulo.toLowerCase().includes(s) ||
            c.cliente?.nombre.toLowerCase().includes(s) ||
            c.descripcion?.toLowerCase().includes(s)
          if (!match) return false
        }
        return true
      })
  }, [initialCasos, filtroStatus, filtroSeveridad, soloMios, searchTerm])

  const handleOpenDetail = (caso: Caso) => {
    setSelectedCaso(caso)
    setDetailOpen(true)
  }

  const handleStatusChange = (casoId: string, newStatus: string) => {
    const updated = initialCasos.find(c => c.id === casoId)
    if (updated) {
      updated.status = newStatus
      if (newStatus === 'RESUELTO') updated.resueltoEn = new Date().toISOString()
      if (newStatus === 'CERRADO') updated.cerradoEn = new Date().toISOString()
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
        <h1 className="text-xl font-bold text-blue-900">Gestión de Casos</h1>
        <p className="text-sm text-blue-700 mt-1">
          Seguimiento y resolución de alertas del sistema. Cada caso tiene un ciclo de vida: Abierto → En Proceso → Resuelto → Cerrado.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            type="text"
            placeholder="Buscar caso o cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-0 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="ABIERTO">Abierto</option>
            <option value="EN_PROCESO">En Proceso</option>
            <option value="RESUELTO">Resuelto</option>
            <option value="CERRADO">Cerrado</option>
          </select>
          <select
            value={filtroSeveridad}
            onChange={(e) => setFiltroSeveridad(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="TODAS">Todas las severidades</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Media</option>
            <option value="BAJA">Baja</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={soloMios}
              onChange={(e) => setSoloMios(e.target.checked)}
              className="rounded border-gray-300"
            />
            Solo míos
          </label>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Sin casos</h3>
          <p className="text-sm text-gray-500">
            No hay casos que coincidan con los filtros aplicados.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">
              {filtrados.length} caso{filtrados.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Caso</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Cliente</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Asignado</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Abierto</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map((caso) => (
                  <tr key={caso.id} className="hover:bg-gray-50 transition cursor-pointer" onClick={() => handleOpenDetail(caso)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${SEVERIDAD_DOT[caso.severidad] || 'bg-gray-400'}`} />
                        <div>
                          <div className="font-medium text-gray-800 text-sm">{caso.titulo}</div>
                          <div className="text-xs text-gray-400">{TIPO_LABELS[caso.alertaTipo] || caso.alertaTipo}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {caso.cliente ? (
                        <div>
                          <div className="text-sm text-gray-700">{caso.cliente.nombre}</div>
                          {caso.pedido && (
                            <div className="text-xs text-gray-400">Pedido #{caso.pedido.numero}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[caso.status]}`}>
                        {STATUS_LABELS[caso.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {caso.asignadoA ? (
                        <span className="text-sm text-gray-700">{caso.asignadoA.username}</span>
                      ) : (
                        <span className="text-xs text-gray-400">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-500">{tiempoAbierto(caso.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenDetail(caso) }}
                        className="text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {filtrados.map((caso) => (
              <div key={caso.id} className="bg-white border border-gray-200 rounded-lg shadow-sm p-4" onClick={() => handleOpenDetail(caso)}>
                <div className="flex items-start gap-2 mb-2">
                  <span className={`inline-block w-2 h-2 rounded-full mt-1.5 ${SEVERIDAD_DOT[caso.severidad] || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 text-sm">{caso.titulo}</div>
                    <div className="text-xs text-gray-400">{TIPO_LABELS[caso.alertaTipo] || caso.alertaTipo}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 ml-4">
                  {caso.cliente && <span>{caso.cliente.nombre}</span>}
                  <span className={`inline-block px-2 py-0.5 rounded-full border ${STATUS_COLORS[caso.status]}`}>
                    {STATUS_LABELS[caso.status]}
                  </span>
                  <span>{tiempoAbierto(caso.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Modal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedCaso(null) }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {selectedCaso && (
          <CasoDetail
            caso={selectedCaso}
            usuarios={usuarios}
            onClose={() => { setDetailOpen(false); setSelectedCaso(null) }}
            onStatusChange={handleStatusChange}
          />
        )}
      </Modal>
    </div>
  )
}
