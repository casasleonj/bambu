'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import NuevaDeudaDialog from './nueva-deuda-dialog'
import AbonoDeudaDialog from './abono-deuda-dialog'

interface Deuda {
  id: string
  tipo: string
  montoOriginal: number
  montoPendiente: number
  plazoNominas: number | null
  porcentajePorNomina: number | null
  descripcion: string
  fecha: string
  embarqueId: string | null
  abonos: Array<{ id: string; monto: number; fecha: string; nota: string | null }>
  deducciones: Array<{ id: string; monto: number; createdAt: string; nomina: { id: string; estado: string } }>
}

const tipoLabels: Record<string, string> = {
  PRESTAMO: 'Prestamo',
  DEFICIT_EFECTIVO: 'Deficit Efectivo',
  ADELANTO_NOMINA: 'Adelanto de Nomina',
  OTRO: 'Otro',
}

export default function DeudasTab({ trabajadorId }: { trabajadorId: string }) {
  const [deudas, setDeudas] = useState<Deuda[]>([])
  const [loading, setLoading] = useState(true)
  const [showNuevaDeuda, setShowNuevaDeuda] = useState(false)
  const [showAbono, setShowAbono] = useState<string | null>(null)
  const [filter, setFilter] = useState<'todas' | 'pendientes' | 'pagadas'>('pendientes')

  async function fetchDeudas() {
    setLoading(true)
    try {
      const res = await fetch(`/api/deudas?trabajadorId=${trabajadorId}`)
      if (!res.ok) throw new Error('Error cargando deudas')
      const data = await res.json()
      setDeudas(data.deudas || [])
    } catch {
      toast.error('No se pudieron cargar las deudas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeudas()
  }, [trabajadorId])

  const deudasFiltradas = deudas.filter(d => {
    if (filter === 'pendientes') return d.montoPendiente > 0
    if (filter === 'pagadas') return d.montoPendiente === 0
    return true
  })

  const totalPendiente = deudas.reduce((sum, d) => sum + d.montoPendiente, 0)

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Cargando deudas...</div>
  }

  return (
    <div>
      {/* Summary */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            <span className="text-xs text-red-600 font-medium">Total Pendiente</span>
            <p className="text-lg font-bold text-red-700">{formatCurrency(totalPendiente)}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <span className="text-xs text-green-600 font-medium">Deudas Activas</span>
            <p className="text-lg font-bold text-green-700">{deudas.filter(d => d.montoPendiente > 0).length}</p>
          </div>
        </div>
        <button
          onClick={() => setShowNuevaDeuda(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          + Nueva Deuda
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(['todas', 'pendientes', 'pagadas'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === f
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'todas' ? 'Todas' : f === 'pendientes' ? 'Pendientes' : 'Pagadas'}
          </button>
        ))}
      </div>

      {/* Deudas list */}
      {deudasFiltradas.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg font-medium">No hay deudas {filter === 'pendientes' ? 'pendientes' : filter === 'pagadas' ? 'pagadas' : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deudasFiltradas.map(deuda => (
            <DeudaCard
              key={deuda.id}
              deuda={deuda}
              onAbonar={() => setShowAbono(deuda.id)}
            />
          ))}
        </div>
      )}

      <NuevaDeudaDialog
        open={showNuevaDeuda}
        onClose={() => setShowNuevaDeuda(false)}
        trabajadorId={trabajadorId}
        onCreated={() => {
          setShowNuevaDeuda(false)
          fetchDeudas()
        }}
      />

      {showAbono && (
        <AbonoDeudaDialog
          deudaId={showAbono}
          onClose={() => setShowAbono(null)}
          onAbonado={() => {
            setShowAbono(null)
            fetchDeudas()
          }}
        />
      )}
    </div>
  )
}

function DeudaCard({
  deuda,
  onAbonar,
}: {
  deuda: Deuda
  onAbonar: () => void
}) {
  const isPendiente = deuda.montoPendiente > 0
  const porcentajePagado = deuda.montoOriginal > 0
    ? ((deuda.montoOriginal - deuda.montoPendiente) / deuda.montoOriginal) * 100
    : 0

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 border-l-4 ${isPendiente ? 'border-l-red-500' : 'border-l-green-500'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isPendiente ? 'destructive' : 'default'}>
              {tipoLabels[deuda.tipo] || deuda.tipo}
            </Badge>
            {deuda.embarqueId && (
              <span
                title="Generada automáticamente por faltante de caja en un embarque"
                className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium"
              >
                Auto
              </span>
            )}
            {!isPendiente && <span className="text-xs text-green-600 font-medium">Pagada</span>}
          </div>
          <p className="text-sm text-gray-600 mt-1">{deuda.descripcion}</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(deuda.fecha).toLocaleDateString('es-CO')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-800">{formatCurrency(deuda.montoPendiente)}</p>
          <p className="text-xs text-gray-400">de {formatCurrency(deuda.montoOriginal)}</p>
        </div>
      </div>

      {/* Plan de pago */}
      {deuda.tipo !== 'ADELANTO_NOMINA' && (deuda.plazoNominas || deuda.porcentajePorNomina) && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs text-gray-600">
          {deuda.plazoNominas && (
            <span className="bg-gray-100 px-2 py-0.5 rounded">
              {deuda.plazoNominas} nóminas
            </span>
          )}
          {deuda.porcentajePorNomina && (
            <span className="bg-gray-100 px-2 py-0.5 rounded">
              máx {deuda.porcentajePorNomina}% por nómina
            </span>
          )}
        </div>
      )}

      {/* Progress bar */}
      {deuda.montoOriginal > 0 && (
        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${Math.min(100, porcentajePagado)}%` }}
          />
        </div>
      )}

      {/* Abonos */}
      {deuda.abonos.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Abonos ({deuda.abonos.length})</p>
          <div className="flex flex-wrap gap-1">
            {deuda.abonos.slice(0, 3).map(a => (
              <span key={a.id} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                {formatCurrency(a.monto)} - {new Date(a.fecha).toLocaleDateString('es-CO')}
              </span>
            ))}
            {deuda.abonos.length > 3 && (
              <span className="text-xs text-gray-400">+{deuda.abonos.length - 3} mas</span>
            )}
          </div>
        </div>
      )}

      {/* Deducciones por nomina */}
      {deuda.deducciones.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Descontado en nomina</p>
          <div className="flex flex-wrap gap-1">
            {deuda.deducciones.map(d => (
              <span key={d.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                {formatCurrency(d.monto)} ({d.nomina.estado})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {isPendiente && (
        <button
          onClick={onAbonar}
          className="w-full mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
        >
          Registrar Abono
        </button>
      )}
    </div>
  )
}
