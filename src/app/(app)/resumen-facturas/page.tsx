'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { canCompartirResumenFacturas } from '@/lib/permissions'
import './print.css'
import { FacturaCard, ResumenHero, money, type FacturaVisual } from './resumen-visual'
import { CompartirWhatsapp } from './compartir-whatsapp'

interface FacturaResumen extends Omit<FacturaVisual, 'fechaTxt'> {
  fecha: string
  pedidoNumero: number | null
  pedidoId: string | null
}

interface ClienteResumen {
  id: string
  nombre: string
  apellido: string | null
  telefono: string
  direccion: string | null
  barrio: string | null
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

type EstadoTab = 'POR_COBRAR' | 'PAGADA' | 'ANULADA' | 'TODAS'

// «Todas» = solo las vigentes (por cobrar + pagadas): los conteos de las pestañas cuadran entre sí (#977).
const TABS: { key: EstadoTab; label: string }[] = [
  { key: 'POR_COBRAR', label: 'Por cobrar' },
  { key: 'PAGADA', label: 'Pagadas' },
  { key: 'ANULADA', label: 'Anuladas' },
  { key: 'TODAS', label: 'Vigentes' },
]

/** Cuántas facturas se ven de entrada en pantalla; el PDF y la impresión llevan todas. */
const FILAS_INICIALES = 5

function esEstadoTab(v: string | null): v is EstadoTab {
  return v === 'POR_COBRAR' || v === 'PAGADA' || v === 'ANULADA' || v === 'TODAS'
}

/** Enlaces anteriores: EMITIDA/PARCIAL sueltas pasan a «Por cobrar». Sin estado = «Por cobrar». */
function estadoDeEnlace(v: string | null): EstadoTab {
  if (esEstadoTab(v)) return v
  return 'POR_COBRAR'
}

interface AnuladasResumen {
  count: number
  totalHistorico: number
}

interface EncabezadoApi {
  etiqueta: string
  monto: number
  tono: 'debe' | 'alDia' | 'neutro'
  nota: string
  datos: { etiqueta: string; valor: string | number; formato: 'numero' | 'fecha' | 'dinero' }[]
}

interface ResumenData {
  cliente: ClienteResumen
  periodo: { desde: string | null; hasta: string | null }
  filtro: { estado: string }
  encabezado: EncabezadoApi
  conteos: Record<'EMITIDA' | 'PARCIAL' | 'PAGADA' | 'ANULADA', number>
  facturas: FacturaResumen[]
  totales: TotalesResumen
  anuladas: AnuladasResumen
  empresa: EmpresaResumen
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** "Historial completo" sin fechas; "desde X", "hasta Y" o "X — Y" según el rango. */
function formatPeriodo(desde: string | null, hasta: string | null): string {
  if (desde && hasta) return `${formatDate(desde)} — ${formatDate(hasta)}`
  if (desde) return `Desde ${formatDate(desde)}`
  if (hasta) return `Hasta ${formatDate(hasta)}`
  return 'Historial completo'
}

function generateResumenNumber(): string {
  const now = new Date()
  const datePart = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).replace(/-/g, '')
  if (typeof window === 'undefined') {
    // SSR: sin sessionStorage, generamos un número basado en timestamp
    const fallback = now.getTime().toString(36).slice(-4).toUpperCase()
    return `RES-${datePart}-${fallback}`
  }
  const storageKey = `resumen-counter-${datePart}`
  const counter = parseInt(sessionStorage.getItem(storageKey) || '0', 10) + 1
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
  const router = useRouter()
  const { data: session } = useSession()
  const puedeCompartir = canCompartirResumenFacturas((session?.user as { role?: string } | undefined)?.role)
  const clienteId = searchParams.get('clienteId')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')
  // Sin `estado` = «Por cobrar» (#977): lo primero que se quiere saber es qué se debe.
  const estado: EstadoTab = estadoDeEnlace(searchParams.get('estado')?.toUpperCase() ?? null)

  const [data, setData] = useState<ResumenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resumenNumber] = useState(() => generateResumenNumber())
  const [generatedAt] = useState(() => formatDateTime())
  const [mostrarTodas, setMostrarTodas] = useState(false)

