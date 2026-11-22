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
