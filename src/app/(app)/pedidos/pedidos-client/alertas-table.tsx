'use client'

import { useState, useMemo, useEffect } from 'react'
import { calcularAlertas, REGLAS_ALERTAS } from './alertas-utils'
import { filtrarAlertasIgnoradas } from '@/lib/alertas-detector'
import { toast } from 'sonner'
import { GuiaAlertaModal } from '@/components/guia-alerta-modal'
import { CasoGuiaModal, type Caso } from '@/components/caso-guia-modal'
import type { AlertaTipo, AlertaItem, SeveridadAlerta } from '@/lib/alertas-config'
import { ignorarAlerta, getGuiaAlerta } from '@/lib/alertas-config'
import type { Pedido } from './types'
import { PedidoDocumentLinks, type AccesoDocumentosPedido } from './pedido-document-links'
import { useParametroConsulta } from './use-consulta-contexto'

interface AlertasTableProps extends AccesoDocumentosPedido {
  pedidos: Pedido[]
  loading: boolean
  error: string | null
  activeTab: 'hoy' | 'fiados' | 'alertas'
  /** Clientes con alertas visibles (ya sin las ignoradas), para el contador de la pestaña. */
  onCountChange?: (count: number) => void
  onRetry?: () => void
}

const SEVERIDAD_ORDER = { ALTA: 3, MEDIA: 2, BAJA: 1 }

