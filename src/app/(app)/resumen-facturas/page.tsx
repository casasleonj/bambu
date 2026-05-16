'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import './print.css'

interface FacturaResumen {
  id: string
  numero: string
  fecha: string
  total: number
  montoPagado: number
  saldo: number
  estado: string
  pedidoNumero: number | null
  pedidoId: string | null
  desfase: {
    facturaSaldo: number
    pedidoSaldo: number | null
    facturaPagado: number
    pedidoPagado: number | null
  } | null
}

interface ClienteResumen {
  id: string
  nombre: string
  apellido: string | null
  telefono: string
  direccion: string | null
  barrio: string | null
  nombreNegocio: string | null
}

interface EmpresaResumen {
  nombre: string
  nit: string
  direccion: string
  telefono: string
  email: string
}

interface TotalesResumen {
  total: number
  totalPagado: number
  saldo: number
  count: number
}

interface ResumenData {
  cliente: ClienteResumen
  periodo: { desde: string; hasta: string }
  facturas: FacturaResumen[]
  totales: TotalesResumen
  empresa: EmpresaResumen
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function generateResumenNumber(): string {
  const now = new Date()
  const datePart = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).replace(/-/g, '')
  const storageKey = `resumen-counter-${datePart}`
  let counter = parseInt(sessionStorage.getItem(storageKey) || '0', 10) + 1
  sessionStorage.setItem(storageKey, counter.toString())
  return `RES-${datePart}-${counter.toString().padStart(3, '0')}`
}

function formatDateTime(): string {
  return new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`h-4 bg-gray-200 rounded animate-pulse ${className}`} />
}

