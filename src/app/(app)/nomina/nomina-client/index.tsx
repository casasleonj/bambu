'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { Modal } from '@/components/modal'
import type { Nomina, Trabajador } from './types'

type EstadoFilter = 'TODAS' | 'PENDIENTE' | 'PAGADA' | 'ANULADA'
type SortOption = 'fecha-desc' | 'fecha-asc' | 'nombre' | 'total-desc'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function mesLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`
}

function iniciales(nombre: string): string {
  return nombre.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase()
}

function badgeColor(estado: string): string {
  switch (estado) {
    case 'PENDIENTE': return 'bg-yellow-100 text-yellow-800'
    case 'PAGADA': return 'bg-green-100 text-green-800'
    case 'ANULADA': return 'bg-gray-100 text-gray-600'
    default: return 'bg-muted text-muted-foreground'
  }
}

function badgeText(estado: string): string {
  switch (estado) {
    case 'PENDIENTE': return 'Pendiente'
    case 'PAGADA': return 'Pagada'
    case 'ANULADA': return 'Anulada'
    default: return estado
  }
}

function avatarColor(estado: string): string {
  switch (estado) {
    case 'PENDIENTE': return 'bg-yellow-100 text-yellow-700'
    case 'PAGADA': return 'bg-green-100 text-green-700'
    case 'ANULADA': return 'bg-gray-100 text-gray-500'
    default: return 'bg-muted text-muted-foreground'
  }
}

const todayISO = () => new Date().toISOString().split('T')[0]

export default function NominaPage() {
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string } | undefined)?.role
  const canManage = userRole === 'ADMIN' || userRole === 'ASISTENTE'

  const [nominas, setNominas] = useState<Nomina[]>([])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [showCrear, setShowCrear] = useState(false)
  const [trabajadorId, setTrabajadorId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [detalles, setDetalles] = useState<{
    entregasAgua: number
    entregasHielo: number
    entregasBotellon: number
    comAgua: number
    comHielo: number
    comBotellon: number
    comisionTotal: number
    descuentos?: number
    salarioFijo: number
  } | null>(null)
  const [selectedNomina, setSelectedNomina] = useState<Nomina | null>(null)
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('TODAS')
  const [trabajadorFilter, setTrabajadorFilter] = useState<string>('')
  const [busqueda, setBusqueda] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('fecha-desc')
  const [payingId, setPayingId] = useState<string | null>(null)
  const [confirmPayNomina, setConfirmPayNomina] = useState<Nomina | null>(null)
  const [confirmAnularNomina, setConfirmAnularNomina] = useState<Nomina | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const resetForm = () => {
    setTrabajadorId('')
    setFechaInicio('')
    setFechaFin('')
  }

  const fetchData = async () => {
    try {
      const [nRes, tRes] = await Promise.all([
        fetch('/api/nomina'),
        fetch('/api/trabajadores'),
      ])
      if (!nRes.ok || !tRes.ok) {
        throw new Error('Error en la respuesta del servidor')
      }
      const nData = await nRes.json()
      const tData = await tRes.json()
      setNominas(nData.nominas || nData.data || [])
      setTrabajadores(tData.trabajadores || tData.data || [])
    } catch (e) {
      console.error(e)
      toast.error('Error cargando nóminas')
    }
  }

  const crearNomina = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!trabajadorId || !fechaInicio || !fechaFin) {
      toast.error('Completa todos los campos')
      return
    }
    if (fechaFin < fechaInicio) {
      toast.error('La fecha fin debe ser posterior a la fecha inicio')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/nomina', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trabajadorId, fechaInicio, fechaFin, tipoCalculo: 'AUTO' }),
      })
      const data = await res.json()
      if (res.ok) {
        setDetalles(data.detalles)
        setShowCrear(false)
        resetForm()
        fetchData()
        setNominas(prev => {
          const created = prev.find(n => n.id === data.nomina.id)
          if (created) setSelectedNomina(created)
          return prev
        })
        toast.success('Nómina calculada')
      } else {
        toast.error(data.error?.message || 'Error calculando nómina')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error calculando nómina')
    }
    setSubmitting(false)
  }

  const executePay = async (nom: Nomina) => {
    setPayingId(nom.id)
    setConfirmPayNomina(null)
    try {
      const res = await fetch(`/api/nomina/${nom.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PAGAR' }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Nómina pagada — se registró el egreso en caja')
        setDetalles(null)
        setSelectedNomina(null)
        fetchData()
      } else {
        toast.error(data.error?.message || 'Error pagando nómina')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error pagando nómina')
    }
    setPayingId(null)
  }

  const executeAnular = async (nom: Nomina) => {
    setPayingId(nom.id)
    setConfirmAnularNomina(null)
    try {
      const res = await fetch(`/api/nomina/${nom.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ANULAR' }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Nómina anulada')
        setDetalles(null)
        setSelectedNomina(null)
        fetchData()
      } else {
        toast.error(data.error?.message || 'Error anulando nómina')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error anulando nómina')
    }
    setPayingId(null)
  }

  const pagarNomina = (nom: Nomina) => {
    setConfirmPayNomina(nom)
  }

  const anularNomina = (nom: Nomina) => {
    setConfirmAnularNomina(nom)
  }

  const selectNomina = (nom: Nomina) => {
    if (selectedNomina?.id === nom.id) {
      setDetalles(null)
      setSelectedNomina(null)
      return
    }
    setDetalles({
      entregasAgua: nom.entregasAgua,
      entregasHielo: nom.entregasHielo,
      entregasBotellon: nom.entregasBotellon || 0,
      comAgua: Number(nom.comEntregasAgua),
      comHielo: Number(nom.comEntregasHielo),
      comBotellon: Number(nom.comEntregasBotellon ?? 0),
      comisionTotal: Number(nom.totalComisiones),
      salarioFijo: Number(nom.salario),
    })
    setSelectedNomina(nom)
  }

  const onCancel = () => {
    setShowCrear(false)
    resetForm()
    setDetalles(null)
    setSelectedNomina(null)
  }

  const nominasFiltradas = useMemo(() => {
    let filtradas = nominas.filter(nom => {
      if (estadoFilter !== 'TODAS' && nom.estado !== estadoFilter) return false
      if (trabajadorFilter && nom.trabajadorId !== trabajadorFilter) return false
      if (busqueda && !(nom.trabajador?.nombre?.toLowerCase() || '').includes(busqueda.toLowerCase())) return false
      return true
    })

    filtradas.sort((a, b) => {
      switch (sortOption) {
        case 'fecha-desc': return new Date(b.fechaFin).getTime() - new Date(a.fechaFin).getTime()
        case 'fecha-asc': return new Date(a.fechaFin).getTime() - new Date(b.fechaFin).getTime()
        case 'nombre': return (a.trabajador?.nombre || '').localeCompare(b.trabajador?.nombre || '')
        case 'total-desc': return Number(b.total) - Number(a.total)
        default: return 0
      }
    })

    return filtradas
  }, [nominas, estadoFilter, trabajadorFilter, busqueda, sortOption])

  const nominasAgrupadas = useMemo(() => {
    const groups: Record<string, Nomina[]> = {}
    nominasFiltradas.forEach(nom => {
      const mes = mesLabel(nom.fechaFin)
      if (!groups[mes]) groups[mes] = []
      groups[mes].push(nom)
    })
    return groups
  }, [nominasFiltradas])

  const resumen = useMemo(() => {
    const pendientes = nominas.filter(n => n.estado === 'PENDIENTE')
    const totalPendiente = pendientes.reduce((sum, n) => sum + Number(n.total), 0)
    return { total: nominas.length, pendientes: pendientes.length, pagadas: nominas.filter(n => n.estado === 'PAGADA').length, anuladas: nominas.filter(n => n.estado === 'ANULADA').length, totalPendiente }
  }, [nominas])

  const formatCOP = (v: number) => formatCurrency(v)

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">💰 Nómina</h1>

      <Button onClick={() => setShowCrear(!showCrear)}>➕ Nueva Nómina</Button>

      {showCrear && (
        <Card>
          <form onSubmit={crearNomina}>
            <CardContent className="pt-4 space-y-3">
              <div>
                <Label htmlFor="nomina-trabajador">Trabajador <span className="text-red-500">*</span></Label>
                <select id="nomina-trabajador" required className="w-full h-10 rounded-md border border-input bg-background px-3 py-2" value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {trabajadores.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre} - {t.rol}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label htmlFor="nomina-fechaInicio">Fecha Inicio</Label><Input id="nomina-fechaInicio" type="date" max={todayISO()} required value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></div>
                <div><Label htmlFor="nomina-fechaFin">Fecha Fin</Label><Input id="nomina-fechaFin" type="date" max={todayISO()} required value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting || !trabajadorId}>📊 Calcular Automático</Button>
                <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
              </div>
            </CardContent>
          </form>
        </Card>
      )}

      {detalles && selectedNomina && (
        <Modal open={detalles !== null} onClose={() => { setDetalles(null); setSelectedNomina(null); }} title="Detalle de Nómina">
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedNomina.trabajador?.nombre}</h2>
                <p className="text-sm text-muted-foreground">{selectedNomina.trabajador?.rol}</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badgeColor(selectedNomina.estado)}`}>
                {badgeText(selectedNomina.estado)}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              Período: {new Date(selectedNomina.fechaInicio).toLocaleDateString()} — {new Date(selectedNomina.fechaFin).toLocaleDateString()}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Entregas</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-muted-foreground">Agua</div><div className="font-medium text-right">{detalles.entregasAgua}</div>
                <div className="text-muted-foreground">Hielo</div><div className="font-medium text-right">{detalles.entregasHielo}</div>
                <div className="text-muted-foreground">Botellón</div><div className="font-medium text-right">{detalles.entregasBotellon}</div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Comisiones</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-muted-foreground">Agua</div><div className="font-medium text-right">${formatCOP(detalles.comAgua)}</div>
                <div className="text-muted-foreground">Hielo</div><div className="font-medium text-right">${formatCOP(detalles.comHielo)}</div>
                <div className="text-muted-foreground">Botellón</div><div className="font-medium text-right">${formatCOP(detalles.comBotellon)}</div>
                <div className="font-semibold border-t pt-2">Total comisiones</div><div className="font-semibold text-right border-t pt-2">${formatCOP(detalles.comisionTotal)}</div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-muted-foreground">Salario fijo</div><div className="font-medium text-right">${formatCOP(detalles.salarioFijo)}</div>
                {detalles.descuentos !== undefined && detalles.descuentos > 0 && (
                  <><div className="text-muted-foreground">Descuentos</div><div className="font-medium text-right text-red-600">-${formatCOP(detalles.descuentos)}</div></>
                )}
              </div>
            </div>

            <div className="border-t pt-4 flex items-center justify-between">
              <span className="text-lg font-bold">TOTAL</span>
              <span className="text-2xl font-bold">${formatCOP(Number(selectedNomina.total))}</span>
            </div>

            {selectedNomina.estado === 'PENDIENTE' && canManage && (
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setDetalles(null); setSelectedNomina(null); }}>Cerrar</Button>
                <Button variant="destructive" onClick={() => anularNomina(selectedNomina)} disabled={payingId === selectedNomina.id}>Anular</Button>
                <Button onClick={() => pagarNomina(selectedNomina)} disabled={payingId === selectedNomina.id}>{payingId === selectedNomina.id ? 'Procesando...' : '💵 Pagar'}</Button>
              </div>
            )}
            {selectedNomina.estado === 'PAGADA' && canManage && (
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setDetalles(null); setSelectedNomina(null); }}>Cerrar</Button>
                <Button variant="destructive" onClick={() => anularNomina(selectedNomina)} disabled={payingId === selectedNomina.id}>Anular</Button>
              </div>
            )}
            {selectedNomina.estado === 'ANULADA' && (
              <div className="flex justify-end pt-2"><Button onClick={() => { setDetalles(null); setSelectedNomina(null); }}>Cerrar</Button></div>
            )}
          </div>
        </Modal>
      )}

      {confirmPayNomina && (
        <Modal open={confirmPayNomina !== null} onClose={() => setConfirmPayNomina(null)} title="Confirmar pago">
          <div className="space-y-5">
            <div><h2 className="text-xl font-bold">Confirmar pago</h2><p className="text-muted-foreground mt-1">¿Marcar como pagada la siguiente nómina?</p></div>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Trabajador</span><span className="font-medium">{confirmPayNomina.trabajador?.nombre}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Período</span><span>{new Date(confirmPayNomina.fechaInicio).toLocaleDateString()} — {new Date(confirmPayNomina.fechaFin).toLocaleDateString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total a pagar</span><span className="font-bold text-lg">${formatCOP(Number(confirmPayNomina.total))}</span></div>
            </div>
            <p className="text-sm text-muted-foreground">Se registrará un egreso de caja automáticamente.</p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setConfirmPayNomina(null)}>Cancelar</Button>
              <Button onClick={() => executePay(confirmPayNomina)} disabled={payingId === confirmPayNomina.id}>{payingId === confirmPayNomina.id ? 'Procesando...' : 'Sí, pagar'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmAnularNomina && (
        <Modal open={confirmAnularNomina !== null} onClose={() => setConfirmAnularNomina(null)} title="Confirmar anulación">
          <div className="space-y-5">
            <div><h2 className="text-xl font-bold">Confirmar anulación</h2><p className="text-muted-foreground mt-1">¿Anular la siguiente nómina?</p></div>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Trabajador</span><span className="font-medium">{confirmAnularNomina.trabajador?.nombre}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Período</span><span>{new Date(confirmAnularNomina.fechaInicio).toLocaleDateString()} — {new Date(confirmAnularNomina.fechaFin).toLocaleDateString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total</span><span className="font-bold text-lg">${formatCOP(Number(confirmAnularNomina.total))}</span></div>
            </div>
            {confirmAnularNomina.estado === 'PAGADA' && (
              <p className="text-sm text-amber-600">⚠️ La nómina ya fue pagada. Se creará un egreso negativo para revertir el pago.</p>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setConfirmAnularNomina(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => executeAnular(confirmAnularNomina)} disabled={payingId === confirmAnularNomina.id}>{payingId === confirmAnularNomina.id ? 'Procesando...' : 'Sí, anular'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Resumen */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="bg-muted rounded-lg px-4 py-2"><span className="text-muted-foreground">Total: </span><span className="font-bold">{resumen.total}</span></div>
        <div className="bg-yellow-50 rounded-lg px-4 py-2 border border-yellow-200"><span className="text-yellow-700">Pendientes: </span><span className="font-bold text-yellow-800">{resumen.pendientes}</span></div>
        <div className="bg-green-50 rounded-lg px-4 py-2 border border-green-200"><span className="text-green-700">Pagadas: </span><span className="font-bold text-green-800">{resumen.pagadas}</span></div>
        {resumen.anuladas > 0 && <div className="bg-gray-50 rounded-lg px-4 py-2 border border-gray-200"><span className="text-gray-600">Anuladas: </span><span className="font-bold text-gray-700">{resumen.anuladas}</span></div>}
        {resumen.totalPendiente > 0 && <div className="bg-orange-50 rounded-lg px-4 py-2 border border-orange-200"><span className="text-orange-700">Por pagar: </span><span className="font-bold text-orange-800">${formatCOP(resumen.totalPendiente)}</span></div>}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">
          {(['TODAS', 'PENDIENTE', 'PAGADA', 'ANULADA'] as EstadoFilter[]).map(f => (
            <Button key={f} variant={estadoFilter === f ? 'default' : 'outline'} size="sm" onClick={() => setEstadoFilter(f)} className={estadoFilter === f ? '' : 'text-muted-foreground'}>
              {f === 'TODAS' ? 'Todas' : f === 'PENDIENTE' ? 'Pendientes' : f === 'PAGADA' ? 'Pagadas' : 'Anuladas'}
            </Button>
          ))}
        </div>
        <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={trabajadorFilter} onChange={(e) => setTrabajadorFilter(e.target.value)}>
          <option value="">Todos los trabajadores</option>
          {trabajadores.map(t => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
        </select>
        <Input placeholder="Buscar por nombre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-8 w-40 text-sm" />
        <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={sortOption} onChange={(e) => setSortOption(e.target.value as SortOption)}>
          <option value="fecha-desc">Fecha ↓ reciente</option>
          <option value="fecha-asc">Fecha ↑ antigua</option>
          <option value="nombre">Trabajador A-Z</option>
          <option value="total-desc">Total ↓ mayor</option>
        </select>
      </div>

      {/* Lista agrupada por mes */}
      {nominasFiltradas.length === 0 ? (
        estadoFilter === 'PENDIENTE' && nominas.length > 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-lg font-semibold text-green-700">¡Al día!</h3>
            <p className="text-muted-foreground text-sm">Todas las nóminas están pagadas</p>
          </div>
        ) : estadoFilter === 'PAGADA' && nominas.length > 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-semibold">Sin nóminas pagadas</h3>
            <p className="text-muted-foreground text-sm">Aún no se ha pagado ninguna nómina</p>
          </div>
        ) : estadoFilter === 'ANULADA' && nominas.length > 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <h3 className="text-lg font-semibold">Sin nóminas anuladas</h3>
            <p className="text-muted-foreground text-sm">No hay nóminas anuladas</p>
          </div>
        ) : nominas.length === 0 ? (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            title="No hay nóminas registradas"
            description="Registra las nóminas de tu equipo"
          />
        ) : (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-lg font-semibold">Sin resultados</h3>
            <p className="text-muted-foreground text-sm">No hay nóminas con esos filtros</p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {Object.entries(nominasAgrupadas).map(([mes, items]) => (
            <div key={mes}>
              <div className="sticky top-0 bg-background z-10 py-2 mb-2 border-b">
                <span className="text-sm font-semibold text-muted-foreground">{mes}</span>
                <span className="text-xs text-muted-foreground ml-2">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map((nom) => (
                  <Card
                    key={nom.id}
                    className={`cursor-pointer transition-all hover:shadow-sm ${selectedNomina?.id === nom.id ? 'border-l-4 border-l-primary shadow-sm' : 'border-l-4 border-l-transparent'}`}
                    onClick={() => selectNomina(nom)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(nom.estado)}`}>
                          {iniciales(nom.trabajador?.nombre || '?')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold truncate">{nom.trabajador?.nombre}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badgeColor(nom.estado)}`}>
                              {badgeText(nom.estado)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{nom.trabajador?.rol}</span>
                            <span>·</span>
                            <span>{new Date(nom.fechaInicio).toLocaleDateString()} — {new Date(nom.fechaFin).toLocaleDateString()}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Comisiones ${formatCOP(Number(nom.totalComisiones))} + Salario ${formatCOP(Number(nom.salario))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-lg">${formatCOP(Number(nom.total))}</div>
                          {canManage && nom.estado === 'PENDIENTE' && (
                            <div className="flex gap-1 mt-1">
                              <Button size="sm" variant="outline" className="text-xs h-6 px-2 py-0" onClick={(e) => { e.stopPropagation(); pagarNomina(nom); }} disabled={payingId === nom.id}>💵 Pagar</Button>
                              <Button size="sm" variant="ghost" className="text-xs h-6 px-2 py-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); anularNomina(nom); }} disabled={payingId === nom.id}>Anular</Button>
                            </div>
                          )}
                          {canManage && nom.estado === 'PAGADA' && (
                            <Button size="sm" variant="ghost" className="text-xs h-6 px-2 py-0 text-red-600 hover:text-red-700 hover:bg-red-50 mt-1" onClick={(e) => { e.stopPropagation(); anularNomina(nom); }} disabled={payingId === nom.id}>Anular</Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