export function AlertasTable({
  pedidos: pedidosAlertas,
  loading,
  error,
  activeTab,
  onCountChange,
  onRetry, onOpenPedido, onOpenFactura, userRole,
}: AlertasTableProps) {
  const [expandedCliente, setExpandedCliente] = useParametroConsulta<string>('alertasExpandido', '')
  const [filtroSeveridad, setFiltroSeveridad] = useParametroConsulta<'TODAS' | 'ALTA' | 'MEDIA' | 'BAJA'>('alertasSeveridad', 'TODAS', ['TODAS', 'ALTA', 'MEDIA', 'BAJA'])
  const [searchTerm, setSearchTerm] = useParametroConsulta<string>('alertasBuscar', '')
  const [guiaTipo, setGuiaTipo] = useState<AlertaTipo | null>(null)
  const [guiaOpen, setGuiaOpen] = useState(false)
  const [guiaContexto, setGuiaContexto] = useState<{ pedidoId?: string; clienteId?: string }>({})
  const [reglasOpen, setReglasOpen] = useState(false)
  const [creandoCaso, setCreandoCaso] = useState<string | null>(null)
  const [casoCreado, setCasoCreado] = useState<(Caso & { status: string; descripcion?: string }) | null>(null)
  const [usuarios, setUsuarios] = useState<Array<{ id: string; username: string; rol: string }>>([])

  useEffect(() => {
    fetch('/api/clientes?pageSize=1')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          fetch('/api/trabajadores')
            .then(r => r.json())
            .then(d => {
              if (d.success) {
                const users = d.trabajadores
                  .filter((t: { userId?: string; nombre: string; rol: string }) => t.userId)
                  .map((t: { userId?: string; nombre: string; rol: string }) => ({ id: t.userId, username: t.nombre, rol: t.rol }))
                setUsuarios(users)
              }
            })
        }
      })
  }, [])

  // Cambia al ignorar para recalcular sin recargar la página (localStorage no es reactivo).
  const [ignoradasVersion, setIgnoradasVersion] = useState(0)

  const alertaRows = useMemo(
    () => filtrarAlertasIgnoradas(calcularAlertas(pedidosAlertas)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ignoradasVersion fuerza releer localStorage
    [pedidosAlertas, ignoradasVersion],
  )

  useEffect(() => {
    if (error || loading && pedidosAlertas.length === 0) return
    onCountChange?.(alertaRows.length)
  }, [alertaRows, loading, error, pedidosAlertas.length, onCountChange])

  const handleIgnorar = (clienteId: string, tipo: AlertaTipo) => {
    ignorarAlerta(clienteId, tipo)
    setIgnoradasVersion((v) => v + 1)
    toast.success('Alerta ignorada por 24 horas')
  }

  const filtrados = alertaRows
    .map(row => filtroSeveridad === 'TODAS' ? row : { ...row,
      alertas: row.alertas.filter(a => a.severidad === filtroSeveridad), severidadMasAlta: filtroSeveridad })
    .filter((row) => {
      const matchSearch = !searchTerm ||
        row.nombreCli.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.telefonoCli?.includes(searchTerm)
      const matchSeveridad = row.alertas.length > 0
      return matchSearch && matchSeveridad
    })
    .sort((a, b) => SEVERIDAD_ORDER[b.severidadMasAlta] - SEVERIDAD_ORDER[a.severidadMasAlta])

  const getBadgeColorLocal = (severidad: string) => {
    switch (severidad) {
      case 'ALTA': return 'bg-red-100 text-red-700 border-red-200'
      case 'MEDIA': return 'bg-amber-100 text-amber-700 border-amber-200'
      default: return 'bg-blue-100 text-blue-700 border-blue-200'
    }
  }

  const getTipoLabel = (tipo: string) => {
    const regla = REGLAS_ALERTAS.find((r) => r.tipo === tipo)
    return regla?.label || tipo
  }

  const openGuia = (tipo: AlertaTipo, contexto?: { pedidoId?: string; clienteId?: string }) => {
    setGuiaTipo(tipo)
    setGuiaContexto(contexto || {})
    setGuiaOpen(true)
  }

  const handleGuiaAccion = (accion: string, ctx?: { pedidoId?: string; clienteId?: string }) => {
    if (accion === 'ver_pedidos_hoy' && ctx?.clienteId) {
      window.location.href = `/pedidos?search=${ctx.clienteId}`
    } else if (accion === 'ver_pedido' && ctx?.pedidoId) {
      window.location.href = `/pedidos?search=${ctx.pedidoId}`
    } else if (accion === 'llamar_cliente') {
    } else if (accion === 'ver_cuentas') {
      window.location.href = '/pedidos?tab=fiados'
    } else if (accion === 'registrar_pago') {
      window.location.href = '/pedidos?tab=fiados'
    } else if (accion === 'ver_facturas') {
      window.location.href = '/facturas'
    } else {
      setGuiaOpen(false)
    }
  }

  const handleCrearCaso = async (clienteId: string, alerta: AlertaItem) => {
    const key = `${clienteId}_${alerta.tipo}`
    setCreandoCaso(key)
    try {
      const guia = getGuiaAlerta(alerta.tipo)
      const res = await fetch('/api/casos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertaTipo: alerta.tipo,
          severidad: alerta.severidad,
          titulo: guia?.nombre || alerta.tipo,
          descripcion: alerta.detalle,
          clienteId,
          pedidoId: alerta.pedidoId || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        toast.error(data?.error && typeof data.error === 'string' ? data.error : 'No se pudo crear el caso')
        return
      }
      if (data.success) {
        const clienteData = pedidosAlertas.find(p => p.clienteId === clienteId)
        const pedidoData = pedidosAlertas.find(p => p.id === alerta.pedidoId)
        setCasoCreado({
          ...data.caso,
          cliente: clienteData ? { id: clienteData.clienteId, nombre: clienteData.nombreCli, telefono: clienteData.telefonoCli } : null,
          pedido: pedidoData ? { id: pedidoData.id, numero: pedidoData.numero, total: String(pedidoData.total) } : null,
        })
      }
    } catch {
      toast.error('No se pudo crear el caso. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setCreandoCaso(null)
    }
  }

  const handleIgnorarTodas = (row: { clienteId: string; alertas: AlertaItem[] }) => {
    const ignorables = row.alertas.filter((a) => a.severidad !== 'ALTA')
    if (ignorables.length === 0) return
    ignorables.forEach((a) => ignorarAlerta(row.clienteId, a.tipo))
    setIgnoradasVersion((v) => v + 1)
    toast.success(`${ignorables.length} alerta${ignorables.length !== 1 ? 's' : ''} ignorada${ignorables.length !== 1 ? 's' : ''} por 24 horas`)
  }

  const getContextData = (clienteId: string, alerta: AlertaItem) => {
    const pedidoData = pedidosAlertas.find(p => p.id === alerta.pedidoId)
    return {
      pedidoDisputa: pedidoData?.disputaAbierta ?? undefined,
      pedidoEstadoPago: pedidoData?.estadoPago ?? undefined,
      clienteConSaldo: pedidosAlertas.some(p => p.clienteId === clienteId && Number(p.saldo) > 0),
    }
  }

  const handleStatusChange = (casoId: string, newStatus: string) => {
    if (casoCreado && casoCreado.id === casoId) {
      setCasoCreado({ ...casoCreado, status: newStatus })
    }
  }

  const documentos = (clienteId: string, alerta: AlertaItem) => {
    const pedido = pedidosAlertas.find(p => p.id === alerta.pedidoId)
    return alerta.pedidoId ? <PedidoDocumentLinks pedidoId={alerta.pedidoId} numero={pedido?.numero}
      facturaId={pedido?.factura?.id} facturaNumero={pedido?.factura?.numero} userRole={userRole}
      onOpenPedido={onOpenPedido} onOpenFactura={onOpenFactura} volver="Volver a Alertas" />
      : <p className="mt-2 text-sm text-gray-600">Esta señal no tiene un pedido específico asociado. <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={`/clientes?openCliente=${encodeURIComponent(clienteId)}`}>Ver cliente</a></p>
  }

  if (error && pedidosAlertas.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
          <h2 className="text-lg font-bold text-amber-900">Sistema de Alertas</h2>
        </div>
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <p className="text-sm text-gray-600">No podemos confirmar si hay alertas.</p>
          <button className="mt-3 min-h-11 rounded border px-4" onClick={onRetry}>Reintentar</button>
        </div>
      </div>
    )
  }

  if (activeTab === 'alertas' && loading && pedidosAlertas.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
          <h2 className="text-lg font-bold text-amber-900">Sistema de Alertas</h2>
        </div>
        <div className="bg-white rounded-xl shadow p-8 text-center text-sm text-gray-500">
          Cargando alertas...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">No se pudo actualizar. Se conservan los datos anteriores. <button className="min-h-11 px-3 underline" onClick={onRetry}>Reintentar</button></div>}
      {/* Header explicativo */}
      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0">🛡️</div>
          <div>
            <h2 className="text-lg font-bold text-amber-900">Sistema de Alertas</h2>
            <p className="text-sm text-amber-700 mt-1">
              Detectamos automáticamente comportamientos inusuales: pedidos múltiples, montos anómalos,
              fiados frecuentes, pagos vencidos, disputas abiertas y más. Haz clic en ℹ️ para ver la guía de cada alerta.
            </p>
            <p className="mt-2 text-sm text-amber-800">Esta consulta es independiente de las fechas de Pedidos. Las alertas son señales para revisar; no demuestran fraude ni registran pagos.</p>
          </div>
        </div>
      </div>

      {/* Reglas activas (collapsable) */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <button
          onClick={() => setReglasOpen(!reglasOpen)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">🛡️</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Reglas de detección activas</h3>
              <p className="text-xs text-gray-400">{REGLAS_ALERTAS.length} reglas configuradas</p>
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${reglasOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {reglasOpen && (
          <div className="border-t border-gray-100 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {REGLAS_ALERTAS.map((regla) => (
                <button
                  key={regla.tipo}
                  onClick={() => openGuia(regla.tipo)}
                  className={`text-left p-3 rounded-lg border transition hover:shadow-sm ${
                    regla.severidad === 'ALTA' ? 'bg-red-50 border-red-100 hover:bg-red-100' :
                    regla.severidad === 'MEDIA' ? 'bg-amber-50 border-amber-100 hover:bg-amber-100' :
                    'bg-blue-50 border-blue-100 hover:bg-blue-100'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      regla.severidad === 'ALTA' ? 'bg-red-500' :
                      regla.severidad === 'MEDIA' ? 'bg-amber-500' :
                      'bg-blue-500'
                    }`} />
                    <span className="text-sm font-medium text-gray-800">{regla.label}</span>
                    <span className="ml-auto text-gray-400 hover:text-blue-600 text-xs">ℹ️</span>
                  </div>
                  <p className="text-xs text-gray-500">{regla.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-0 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <select
            value={filtroSeveridad}
            onChange={(e) => setFiltroSeveridad(e.target.value as 'TODAS' | 'ALTA' | 'MEDIA' | 'BAJA')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="TODAS">Todas las severidades</option>
            <option value="ALTA">🔴 Alta</option>
            <option value="MEDIA">🟡 Media</option>
            <option value="BAJA">🔵 Baja</option>
          </select>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">{searchTerm || filtroSeveridad !== 'TODAS' ? 'Sin resultados con estos filtros' : 'No hay alertas visibles'}</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            {searchTerm || filtroSeveridad !== 'TODAS' ? 'Revisa la búsqueda y la severidad. Puede haber otras alertas fuera de esta consulta.' : 'Las alertas ignoradas conservan su tiempo de ocultación.'}
          </p>
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 max-w-md mx-auto text-left">
            <p className="font-medium mb-1">¿Por qué no veo alertas?</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Necesitas 2+ pedidos del mismo cliente en el mismo día</li>
              <li>O un pedido con valor mayor al doble del promedio habitual</li>
              <li>O 2+ pedidos fiados en los últimos 7 días</li>
              <li>O un cliente con estado de pago &quot;VENCIDO&quot;</li>
              <li>O una disputa abierta sin resolver</li>
              <li>O un cliente con 3+ reclamaciones acumuladas</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">
              {filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''} con alertas
            </span>
            <span className="text-xs text-gray-400">Haz clic en ℹ️ para ver la guía de cada alerta</span>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Cliente</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Alertas</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Severidad</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
              {filtrados.map((row) => (
                <>
                  <tr key={row.clienteId} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{row.nombreCli}</div>
                      <div className="text-xs text-gray-400">{row.telefonoCli}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 text-sm font-bold text-white bg-red-600 rounded-full">
                        {row.alertas.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium border ${getBadgeColorLocal(row.severidadMasAlta)}`}>
                        {row.severidadMasAlta}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setExpandedCliente(expandedCliente === row.clienteId ? '' : row.clienteId)}
                        className="text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
                      >
                        {expandedCliente === row.clienteId ? 'Ocultar' : 'Ver detalle'}
                      </button>
                    </td>
                  </tr>
                  {expandedCliente === row.clienteId && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 bg-gray-50">
                        <div className="space-y-2">
                          {row.alertas.some((a) => a.severidad !== 'ALTA') && (
                            <div className="flex justify-end">
                              <button
                                onClick={() => handleIgnorarTodas(row)}
                                data-testid="alertas-ignorar-todas"
                                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 transition"
                              >
                                Ignorar todas (24h)
                              </button>
                            </div>
                          )}
                          {row.alertas.map((alerta, idx) => (
                            <div key={idx} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-b-0">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${getBadgeColorLocal(alerta.severidad)}`}>
                                  {alerta.severidad}
                                </span>
                                <span className="text-sm font-medium">{getTipoLabel(alerta.tipo)}</span>
                                <span className="text-xs text-gray-500">{alerta.detalle}</span>
                              </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => openGuia(alerta.tipo, { pedidoId: alerta.pedidoId, clienteId: row.clienteId })}
                                    className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition"
                                    title="Ver guía"
                                  >
                                    ℹ️ Guía
                                  </button>
                                  <button
                                    onClick={() => handleCrearCaso(row.clienteId, alerta)}
                                    disabled={creandoCaso === `${row.clienteId}_${alerta.tipo}`}
                                    className="text-xs text-green-600 hover:bg-green-50 px-2 py-1 rounded transition disabled:opacity-50"
                                    title="Crear caso"
                                  >
                                    {creandoCaso === `${row.clienteId}_${alerta.tipo}` ? 'Creando...' : 'Crear caso'}
                                  </button>
                                  {alerta.severidad !== 'ALTA' && (
                                    <button
                                      onClick={() => handleIgnorar(row.clienteId, alerta.tipo)}
                                      data-testid="alerta-ignorar"
                                      className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded transition"
                                      title="Ignorar 24h"
                                    >
                                      Ignorar
                                    </button>
                                  )}
                                <span className="text-xs text-gray-400">
                                  {new Date(alerta.fecha).toLocaleDateString('es-CO')}
                                </span>
                              </div>
                              <div className="w-full">{documentos(row.clienteId, alerta)}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-gray-100">
          {filtrados.map((row) => (
            <div key={row.clienteId} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-gray-800">{row.nombreCli}</h3>
                  <p className="text-xs text-gray-400">{row.telefonoCli}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium border ${getBadgeColorLocal(row.severidadMasAlta)}`}>
                    {row.severidadMasAlta}
                  </span>
                  <span className="block text-xs text-gray-500 mt-1">{row.alertas.length} alertas</span>
                </div>
              </div>
              <button
                onClick={() => setExpandedCliente(expandedCliente === row.clienteId ? '' : row.clienteId)}
                className="w-full text-sm text-blue-600 bg-blue-50 py-2 rounded-lg"
              >
                {expandedCliente === row.clienteId ? 'Ocultar' : 'Ver detalle'}
              </button>
              {expandedCliente === row.clienteId && (
                <div className="mt-3 space-y-2 bg-gray-50 p-3 rounded-lg">
                  {row.alertas.some((a) => a.severidad !== 'ALTA') && (
                    <button
                      onClick={() => handleIgnorarTodas(row)}
                      data-testid="alertas-ignorar-todas"
                      className="w-full text-xs text-gray-500 border border-gray-200 py-2 rounded-lg"
                    >
                      Ignorar todas (24h)
                    </button>
                  )}
                  {row.alertas.map((alerta, idx) => (
                    <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-sm py-1 border-b last:border-b-0">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${getBadgeColorLocal(alerta.severidad)}`}>
                          {alerta.severidad}
                        </span>
                        <span className="truncate">{getTipoLabel(alerta.tipo)}</span>
                      </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => openGuia(alerta.tipo, { pedidoId: alerta.pedidoId, clienteId: row.clienteId })} className="text-xs text-blue-600">ℹ️</button>
                          <button
                            onClick={() => handleCrearCaso(row.clienteId, alerta)}
                            disabled={creandoCaso === `${row.clienteId}_${alerta.tipo}`}
                            className="text-xs text-green-600 disabled:opacity-50"
                            title="Crear caso"
                          >
                            {creandoCaso === `${row.clienteId}_${alerta.tipo}` ? '...' : 'Caso'}
                          </button>
                          {alerta.severidad !== 'ALTA' && (
                            <button onClick={() => handleIgnorar(row.clienteId, alerta.tipo)} data-testid="alerta-ignorar" className="text-xs text-gray-400">Ignorar</button>
                          )}
                        <span className="text-xs text-gray-400">{new Date(alerta.fecha).toLocaleDateString('es-CO')}</span>
                      </div>
                      <p className="w-full text-xs text-gray-600">{alerta.detalle}</p>
                      <div className="w-full">{documentos(row.clienteId, alerta)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

      <GuiaAlertaModal
        tipo={guiaTipo}
        open={guiaOpen}
        onClose={() => setGuiaOpen(false)}
        onAccion={handleGuiaAccion}
        contexto={guiaContexto}
      />

      {casoCreado && (
        <CasoGuiaModal
          caso={casoCreado}
          contextData={casoCreado.alertaTipo ? getContextData(casoCreado.clienteId || '', { tipo: casoCreado.alertaTipo as AlertaTipo, severidad: casoCreado.severidad as SeveridadAlerta, detalle: casoCreado.descripcion || '', fecha: new Date().toISOString(), pedidoId: casoCreado.pedidoId ?? undefined }) : undefined}
          usuarios={usuarios}
          onClose={() => setCasoCreado(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