export default function ResumenFacturasPage() {
  const searchParams = useSearchParams()
  const clienteId = searchParams.get('clienteId')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  const [data, setData] = useState<ResumenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resumenNumber] = useState(() => generateResumenNumber())
  const [generatedAt] = useState(() => formatDateTime())

  const fetchData = useCallback(async () => {
    if (!clienteId || !desde || !hasta) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/clientes/${clienteId}/resumen-facturas?desde=${desde}&hasta=${hasta}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Error del servidor' } }))
        throw new Error(err.error?.message || `Error ${res.status}`)
      }
      const json = await res.json()
      if (!json.success) {
        throw new Error(json.error?.message || 'Respuesta inválida del servidor')
      }
      setData(json)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [clienteId, desde, hasta])

  useEffect(() => { fetchData() }, [fetchData])

  const handlePrint = () => { window.print() }
  const handleRetry = () => { fetchData() }

  if (!clienteId || !desde || !hasta) {
    return (
      <div className="p-8 text-center text-gray-500">
        Parámetros incompletos.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center print:hidden">
          <SkeletonLine className="w-64 h-8" />
          <div className="flex gap-2">
            <SkeletonLine className="w-20 h-10" />
            <SkeletonLine className="w-40 h-10" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex justify-between">
            <div className="space-y-2 flex-1">
              <SkeletonLine className="w-48 h-6" />
              <SkeletonLine className="w-32 h-4" />
              <SkeletonLine className="w-40 h-4" />
            </div>
            <div className="space-y-2 text-right">
              <SkeletonLine className="w-36 h-4 ml-auto" />
              <SkeletonLine className="w-48 h-4 ml-auto" />
            </div>
          </div>
          <SkeletonLine className="w-full h-24" />
          <SkeletonLine className="w-full h-32" />
          <SkeletonLine className="w-64 h-20 ml-auto" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-md mx-auto">
          <svg className="w-12 h-12 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-red-800 font-medium mb-1">No se pudo cargar el resumen</p>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => window.history.back()}>Volver</Button>
            <Button onClick={handleRetry}>Reintentar</Button>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-gray-500">No se pudo cargar el resumen.</div>
    )
  }

  const { cliente, periodo, facturas, totales, empresa } = data

  return (
    <div className="p-4 space-y-4">
      {/* Header de app — no imprimible */}
      <div className="flex justify-between items-center print:hidden">
        <h1 className="text-2xl font-bold">Resumen Consolidado de Facturas</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.history.back()}>Volver</Button>
          <Button onClick={handlePrint}>
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir / Guardar PDF
          </Button>
        </div>
      </div>

      {/* KPIs — no imprimibles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total facturado</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(totales.total)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{totales.count} factura{totales.count !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total pagado</p>
          <p className="text-lg font-bold text-green-700 mt-1">{formatCurrency(totales.totalPagado)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Saldo pendiente</p>
          <p className={`text-lg font-bold mt-1 ${totales.saldo > 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatCurrency(totales.saldo)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Cobranza</p>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${totales.total > 0 ? Math.round((totales.totalPagado / totales.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {totales.total > 0 ? Math.round((totales.totalPagado / totales.total) * 100) : 0}% cobrado
            </p>
          </div>
        </div>
      </div>

      {/* Estado vacío */}
      {facturas.length === 0 && (
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 font-medium">No hay facturas de <span className="font-bold">{cliente.nombre}</span></p>
          <p className="text-gray-400 text-sm mt-1">entre {formatDate(periodo.desde)} y {formatDate(periodo.hasta)}</p>
        </div>
      )}

      {/* Documento imprimible */}
      {facturas.length > 0 && (
        <div className="bg-white rounded-xl shadow print:shadow-none print:rounded-none print:border-0">
          <div className="p-6 print:p-4">
            {/* Header del documento */}
            <div className="border-b-2 border-gray-800 pb-4 mb-4 doc-header">
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-4">
                  <img src="/logo-agua-bambu.jpg" alt="Logo" className="h-14 w-auto object-contain print:h-20" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{empresa.nombre}</h2>
                    <p className="text-sm text-gray-600">NIT: {empresa.nit}</p>
                    {empresa.direccion && <p className="text-xs text-gray-500">{empresa.direccion}</p>}
                    {empresa.telefono && <p className="text-xs text-gray-500">Tel: {empresa.telefono}</p>}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="font-bold text-gray-900 uppercase tracking-wider text-base">Resumen Consolidado de Cuenta</p>
                  <p className="text-gray-600 mt-1">{resumenNumber}</p>
                  <p className="text-gray-500 text-xs">Generado: {generatedAt}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-6 text-xs text-gray-600">
                <span><strong>Período de facturas:</strong> {formatDate(periodo.desde)} — {formatDate(periodo.hasta)}</span>
              </div>
            </div>

            {/* Datos del cliente */}
            <div className="border border-gray-300 rounded-lg p-4 mb-4 print:border-gray-400">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Datos del cliente</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div>
                  <span className="text-gray-500">Nombre:</span>{' '}
                  <Link href={`/clientes?openCliente=${cliente.id}`} className="font-medium text-blue-600 hover:underline">
                    {cliente.nombre} {cliente.apellido || ''}
                  </Link>
                </div>
                {cliente.nombreNegocio && (
                  <div>
                    <span className="text-gray-500">Negocio:</span>{' '}
                    <span className="font-medium">{cliente.nombreNegocio}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Teléfono:</span>{' '}
                  <span className="font-medium">{cliente.telefono}</span>
                </div>
                {(cliente.direccion || cliente.barrio) && (
                  <div>
                    <span className="text-gray-500">Dirección:</span>{' '}
                    <span className="font-medium">{[cliente.direccion, cliente.barrio].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tabla de facturas */}
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border border-gray-300 print:border-gray-400">
                <thead className="bg-gray-100 print:bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 text-xs uppercase tracking-wider border-b border-gray-300"># Factura</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 text-xs uppercase tracking-wider border-b border-gray-300"># Pedido</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 text-xs uppercase tracking-wider border-b border-gray-300">Fecha</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 text-xs uppercase tracking-wider border-b border-gray-300">Total</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 text-xs uppercase tracking-wider border-b border-gray-300">Pagado</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 text-xs uppercase tracking-wider border-b border-gray-300">Saldo</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700 text-xs uppercase tracking-wider border-b border-gray-300 print:hidden print:no-desfase" title="Desfase Factura vs Pedido">⚠️</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700 text-xs uppercase tracking-wider border-b border-gray-300">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((f, i) => (
                    <tr key={f.id} className={`print:break-inside-avoid ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50 print:bg-white'}`}>
                      <td className="px-3 py-2 font-medium border-b border-gray-100 print:border-gray-200">
                        <Link href={`/facturas?openFactura=${f.id}`} className="text-blue-600 hover:underline">
                          {f.numero}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-600 border-b border-gray-100 print:border-gray-200">
                        {f.pedidoNumero && f.pedidoId ? (
                          <Link href={`/pedidos?openPedido=${f.pedidoId}`} className="text-blue-600 hover:underline">
                            #{f.pedidoNumero}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 border-b border-gray-100 print:border-gray-200">{formatDate(f.fecha)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 border-b border-gray-100 print:border-gray-200">{formatCurrency(f.total)}</td>
                      <td className="px-3 py-2 text-right text-gray-600 border-b border-gray-100 print:border-gray-200">{formatCurrency(f.montoPagado)}</td>
                      <td className="px-3 py-2 text-right font-medium border-b border-gray-100 print:border-gray-200">
                        <span className={f.saldo > 0 ? 'text-red-600' : 'text-green-700'}>
                          {f.saldo > 0 ? formatCurrency(f.saldo) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center border-b border-gray-100 print:border-gray-200 print:hidden print:no-desfase">
                        {f.desfase ? (
                          <span className="relative group cursor-help" title={`Saldo: Factura=${formatCurrency(f.desfase.facturaSaldo)} ≠ Pedido=${f.desfase.pedidoSaldo !== null ? formatCurrency(f.desfase.pedidoSaldo) : 'N/A'} | Pagado: Factura=${formatCurrency(f.desfase.facturaPagado)} ≠ Pedido=${f.desfase.pedidoPagado !== null ? formatCurrency(f.desfase.pedidoPagado) : 'N/A'}`}>
                            <span className="text-red-500 font-bold">⚠️</span>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 bg-gray-900 text-white text-xs rounded-lg py-2 px-3 z-10 whitespace-normal">
                              <strong>Desfase detectado</strong><br/>
                              Saldo: Factura={formatCurrency(f.desfase.facturaSaldo)} ≠ Pedido={f.desfase.pedidoSaldo !== null ? formatCurrency(f.desfase.pedidoSaldo) : 'N/A'}<br/>
                              Pagado: Factura={formatCurrency(f.desfase.facturaPagado)} ≠ Pedido={f.desfase.pedidoPagado !== null ? formatCurrency(f.desfase.pedidoPagado) : 'N/A'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-green-500">✓</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-xs font-medium text-gray-600 border-b border-gray-100 print:border-gray-200">
                        {f.estado}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales */}
            <div className="flex justify-end mb-6 doc-totales">
              <div className="w-full max-w-sm border-2 border-gray-800 rounded-lg p-4 print:border-gray-600">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Facturas incluidas:</span>
                    <span className="font-medium">{totales.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total facturado:</span>
                    <span className="font-semibold">{formatCurrency(totales.total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total pagado:</span>
                    <span className="font-semibold text-green-700">{formatCurrency(totales.totalPagado)}</span>
                  </div>
                  <div className="border-t-2 border-gray-800 pt-2 mt-2 print:border-gray-600">
                    <div className="flex justify-between text-base">
                      <span className="font-bold text-gray-800 uppercase">
                        {totales.saldo > 0 ? 'Saldo pendiente' : 'Cuenta al día'}
                      </span>
                      <span className={`font-bold text-lg ${totales.saldo > 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {formatCurrency(totales.saldo)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Firma */}
            <div className="mt-12 pt-4 border-t border-gray-300 print:border-gray-400 doc-firma">
              <div className="grid grid-cols-2 gap-8 text-sm">
                <div>
                  <p className="text-gray-500 mb-8">Recibido por:</p>
                  <div className="border-t border-gray-400 pt-1">
                    <p className="text-xs text-gray-400">Nombre y firma del cliente</p>
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 mb-8">Fecha de recibido:</p>
                  <div className="border-t border-gray-400 pt-1">
                    <p className="text-xs text-gray-400">DD / MM / AAAA</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Nota legal */}
            <div className="mt-8 pt-3 border-t border-gray-200 text-[10px] text-gray-400 print:text-gray-500 doc-nota">
              <p>
                Este documento es un resumen informativo de las facturas individuales emitidas en el período indicado.
                Cada factura listada es un documento soporte contable independiente. Para fines fiscales o contables, refiérase a las facturas originales.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
