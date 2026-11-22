'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { getTodayString } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { DateRangeFilter } from '@/components/date-range-filter'
import type { Gasto } from './types'
import { categorias } from './types'
import { Modal } from '@/components/modal'
import { CamposGasto, type DatosFormularioGasto } from './campos-gasto'
import { categoriasGastoDisponibles, etiquetaCategoriaGasto } from '@/lib/gastos-categorias'
import { AlertTriangle, Eye, Pencil, Plus, ReceiptText, Tag, Wallet, X } from 'lucide-react'
import { usePollingRefetch } from '@/hooks/use-polling-refetch'

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [showCrear, setShowCrear] = useState(false)
  const [dateRange, setDateRange] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null })
  const [categoria, setCategoria] = useState('')
  const [categoriasRemotas, setCategoriasRemotas] = useState<string[]>([])
  const [notas, setNotas] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [responsable, setResponsable] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [montoTotal, setMontoTotal] = useState(0)
  const [loadingGastos, setLoadingGastos] = useState(true)
  const [errorGastos, setErrorGastos] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const detalleSequence = useRef(0)
  const [detalle, setDetalle] = useState<Gasto | null>(null)
  const [detalleCerrado, setDetalleCerrado] = useState(false)
  const [detalleCargando, setDetalleCargando] = useState(false)
  const [detalleError, setDetalleError] = useState<string | null>(null)
  const [modoDetalle, setModoDetalle] = useState<'VER' | 'EDITAR' | 'ANULAR'>('VER')
  const [editCategoria, setEditCategoria] = useState('OTRO')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editMonto, setEditMonto] = useState('')
  const [editResponsable, setEditResponsable] = useState('')
  const [editNotas, setEditNotas] = useState('')
  const [motivo, setMotivo] = useState('')
  const [motivoOrigen, setMotivoOrigen] = useState<'REGISTRO_DUPLICADO' | 'DINERO_NO_SALIO'>('REGISTRO_DUPLICADO')
  const [confirmarOperacionNoReal, setConfirmarOperacionNoReal] = useState(false)
  const [guardandoDetalle, setGuardandoDetalle] = useState(false)

  const fetchGastos = useCallback(async () => {
    // Descartar respuestas de filtros/páginas anteriores, incluido polling.
    const sequence = ++requestSequence.current
    setLoadingGastos(true)
    setErrorGastos(null)
    try {
      const params = new URLSearchParams()
      if (dateRange.desde) params.set('desde', dateRange.desde)
      if (dateRange.hasta) params.set('hasta', dateRange.hasta)
      if (!dateRange.desde && !dateRange.hasta) params.set('fecha', getTodayString())
      params.set('origen', 'OPERATIVO')
      params.set('page', String(pagina))
      const res = await fetch(`/api/gastos?${params.toString()}`)
      if (!res.ok) throw new Error('No fue posible consultar los gastos. Verifica tu conexión o permisos.')
      const data = await res.json()
      if (!data.success || !Array.isArray(data.data) || typeof data.montoTotal !== 'number') {
        throw new Error('El servidor no entregó el resumen completo de gastos.')
      }
      if (sequence !== requestSequence.current) return
      setGastos(data.data)
      setMontoTotal(data.montoTotal)
      setTotalRegistros(data.total)
      setTotalPaginas(Math.max(1, data.totalPages))
    } catch (e) {
      if (sequence !== requestSequence.current) return
      setErrorGastos(e instanceof Error ? e.message : 'No se pudieron cargar los gastos.')
      setGastos([])
      setMontoTotal(0)
      setTotalRegistros(0)
      setTotalPaginas(1)
    } finally {
      if (sequence === requestSequence.current) setLoadingGastos(false)
    }
  }, [dateRange, pagina])

  const handleDateChange = useCallback((desde: string | null, hasta: string | null) => {
    setPagina(1)
    setDateRange({ desde, hasta })
  }, [])

  useEffect(() => {
    // Fetch de datos al montar / cambiar dateRange — side effect de red
    // real, no derivable durante el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGastos()
  }, [fetchGastos])

  // Polling: refresh gastos every 60s.
  usePollingRefetch(fetchGastos, 60_000)

  const abrirDetalle = useCallback(async (id: string, modo: 'VER' | 'EDITAR' = 'VER') => {
    const sequence = ++detalleSequence.current
    setDetalleCargando(true)
    setDetalleError(null)
    setModoDetalle('VER')
    setDetalle(null)
    try {
      const response = await fetch(`/api/gastos/${encodeURIComponent(id)}`)
      const json = await response.json()
      if (!response.ok || !json.success || !json.gasto) {
        throw new Error(json.error?.message || 'No fue posible abrir este gasto.')
      }
      if (sequence !== detalleSequence.current) return
      const gasto: Gasto = json.gasto
      setDetalle(gasto)
      setModoDetalle(json.diaCerrado === true || gasto.anuladoAt ? 'VER' : modo)
      setDetalleCerrado(json.diaCerrado === true)
      setEditCategoria(gasto.categoria)
      setEditDescripcion(gasto.descripcion)
      setEditMonto(String(gasto.monto))
      setEditResponsable(gasto.responsable ?? '')
      setEditNotas(gasto.notas ?? '')
      setMotivo('')
      setConfirmarOperacionNoReal(false)
      setMotivoOrigen('REGISTRO_DUPLICADO')
    } catch (error) {
      if (sequence === detalleSequence.current) setDetalleError(error instanceof Error ? error.message : 'No fue posible abrir este gasto.')
    } finally {
      if (sequence === detalleSequence.current) setDetalleCargando(false)
    }
  }, [])

  // Abrir el MISMO detalle desde Cierre o una notificación (?openGasto=id).
  useEffect(() => {
    const gastoId = new URLSearchParams(window.location.search).get('openGasto')
    if (!gastoId) return

    // La carga es asíncrona: evitar setState síncrono dentro del efecto
    // (React react-hooks/set-state-in-effect). Cancelar la microtarea si
    // StrictMode desmonta/remonta antes de ejecutarla.
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void abrirDetalle(gastoId)
    })
    return () => { cancelled = true }
  }, [abrirDetalle])

  const opcionesCategoria = categoriasGastoDisponibles([
    ...categorias, ...categoriasRemotas, categoria, editCategoria,
  ])

  useEffect(() => {
    let mounted = true
    fetch('/api/gastos/categorias')
      .then(response => {
        if (!response.ok) throw new Error('Catálogo no disponible')
        return response.json()
      })
      .then(json => { if (mounted && json.success && Array.isArray(json.categorias)) setCategoriasRemotas(json.categorias) })
      .catch(() => { /* Conservamos las opciones base si el catálogo no está disponible. */ })
    return () => { mounted = false }
  }, [])

  function cambiarNuevo(clave: keyof DatosFormularioGasto, valor: string) {
    if (clave === 'categoria') setCategoria(valor)
    else if (clave === 'descripcion') setDescripcion(valor)
    else if (clave === 'monto') setMonto(valor)
    else if (clave === 'responsable') setResponsable(valor)
    else if (clave === 'notas') setNotas(valor)
  }

  function cambiarEdit(clave: keyof DatosFormularioGasto, valor: string) {
    if (clave === 'categoria') setEditCategoria(valor)
    else if (clave === 'descripcion') setEditDescripcion(valor)
    else if (clave === 'monto') setEditMonto(valor)
    else if (clave === 'responsable') setEditResponsable(valor)
    else if (clave === 'notas') setEditNotas(valor)
  }

  function cerrarCrear() {
    if (submitting) return
    if ((categoria || descripcion || monto || responsable || notas) &&
      !window.confirm('¿Descartar el gasto sin guardar?')) return
    setShowCrear(false)
  }

  const detalleModificado = detalle && modoDetalle === 'EDITAR' && (
    editCategoria !== detalle.categoria || editDescripcion !== detalle.descripcion ||
    editMonto !== String(detalle.monto) || editResponsable !== (detalle.responsable ?? '') ||
    editNotas !== (detalle.notas ?? '') || motivo.trim().length > 0
  )

  function cancelarCorreccion() {
    if (guardandoDetalle) return
    if ((detalleModificado || (modoDetalle === 'ANULAR' && (motivo || confirmarOperacionNoReal))) &&
      !window.confirm('¿Descartar los cambios sin guardar?')) return
    if (detalle) {
      setEditCategoria(detalle.categoria)
      setEditDescripcion(detalle.descripcion)
      setEditMonto(String(detalle.monto))
      setEditResponsable(detalle.responsable ?? '')
      setEditNotas(detalle.notas ?? '')
    }
    setMotivo('')
    setConfirmarOperacionNoReal(false)
    setModoDetalle('VER')
    setDetalleError(null)
  }

  function cerrarDetalle() {
    if (guardandoDetalle) return
    if ((detalleModificado || (modoDetalle === 'ANULAR' && (motivo || confirmarOperacionNoReal))) &&
      !window.confirm('¿Descartar los cambios sin guardar?')) return
    ++detalleSequence.current
    setDetalle(null)
    setDetalleCargando(false)
    setDetalleError(null)
    setModoDetalle('VER')
    const url = new URL(window.location.href)
    url.searchParams.delete('openGasto')
    window.history.replaceState(window.history.state, '', url)
  }

  async function guardarCorreccion(event?: React.FormEvent) {
    event?.preventDefault()
    if (!detalle || typeof detalle.version !== 'number') {
      setDetalleError('Actualiza el detalle antes de corregir este gasto.')
      return
    }
    if (detalleCerrado || detalle.anuladoAt) {
      setDetalleError('El gasto no admite correcciones desde esta pantalla.')
      return
    }
    if (motivo.trim().length < 5) {
      setDetalleError('Explica el motivo de la corrección (al menos cinco caracteres).')
      return
    }
    if (modoDetalle === 'ANULAR' && !confirmarOperacionNoReal) {
      setDetalleError('Confirma que NO es una salida adicional de dinero antes de anular.')
      return
    }
    setGuardandoDetalle(true)
    setDetalleError(null)
    try {
      const body = modoDetalle === 'EDITAR'
        ? {
            accion: 'EDITAR', version: detalle.version, motivo: motivo.trim(),
            categoria: editCategoria, descripcion: editDescripcion.trim(),
            monto: Number(editMonto), responsable: editResponsable.trim(),
            notas: editNotas.trim(),
          }
        : {
            accion: 'ANULAR', version: detalle.version, motivo: motivo.trim(),
            motivoOrigen, confirmarOperacionNoReal: true,
          }
      const response = await fetch(`/api/gastos/${encodeURIComponent(detalle.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await response.json()
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || 'No se pudo guardar el cambio.')
      }
      toast.success(modoDetalle === 'ANULAR' ? 'Gasto anulado con trazabilidad' : 'Gasto corregido')
      await abrirDetalle(detalle.id)
      void fetchGastos()
    } catch (error) {
      setDetalleError(error instanceof Error ? error.message : 'Error guardando corrección')
    } finally {
      setGuardandoDetalle(false)
    }
  }

  const crearGasto = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!categoria || !descripcion.trim() || !monto) {
      toast.error('Selecciona categoría, concepto y valor del gasto')
      return
    }
    const montoNum = parseFloat(monto)
    if (isNaN(montoNum) || montoNum <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria, descripcion: descripcion.trim(), monto: montoNum, responsable: responsable.trim(), notas: notas.trim() }),
      })
      if (res.ok) {
        setShowCrear(false)
        setCategoria('')
        setDescripcion('')
        setMonto('')
        setResponsable('')
        setNotas('')
        setCategoriasRemotas(actual => categoriasGastoDisponibles([...actual, categoria]))
        setPagina(1)
        void fetchGastos()
        toast.success('Gasto registrado')
      } else {
        const json = await res.json().catch(() => null)
        toast.error(json?.error?.message || 'No se pudo registrar el gasto')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error registrando gasto')
    }
    setSubmitting(false)
  }


  const iconoCategoria: Record<string, string> = {
    ARRIENDO: '🏠', SERVICIOS: '💡', INSUMOS: '📦',
    MANTENIMIENTO: '🔧', TRANSPORTE: '🚚', OTRO: '🧾',
  }
  const fechaGasto = (fecha: string) => new Date(fecha).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-7 w-7 text-blue-600" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gastos operativos</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">Los pagos al personal se administran en Nómina.</p>
        </div>
        <Button className="gap-2 rounded-xl font-semibold shadow-sm" onClick={() => setShowCrear(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo gasto
        </Button>
      </header>

      <section aria-label="Filtrar gastos" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <DateRangeFilter onDateChange={handleDateChange} formatoColombia soloHistorico />
      </section>

      <Modal open={showCrear} onClose={cerrarCrear} title="Nuevo gasto operativo"
        className="mx-auto my-2 max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl sm:my-6">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Nuevo gasto</h2>
            <p className="text-xs text-slate-600">Completa los datos de la salida operativa.</p>
          </div>
          <button type="button" aria-label="Cerrar formulario" onClick={cerrarCrear}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={crearGasto}>
          <div className="px-4 py-4 sm:px-6">
            <CamposGasto prefijo="gasto" datos={{ categoria, descripcion, monto, responsable, notas }}
              cambiar={cambiarNuevo} categorias={opcionesCategoria} bloqueado={submitting} />
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
            <Button type="button" variant="outline" className="flex-1" onClick={cerrarCrear}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={submitting || !categoria || !descripcion.trim() || !monto}>
              {submitting ? 'Guardando…' : 'Guardar gasto'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={detalleCargando || !!detalle || !!detalleError} onClose={cerrarDetalle}
        title={modoDetalle === 'EDITAR' ? 'Corregir gasto' : modoDetalle === 'ANULAR' ? 'Anular gasto' : 'Detalle del gasto'}
        data-testid="gasto-detalle"
        className="mx-auto my-2 max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl sm:my-6">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {modoDetalle === 'EDITAR' ? 'Corregir gasto' : modoDetalle === 'ANULAR' ? 'Anular registro' : 'Detalle del gasto'}
            </h2>
            <p className="text-xs text-slate-600">
              {detalle ? fechaGasto(detalle.fecha) : 'Consultando registro…'}
            </p>
          </div>
          <button type="button" aria-label="Cerrar detalle" onClick={cerrarDetalle}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {detalleCargando && <p role="status" className="px-6 py-10 text-center text-sm text-slate-600">Cargando gasto…</p>}
        {detalleError && <p role="alert" className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{detalleError}</p>}
        {detalle && !detalleCargando && (
          <div>
            {detalleCerrado && <p className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              Esta jornada ya tiene cierre. El registro original es de solo lectura; los ajustes se gestionan por separado.
            </p>}
            {detalle.anuladoAt && <p className="mx-4 mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
              Gasto anulado. Valor original: {formatCurrency(Number(detalle.montoAntesAnular ?? 0))}.
            </p>}

            {modoDetalle === 'VER' ? (
              <div className="space-y-4 px-4 py-5 sm:px-6">
                <div className="rounded-xl bg-blue-50 p-4">
                  <span className="text-xs font-semibold text-blue-800">{etiquetaCategoriaGasto(detalle.categoria)}</span>
                  <h3 className="mt-1 break-words text-lg font-semibold text-slate-900">{detalle.descripcion}</h3>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                    {detalle.anuladoAt ? 'Anulado' : formatCurrency(Number(detalle.monto))}
                  </p>
                </div>
                {detalle.responsable && <p className="text-sm text-slate-700">
                  <strong>Persona asociada (dato registrado):</strong> {detalle.responsable}
                </p>}
                {detalle.notas && <p className="break-words text-sm text-slate-700">
                  <strong>Notas:</strong> {detalle.notas}
                </p>}
                <div className="flex flex-wrap gap-2">
                  {!detalleCerrado && !detalle.anuladoAt && <>
                    <Button type="button" onClick={() => { setModoDetalle('EDITAR'); setDetalleError(null) }}>
                      <Pencil aria-hidden="true" className="mr-2 h-4 w-4" /> Corregir
                    </Button>
                    <Button type="button" variant="outline" className="text-red-700"
                      onClick={() => { setModoDetalle('ANULAR'); setDetalleError(null) }}>
                      Anular registro
                    </Button>
                  </>}
                  <Button type="button" variant="outline" onClick={cerrarDetalle}>Cerrar</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={guardarCorreccion}>
                <div className="space-y-4 px-4 py-4 sm:px-6">
                  {modoDetalle === 'EDITAR' ? (
                    <CamposGasto prefijo="editar" legado
                      datos={{ categoria: editCategoria, descripcion: editDescripcion, monto: editMonto,
                        responsable: editResponsable, notas: editNotas }}
                      cambiar={cambiarEdit} categorias={opcionesCategoria} bloqueado={guardandoDetalle} />
                  ) : (
                    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                      <p className="font-semibold">Solo anula un registro duplicado o un dinero que nunca salió.</p>
                      <label htmlFor="gasto-motivo-origen" className="block font-semibold">¿Por qué se anula?</label>
                      <select id="gasto-motivo-origen" className="h-11 w-full rounded-lg border border-amber-300 bg-white px-3"
                        value={motivoOrigen} onChange={event => setMotivoOrigen(event.target.value as 'REGISTRO_DUPLICADO' | 'DINERO_NO_SALIO')}>
                        <option value="REGISTRO_DUPLICADO">Registro duplicado</option>
                        <option value="DINERO_NO_SALIO">El dinero nunca salió</option>
                      </select>
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1" checked={confirmarOperacionNoReal}
                          onChange={event => setConfirmarOperacionNoReal(event.target.checked)} />
                        Confirmo que este registro no corresponde a otra salida real de dinero.
                      </label>
                    </div>
                  )}
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <label htmlFor="gasto-motivo-ajuste" className="mb-1 block text-sm font-semibold text-slate-800">
                      Motivo de {modoDetalle === 'ANULAR' ? 'la anulación' : 'la corrección'} *
                    </label>
                    <textarea id="gasto-motivo-ajuste" required minLength={5} maxLength={450} rows={2}
                      value={motivo} disabled={guardandoDetalle}
                      onChange={event => setMotivo(event.target.value)}
                      placeholder="Explica qué dato estaba equivocado"
                      className="min-h-20 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                  </div>
                </div>
                <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                  <Button type="button" variant="outline" className="flex-1"
                    onClick={cancelarCorreccion}>Cancelar</Button>
                  <Button type="submit" variant={modoDetalle === 'ANULAR' ? 'destructive' : 'default'}
                    className="flex-1" disabled={guardandoDetalle || (modoDetalle === 'ANULAR' && !confirmarOperacionNoReal)}>
                    {guardandoDetalle ? 'Guardando…' : modoDetalle === 'ANULAR' ? 'Confirmar anulación' : 'Guardar corrección'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>

      <section aria-label="Resumen de gastos" className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
          <Wallet aria-hidden="true" className="h-5 w-5" />
          Total de gastos operativos del período
        </div>
        <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900"
          data-testid="gastos-monto-total">{formatCurrency(montoTotal)}</p>
        <p className="mt-1 text-sm text-slate-600">
          {totalRegistros} registros en el período, incluidos anulados. No equivale al efectivo de caja.
        </p>
      </section>

      {errorGastos && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{errorGastos}</p>
          <Button className="mt-3" variant="outline" onClick={() => void fetchGastos()}>Reintentar</Button>
        </div>
      )}
      {loadingGastos ? (
        <p role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Cargando gastos…
        </p>
      ) : errorGastos ? null : gastos.length === 0 ? (
        <EmptyState
          icon={<ReceiptText aria-hidden="true" className="h-12 w-12" />}
          title={dateRange.desde && dateRange.hasta ? 'No hay gastos en el rango seleccionado' : 'No hay gastos registrados hoy'}
          description="Puedes registrar un gasto operativo nuevo."
          actionLabel="+ Nuevo gasto"
          onAction={() => setShowCrear(true)}
        />
      ) : (
        <section aria-label="Lista de gastos" className="space-y-3">
          <p className="text-xs text-slate-600" data-testid="gastos-resumen-pagina">
            Mostrando {gastos.length} de {totalRegistros} registros · página {pagina} de {totalPaginas}
          </p>
          {gastos.map(gasto => (
            <article key={gasto.id} data-testid={'gasto-' + gasto.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg" aria-hidden="true">
                      {iconoCategoria[gasto.categoria] ?? <Tag className="h-5 w-5 text-blue-700" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold text-slate-900">{gasto.descripcion}</h3>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {etiquetaCategoriaGasto(gasto.categoria)} · {fechaGasto(gasto.fecha)}
                      </p>
                      {gasto.anuladoAt && (
                        <span className="mt-1 inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          Anulado
                        </span>
                      )}
                    </div>
                  </div>
                  {gasto.responsable && <p className="mt-2 text-xs text-slate-600">
                    Persona asociada (dato registrado): {gasto.responsable}
                  </p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {gasto.anuladoAt ? (
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-600">Original</p>
                      <p className="text-base font-semibold tabular-nums text-slate-500 line-through">
                        {formatCurrency(Number(gasto.montoAntesAnular ?? 0))}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xl font-bold tabular-nums text-slate-900">
                      {formatCurrency(Number(gasto.monto))}
                    </p>
                  )}
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => void abrirDetalle(gasto.id)}>
                      <Eye aria-hidden="true" className="mr-1 h-4 w-4" /> Ver detalle
                    </Button>
                    {!gasto.anuladoAt && (
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => void abrirDetalle(gasto.id, 'EDITAR')}>
                        <Pencil aria-hidden="true" className="mr-1 h-4 w-4" /> Corregir
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
          {totalPaginas > 1 && (
            <nav aria-label="Páginas de gastos" className="flex items-center justify-between gap-3">
              <Button variant="outline" disabled={pagina === 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</Button>
              <span className="text-sm text-slate-600">Página {pagina} de {totalPaginas}</span>
              <Button variant="outline" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Siguiente</Button>
            </nav>
          )}
        </section>
      )}
    </div>
  )
}
