'use client'

import { useState, useMemo, useEffect } from 'react'
import { calcularAlertas, REGLAS_ALERTAS } from './alertas-utils'
import { GuiaAlertaModal } from '@/components/guia-alerta-modal'
import { CasoGuiaModal } from '@/components/caso-guia-modal'
import type { AlertaTipo, AlertaItem } from '@/lib/alertas-config'
import { ignorarAlerta, getGuiaAlerta } from '@/lib/alertas-config'

interface AlertasTableProps {
  pedidos: import('./types').Pedido[]
}

const SEVERIDAD_ORDER = { ALTA: 3, MEDIA: 2, BAJA: 1 }

export function AlertasTable({ pedidos }: AlertasTableProps) {
  const [expandedCliente, setExpandedCliente] = useState<string | null>(null)
  const [filtroSeveridad, setFiltroSeveridad] = useState<'TODAS' | 'ALTA' | 'MEDIA' | 'BAJA'>('TODAS')
  const [searchTerm, setSearchTerm] = useState('')
  const [guiaTipo, setGuiaTipo] = useState<AlertaTipo | null>(null)
  const [guiaOpen, setGuiaOpen] = useState(false)
  const [guiaContexto, setGuiaContexto] = useState<{ pedidoId?: string; clienteId?: string }>({})
  const [reglasOpen, setReglasOpen] = useState(false)
  const [creandoCaso, setCreandoCaso] = useState<string | null>(null)
  const [casoCreado, setCasoCreado] = useState<any>(null)
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
                  .filter((t: any) => t.userId)
                  .map((t: any) => ({ id: t.userId, username: t.nombre, rol: t.rol }))
                setUsuarios(users)
              }
            })
        }
      })
  }, [])

  const alertaRows = useMemo(() => calcularAlertas(pedidos), [pedidos])

  const filtrados = alertaRows
    .filter((row) => {
      const matchSearch = !searchTerm ||
        row.nombreCli.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.telefonoCli?.includes(searchTerm)
      const matchSeveridad = filtroSeveridad === 'TODAS' || row.severidadMasAlta === filtroSeveridad
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
      const data = await res.json()
      if (data.success) {
        const clienteData = pedidos.find(p => p.clienteId === clienteId)
        const pedidoData = pedidos.find(p => p.id === alerta.pedidoId)
        setCasoCreado({
          ...data.caso,
          cliente: clienteData ? { id: clienteData.clienteId, nombre: clienteData.nombreCli, telefono: clienteData.telefonoCli } : null,
          pedido: pedidoData ? { id: pedidoData.id, numero: pedidoData.numero, total: String(pedidoData.total) } : null,
        })
      }
    } catch {
    } finally {
      setCreandoCaso(null)
    }
  }

  const getContextData = (clienteId: string, alerta: AlertaItem) => {
    const pedidoData = pedidos.find(p => p.id === alerta.pedidoId)
    return {
      pedidoDisputa: pedidoData?.disputaAbierta ?? undefined,
      pedidoEstadoPago: pedidoData?.estadoPago ?? undefined,
      clienteConSaldo: pedidos.some(p => p.clienteId === clienteId && Number(p.saldo) > 0),
    }
  }

  const handleStatusChange = (casoId: string, newStatus: string) => {
    if (casoCreado && casoCreado.id === casoId) {
      setCasoCreado({ ...casoCreado, status: newStatus })
    }
  }

  return (
    <div className="space-y-4">
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
            onChange={(e) => setFiltroSeveridad(e.target.value as any)}
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">Sin alertas activas</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            No se detectaron comportamientos inusuales en el período analizado.
          </p>
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 max-w-md mx-auto text-left">
            <p className="font-medium mb-1">¿Por qué no veo alertas?</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Necesitas 2+ pedidos del mismo cliente en el mismo día</li>
              <li>O un pedido con valor mayor al doble del promedio habitual</li>
              <li>O 2+ pedidos fiados en los últimos 7 días</li>
              <li>O un cliente con estado de pago "VENCIDO"</li>
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
                <React.Fragment key={row.clienteId}>
                  <tr className="hover:bg-gray-50 transition">
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
                        onClick={() => setExpandedCliente(expandedCliente === row.clienteId ? null : row.clienteId)}
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
                          {row.alertas.map((alerta, idx) => (
                            <div key={idx} className="flex items-center justify-between py-2 border-b last:border-b-0">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${getBadgeColorLocal(alerta.severidad)}`}>
                                  {alerta.severidad}
                                </span>
                                <span className="text-sm font-medium">{getTipoLabel(alerta.tipo)}</span>
                                <span className="text-xs text-gray-500 truncate">{alerta.detalle}</span>
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
                                      onClick={() => { ignorarAlerta(row.clienteId, alerta.tipo); window.location.reload() }}
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
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
                onClick={() => setExpandedCliente(expandedCliente === row.clienteId ? null : row.clienteId)}
                className="w-full text-sm text-blue-600 bg-blue-50 py-2 rounded-lg"
              >
                {expandedCliente === row.clienteId ? 'Ocultar' : 'Ver detalle'}
              </button>
              {expandedCliente === row.clienteId && (
                <div className="mt-3 space-y-2 bg-gray-50 p-3 rounded-lg">
                  {row.alertas.map((alerta, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm py-1 border-b last:border-b-0">
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
                            <button onClick={() => { ignorarAlerta(row.clienteId, alerta.tipo); window.location.reload() }} className="text-xs text-gray-400">Ignorar</button>
                          )}
                        <span className="text-xs text-gray-400">{new Date(alerta.fecha).toLocaleDateString('es-CO')}</span>
                      </div>
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
          contextData={casoCreado.alertaTipo ? getContextData(casoCreado.clienteId || '', { tipo: casoCreado.alertaTipo, severidad: casoCreado.severidad, detalle: casoCreado.descripcion || '', fecha: new Date().toISOString(), pedidoId: casoCreado.pedidoId }) : undefined}
          usuarios={usuarios}
          onClose={() => setCasoCreado(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
