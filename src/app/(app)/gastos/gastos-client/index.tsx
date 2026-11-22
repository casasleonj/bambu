'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { getTodayString } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { DateRangeFilter } from '@/components/date-range-filter'
import type { Gasto } from './types'
import { categorias, PARECE_PAGO_PERSONAL } from './types'
import { usePollingRefetch } from '@/hooks/use-polling-refetch'

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [showCrear, setShowCrear] = useState(false)
  const [dateRange, setDateRange] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null })
  const [categoria, setCategoria] = useState('OTRO')
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

  const abrirDetalle = useCallback(async (id: string) => {
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
      const gasto: Gasto = json.gasto
      setDetalle(gasto)
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
      setDetalleError(error instanceof Error ? error.message : 'No fue posible abrir este gasto.')
    } finally {
      setDetalleCargando(false)
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

  function cerrarDetalle() {
    setDetalle(null)
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
    if (!descripcion.trim() || !monto) {
      toast.error('Descripción y monto son obligatorios')
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
        body: JSON.stringify({ categoria, descripcion, monto: montoNum, responsable }),
      })
      if (res.ok) {
        setShowCrear(false)
        setDescripcion('')
        setMonto('')
        setResponsable('')
        setPagina(1)
        void fetchGastos()
        toast.success('Gasto registrado')
      } else {
        toast.error('Error registrando gasto')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error registrando gasto')
    }
    setSubmitting(false)
  }


  const cats = {
    ARRIENDO: '🏠',
    SERVICIOS: '💡',
    INSUMOS: '📦',
    MANTENIMIENTO: '🔧',
    TRANSPORTE: '🚛',
    NOMINA: '💰',
    OTRO: '📝',
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">📝 Gastos operativos</h1>
      <p className="text-sm text-muted-foreground">Los pagos al personal se administran desde Nómina. Cierre consolida esos movimientos por separado.</p>

      <div className="bg-white p-4 rounded-xl shadow space-y-3">
        <DateRangeFilter onDateChange={handleDateChange} />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => setShowCrear(!showCrear)}>
          Nuevo Gasto
        </Button>
      </div>

      {showCrear && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar Gasto</CardTitle>
          </CardHeader>
          <form onSubmit={crearGasto}>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="gasto-categoria">Categoría</Label>
                <select
                  id="gasto-categoria"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                >
                  {categorias.map((c) => (
                    <option key={c} value={c}>{cats[c as keyof typeof cats]} {c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="gasto-descripcion">Descripción <span className="text-red-500">*</span></Label>
                <Input id="gasto-descripcion" required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle del gasto" />
                {PARECE_PAGO_PERSONAL.test(descripcion) && (
                  <p className="mt-1 text-sm text-amber-700" data-testid="aviso-pago-personal">
                    Si es un pago a una persona del equipo, regístralo con «Pagar» en Nómina para que no se cuente dos veces en el cierre.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="gasto-monto">Monto <span className="text-red-500">*</span></Label>
                <Input id="gasto-monto" type="number" min="0" required value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="gasto-responsable">Responsable (opcional)</Label>
                <Input id="gasto-responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Quién paga" />
              </div>
              <Button type="submit" disabled={submitting || !descripcion.trim() || !monto}>{submitting ? 'Guardando...' : 'Guardar'}</Button>
            </CardContent>
          </form>
        </Card>
      )}


      {(detalleCargando || detalle || detalleError) && (
        <Card id="gasto-detalle" data-testid="gasto-detalle" className="border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Detalle del gasto operativo</CardTitle>
              <Button type="button" variant="outline" onClick={cerrarDetalle}>Cerrar</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {detalleCargando && <p role="status">Cargando detalle...</p>}
            {detalleError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{detalleError}</p>}
            {detalle && !detalleCargando && (
              <>
                <div className="text-sm text-muted-foreground">
                  Fecha efectiva: {new Date(detalle.fecha).toLocaleDateString('es-CO', {
                    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
                  })}
                  {' · '}Estado: {detalle.anuladoAt ? 'Anulado' : detalleCerrado ? 'Jornada cerrada' : 'Vigente'}
                </div>
                {detalleCerrado && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    Esta jornada ya tiene cierre. No se altera el registro original; cualquier corrección requiere un ajuste contable separado.
                  </p>
                )}
                {detalle.anuladoAt && (
                  <p className="rounded-md bg-muted p-3 text-sm">
                    Este gasto fue anulado. Monto original: {formatCurrency(Number(detalle.montoAntesAnular ?? 0))}.
                  </p>
                )}
                {modoDetalle === 'VER' ? (
                  <>
                    <p className="font-medium">{detalle.categoria}: {detalle.descripcion}</p>
                    <p>Importe actual: {formatCurrency(Number(detalle.monto))}</p>
                    {detalle.responsable && <p className="text-sm">Responsable: {detalle.responsable}</p>}
                    {!detalleCerrado && !detalle.anuladoAt && (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => { setModoDetalle('EDITAR'); setDetalleError(null) }}>Corregir</Button>
                        <Button type="button" variant="outline" onClick={() => { setModoDetalle('ANULAR'); setDetalleError(null) }}>Anular registro</Button>
                      </div>
                    )}
                  </>
                ) : (
                  <form onSubmit={guardarCorreccion} className="space-y-3">
                    {modoDetalle === 'EDITAR' ? (
                      <>
                        <div>
                          <Label htmlFor="editar-categoria-gasto">Categoría</Label>
                          <select id="editar-categoria-gasto" className="h-10 w-full rounded-md border border-input bg-background px-3"
                            value={editCategoria} onChange={event => setEditCategoria(event.target.value)}>
                            {categorias.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </div>
                        <div>
                          <Label htmlFor="editar-descripcion-gasto">Descripción</Label>
                          <Input id="editar-descripcion-gasto" required maxLength={200} value={editDescripcion}
                            onChange={event => setEditDescripcion(event.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor="editar-monto-gasto">Monto real</Label>
                          <Input id="editar-monto-gasto" type="number" min="0.01" step="0.01" required value={editMonto}
                            onChange={event => setEditMonto(event.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor="editar-responsable-gasto">Responsable</Label>
                          <Input id="editar-responsable-gasto" maxLength={100} value={editResponsable}
                            onChange={event => setEditResponsable(event.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor="editar-notas-gasto">Notas</Label>
                          <Input id="editar-notas-gasto" maxLength={500} value={editNotas}
                            onChange={event => setEditNotas(event.target.value)} />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                        <p className="font-medium text-amber-900">Anular solo un registro equivocado, sin inventar una devolución.</p>
                        <Label htmlFor="gasto-motivo-origen">¿Por qué se anula?</Label>
                        <select id="gasto-motivo-origen" className="h-10 w-full rounded-md border border-input bg-white px-3"
                          value={motivoOrigen} onChange={event => setMotivoOrigen(event.target.value as 'REGISTRO_DUPLICADO' | 'DINERO_NO_SALIO')}>
                          <option value="REGISTRO_DUPLICADO">Registro duplicado</option>
                          <option value="DINERO_NO_SALIO">El dinero nunca salió</option>
                        </select>
                        <label className="flex items-start gap-2 text-sm text-amber-900">
                          <input type="checkbox" checked={confirmarOperacionNoReal}
                            onChange={event => setConfirmarOperacionNoReal(event.target.checked)} />
                          Confirmo que este registro no representa una salida de dinero adicional. Si el dinero realmente salió, no debo anularlo aquí.
                        </label>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="gasto-motivo-ajuste">Motivo de la acción (obligatorio)</Label>
                      <Input id="gasto-motivo-ajuste" required minLength={5} maxLength={450} value={motivo}
                        onChange={event => setMotivo(event.target.value)} placeholder="Explica qué dato estaba equivocado" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={guardandoDetalle || (modoDetalle === 'ANULAR' && !confirmarOperacionNoReal)}>
                        {guardandoDetalle ? 'Guardando...' : modoDetalle === 'ANULAR' ? 'Confirmar anulación' : 'Guardar corrección'}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => { setModoDetalle('VER'); setDetalleError(null) }}>Cancelar</Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {errorGastos && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>{errorGastos}</p>
          <Button className="mt-2" variant="outline" onClick={() => void fetchGastos()}>Reintentar</Button>
        </div>
      )}
      {loadingGastos ? (
        <p role="status" className="text-sm text-muted-foreground">Cargando gastos...</p>
      ) : errorGastos ? null : gastos.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>}
          title={dateRange.desde && dateRange.hasta ? 'No hay gastos en el rango seleccionado' : 'No hay gastos registrados hoy'}
          description="Registra los gastos de operación"
          actionLabel="+ Registrar Gasto"
          onAction={() => setShowCrear(true)}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between p-3 bg-muted rounded-lg font-bold">
            <span>Total gastos operativos del período:</span>
            <span data-testid="gastos-monto-total">{formatCurrency(montoTotal)}</span>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="gastos-resumen-pagina">
            Mostrando {gastos.length} de {totalRegistros} gastos operativos · página {pagina} de {totalPaginas}
          </p>
          {gastos.map((gasto) => (
            <Card key={gasto.id}>
              <CardContent className="py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{cats[gasto.categoria as keyof typeof cats]} {gasto.categoria}</div>
                    <div className="text-sm text-muted-foreground">{gasto.descripcion}</div>
                    {gasto.responsable && (
                      <div className="text-xs text-muted-foreground">Responsable: {gasto.responsable}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(Number(gasto.monto))}</div>
                    <div className="text-xs text-muted-foreground">{new Date(gasto.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                    <Button type="button" variant="outline" className="mt-2" onClick={() => void abrirDetalle(gasto.id)}>
                      Ver / Corregir
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {totalPaginas > 1 && (
            <nav aria-label="Páginas de gastos" className="flex items-center justify-between gap-3">
              <Button variant="outline" disabled={pagina === 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</Button>
              <span className="text-sm text-muted-foreground">Página {pagina} de {totalPaginas}</span>
              <Button variant="outline" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Siguiente</Button>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}