  const fetchData = useCallback(async () => {
    if (!clienteId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const query = new URLSearchParams()
      if (desde) query.set('desde', desde)
      if (hasta) query.set('hasta', hasta)
      query.set('estado', estado)
      const qs = query.toString()
      const res = await fetch(`/api/clientes/${clienteId}/resumen-facturas${qs ? `?${qs}` : ''}`)
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
  }, [clienteId, desde, hasta, estado])

  useEffect(() => {
    // Fetch de datos al montar / cambiar clienteId-desde-hasta — side
    // effect de red real, no derivable durante el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  const handlePrint = () => { window.print() }
  const handleTab = (key: EstadoTab) => {
    const q = new URLSearchParams(searchParams.toString())
    q.set('estado', key)
    q.delete('incluirAnuladas')
    setMostrarTodas(false)
    router.replace(`/resumen-facturas?${q.toString()}`)
  }
  const handleRetry = () => { fetchData() }

  if (!clienteId) {
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

  const { cliente, periodo, facturas, totales, anuladas, conteos, empresa, encabezado } = data
  const estadoNombre = TABS.find((t) => t.key === estado)?.label ?? 'Por cobrar'
  const conteoTab: Record<EstadoTab, number> = {
    POR_COBRAR: conteos.EMITIDA + conteos.PARCIAL,
    PAGADA: conteos.PAGADA,
    ANULADA: conteos.ANULADA,
    TODAS: conteos.EMITIDA + conteos.PARCIAL + conteos.PAGADA,
  }
  const verTodas = mostrarTodas || facturas.length <= FILAS_INICIALES
  const ocultas = facturas.length - FILAS_INICIALES
  const datosHero = encabezado.datos.map((d) => ({
    etiqueta: d.etiqueta,
    texto: d.formato === 'dinero' ? money(Number(d.valor)) : d.formato === 'fecha' ? formatDate(String(d.valor)) : String(d.valor),
  }))
  const textoCliente = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ')

  return (
    <div className="p-4 space-y-4">
      {/* Controles de la app: solo en pantalla */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-bold">Resumen Consolidado de Facturas</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.history.back()}>Volver</Button>
          {/* Las anuladas son de consulta interna: no se comparten con el cliente (#977). */}
          {puedeCompartir && estado !== 'ANULADA' && (
            <CompartirWhatsapp
              clienteId={cliente.id}
              clienteNombre={textoCliente}
              telefono={cliente.telefono}
              estado={estado}
              desde={desde}
              hasta={hasta}
              facturas={totales.count}
              saldo={totales.saldo}
            />
          )}
          <Button onClick={handlePrint}>
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir / Guardar PDF
          </Button>
        </div>
      </div>

      {/* Filtro por estado: el documento sigue la pestaña (#977) */}
      <div className="print:hidden" data-testid="resumen-tabs-bloque">
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap" role="tablist" aria-label="Filtrar por estado" data-testid="resumen-tabs">
          {TABS.map((t) => {
            const activa = estado === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={activa}
                data-testid={`resumen-tab-${t.key}`}
                onClick={() => handleTab(t.key)}
                className={`min-h-11 shrink-0 px-4 rounded-full text-sm font-semibold border transition whitespace-nowrap ${
                  activa ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-400 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.label} ({conteoTab[t.key]})
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-gray-600">
          {estado === 'ANULADA'
            ? 'Las anuladas son de consulta interna: no son venta ni deuda y no se comparten con el cliente.'
            : `Las ${conteos.ANULADA} anuladas no suman. «Vigentes» = por cobrar + pagadas.`}
        </p>
      </div>

      {/* Estado vacío */}
      {facturas.length === 0 && (
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 font-medium">No hay facturas «{estadoNombre}» de <span className="font-bold">{cliente.nombre}</span></p>
          <p className="text-gray-600 text-sm mt-1">Período: {formatPeriodo(periodo.desde, periodo.hasta)}</p>
        </div>
      )}

      {/* El documento: es lo que recibe el cliente, igual en pantalla, impresión y PDF */}
      {facturas.length > 0 && (
        <div className="space-y-4 print:space-y-3" data-testid="resumen-documento">
          <div className="bg-white rounded-xl shadow print:shadow-none print:rounded-none print:border-0">
            <div className="p-6 print:p-4">
              {/* Membrete */}
              <div className="border-b-2 border-gray-800 pb-4 doc-header">
                {/* #873: donde la fila no cabe (móvil, tableta con barra lateral) el logo/empresa y
                    el título se apilan; desde `lg` y al imprimir siguen en fila. */}
                <div className="flex flex-col gap-y-3 lg:flex-row lg:justify-between lg:items-start print:flex-row print:justify-between print:items-start">
                  <div className="flex items-start gap-3 lg:gap-4 min-w-0 lg:min-w-auto print:gap-4 print:min-w-auto" data-testid="resumen-doc-empresa">
                    <Image src="/logo-agua-bambu.jpg" alt="Logo" width={1280} height={652} className="h-12 lg:h-14 w-auto object-contain print:h-20" />
                    <div className="min-w-0 break-words lg:min-w-auto lg:break-normal print:min-w-auto print:break-normal">
                      <h2 className="text-xl font-bold text-gray-900">{empresa.nombre}</h2>
                      <p className="text-sm text-gray-600">NIT: {empresa.nit}</p>
                      {empresa.direccion && <p className="text-xs text-gray-600">{empresa.direccion}</p>}
                      {empresa.telefono && <p className="text-xs text-gray-600">Tel: {empresa.telefono}</p>}
                    </div>
                  </div>
                  <div className="text-left text-sm lg:text-right print:text-right" data-testid="resumen-doc-titulo">
                    <p className="font-bold text-gray-900 uppercase tracking-wider text-base">Resumen Consolidado de Cuenta</p>
                    <p className="text-gray-600 mt-1">{resumenNumber}</p>
                    <p className="text-gray-600 text-xs">Generado: {generatedAt}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                  <span><strong>Período de facturas:</strong> {formatPeriodo(periodo.desde, periodo.hasta)}</span>
                  <span data-testid="resumen-estado"><strong>Estado:</strong> {estadoNombre}</span>
                </div>
              </div>

              {/* Cliente */}
              <div className="mt-4 rounded-lg border border-gray-300 px-4 py-3 text-sm flex flex-wrap gap-x-6 gap-y-1" data-testid="resumen-cliente">
                <span>
                  <span className="text-gray-600">Cliente:</span>{' '}
                  <Link href={`/clientes?openCliente=${cliente.id}`} className="font-semibold text-blue-700 hover:underline print:text-inherit">
                    {textoCliente}
                  </Link>
                </span>
                <span><span className="text-gray-600">Teléfono:</span> <span className="font-medium">{cliente.telefono}</span></span>
                {(cliente.direccion || cliente.barrio) && (
                  <span>
                    <span className="text-gray-600">Dirección:</span>{' '}
                    <span className="font-medium">{[cliente.direccion, cliente.barrio].filter(Boolean).join(', ')}</span>
                  </span>
                )}
              </div>

              {/* Cifra principal según lo consultado */}
              <div className="mt-4">
                <ResumenHero
                  etiqueta={encabezado.etiqueta}
                  monto={encabezado.monto}
                  tono={encabezado.tono}
                  nota={encabezado.nota}
                  datos={datosHero}
                />
              </div>

              {/* Facturas, con lo que se llevó cada una */}
              <p className="mt-4 mb-2 text-xs text-gray-600" data-testid="resumen-contexto">
                {estadoNombre} ({facturas.length}) · de la más antigua a la más reciente
              </p>
              <div className="space-y-2" data-testid="resumen-tarjetas">
                {facturas.map((f, i) => (
                  <div key={f.id} className={!verTodas && i >= FILAS_INICIALES ? 'hidden print:block' : undefined}>
                    <FacturaCard factura={{ ...f, fechaTxt: formatDate(f.fecha) }} />
                  </div>
                ))}
              </div>

              {!verTodas && (
                <div className="mt-2 print:hidden">
                  <Button
                    variant="outline"
                    className="w-full min-h-12 border-dashed"
                    onClick={() => setMostrarTodas(true)}
                    data-testid="resumen-mostrar-mas"
                  >
                    Mostrar las otras {ocultas} facturas
                  </Button>
                  <p className="mt-1 text-center text-xs text-gray-600">Solo en pantalla: el PDF y la impresión llevan todas.</p>
                </div>
              )}

              {/* Suma de verificación: coincide con la cifra principal */}
              {(estado === 'POR_COBRAR') && (
                <div className="mt-3 flex items-center justify-between border-t-2 border-gray-800 pt-3 text-sm" data-testid="resumen-suma">
                  <span className="text-gray-700">Suma de las {totales.count} por cobrar</span>
                  <strong className="text-base text-red-700">{money(totales.saldo)}</strong>
                </div>
              )}
              {estado === 'TODAS' && anuladas.count > 0 && (
                <p className="mt-3 text-xs text-gray-600" data-testid="resumen-anuladas">
                  Anuladas aparte: {anuladas.count} ({money(anuladas.totalHistorico)}). No son venta ni deuda y no suman.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
