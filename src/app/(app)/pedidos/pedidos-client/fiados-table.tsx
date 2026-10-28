'use client'

import { useMemo, useState } from 'react'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'
import { getEstadoFiados, resolverLimiteFiados } from '@/lib/pedido-utils'
import { generateUUID } from '@/lib/uuid'
import { fetchResilient } from '@/lib/fetch-resilient'
import { toast } from 'sonner'
import { MoneyDisplay } from '@/components/money-display'
import { PedidoClienteDisplay } from '@/components/pedido-cliente-display'
import { filtrarPorPeriodo, PERIODOS, type PeriodoFiltro } from './date-utils'
import { PedidoDocumentLinks, type AccesoDocumentosPedido } from './pedido-document-links'
import { useParametroConsulta } from './use-consulta-contexto'
import type { Pedido, Cliente } from './types'

export function diasFiadoDesde(fecha: Date): number {
  return Math.floor((Date.now() - fecha.getTime()) / 86400000)
}
interface FiadoRow {
  clienteId: string; nombreCli: string; apellidoCli?: string | null; telefonoCli: string
  negocioId?: string | null; nombreNegocioCli?: string | null; pedidos: Pedido[]; deuda: number; antigua: Date
}
interface Props extends AccesoDocumentosPedido {
  clientes: Cliente[]
  limiteGlobal?: number
  pedidos: Pedido[]
  loading: boolean
  refetching?: boolean
  error: string | null
  activeTab: 'hoy' | 'fiados' | 'alertas'
  onPedidosChange?: () => void
  onCobrar?: (cliente: { id: string; nombre: string }) => void
}

export function FiadosTable({ clientes, limiteGlobal, pedidos, loading, refetching, error, onPedidosChange, onCobrar,
  userRole, onOpenPedido, onOpenFactura }: Props) {
  const params = useShallowSearchParams()
  const [periodo, setPeriodo] = useParametroConsulta<PeriodoFiltro>('fiadosPeriodo', 'todos', PERIODOS.map(p => p.key))
  const [search, setSearch] = useParametroConsulta<string>('fiadosBuscar', '')
  const [min, setMin] = useParametroConsulta<string>('fiadosMin', '')
  const [max, setMax] = useParametroConsulta<string>('fiadosMax', '')
  const [dias, setDias] = useParametroConsulta<string>('fiadosDias', 'todos', ['todos', '0-7', '8-30', '30+'])
  const [expandido, setExpandido] = useParametroConsulta<string>('fiadosExpandido', '')
  // clienteId legacy solo aparece en enlaces directos: el cambio de pestaña
  // guarda el cliente de Pedidos en pedidosCliente antes de salir de esa vista.
  const clienteSolicitado = params.get('fiadosCliente') || params.get('clienteId')
  const [convertir, setConvertir] = useState<FiadoRow | null>(null)
  const [trabajadores, setTrabajadores] = useState<Array<{ id: string; nombre: string; rol: string }>>([])
  const [trabajadorId, setTrabajadorId] = useState('')
  const [montoDeuda, setMontoDeuda] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardandoDeuda, setGuardandoDeuda] = useState(false)
  const puedeCobrar = userRole === 'ADMIN' || userRole === 'ASISTENTE'

  const rows = useMemo(() => {
    const grouped = new Map<string, FiadoRow>()
    for (const p of filtrarPorPeriodo(pedidos, periodo)) {
      if (p.estadoEntrega !== 'ENTREGADO' || Number(p.saldo) <= 0 || p.clienteId === 'CONSUMIDOR_FINAL') continue
      const row = grouped.get(p.clienteId)
      if (row) { row.pedidos.push(p); row.deuda += Number(p.saldo); if (new Date(p.fecha) < row.antigua) row.antigua = new Date(p.fecha) }
      else grouped.set(p.clienteId, { clienteId: p.clienteId, nombreCli: p.nombreCli, apellidoCli: p.apellidoCli,
        telefonoCli: p.telefonoCli, negocioId: p.negocioId, nombreNegocioCli: p.nombreNegocioCli,
        pedidos: [p], deuda: Number(p.saldo), antigua: new Date(p.fecha) })
    }
    return [...grouped.values()]
  }, [pedidos, periodo])
  const filtrados = rows.filter(row => {
    const nombre = [row.nombreCli, row.apellidoCli, row.nombreNegocioCli, row.telefonoCli].filter(Boolean).join(' ').toLocaleLowerCase('es')
    const edad = diasFiadoDesde(row.antigua)
    return (!clienteSolicitado || row.clienteId === clienteSolicitado) && nombre.includes(search.trim().toLocaleLowerCase('es'))
      && (!min || row.deuda >= Number(min)) && (!max || row.deuda <= Number(max))
      && (dias === 'todos' || dias === '0-7' && edad <= 7 || dias === '8-30' && edad > 7 && edad <= 30 || dias === '30+' && edad > 30)
  })
  const hayFiltros = periodo !== 'todos' || Boolean(search || min || max || clienteSolicitado) || dias !== 'todos'
  const limpiar = () => params.set({ fiadosPeriodo: undefined, fiadosBuscar: undefined, fiadosMin: undefined,
    fiadosMax: undefined, fiadosDias: undefined, fiadosCliente: undefined, clienteId: undefined }, { history: 'replace' })
  const abrirConversion = async (row: FiadoRow) => {
    setConvertir(row); setTrabajadorId(''); setMontoDeuda(String(row.deuda))
    setDescripcion(`Fiado convertido: ${row.nombreCli}${row.nombreNegocioCli ? ' - ' + row.nombreNegocioCli : ''}`)
    try { const res = await fetch('/api/trabajadores'); if (res.ok) { const data = await res.json(); setTrabajadores(data.trabajadores || data.data || []) } }
    catch { toast.error('No se pudieron consultar los trabajadores') }
  }
  const crearDeuda = async () => {
    if (!convertir || !trabajadorId || !(Number(montoDeuda) > 0)) { toast.error('Selecciona un trabajador y un monto válido'); return }
    setGuardandoDeuda(true)
    try {
      const r = await fetchResilient('/api/deudas', { method: 'POST', body: { trabajadorId, tipo: 'FIADO',
        monto: Number(montoDeuda), descripcion, offlineId: generateUUID() }, localEndpoint: 'deudas' })
      if (r.status === 'error') { toast.error(r.error); return }
      toast[r.status === 'offline' ? 'info' : 'success'](r.status === 'offline' ? 'Sin conexión. Deuda guardada, pendiente de sincronizar.' : 'Deuda de trabajador creada')
      setConvertir(null); onPedidosChange?.()
    } finally { setGuardandoDeuda(false) }
  }
  const limiteBadge = (row: FiadoRow) => {
    const cliente = clientes.find(c => c.id === row.clienteId)
    const limite = resolverLimiteFiados(cliente ?? {}, limiteGlobal == null ? null : String(limiteGlobal))
    const todos = pedidos.filter(p => p.clienteId === row.clienteId && p.estadoEntrega === 'ENTREGADO' && Number(p.saldo) > 0)
    const estado = getEstadoFiados(todos.map(p => ({ id: p.id, numero: p.numero, saldo: Number(p.saldo) })), limite)
    const color = estado.nivel === 'limite' ? 'bg-red-100 text-red-700' : estado.nivel === 'cerca' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
    return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${color}`} title="Pedidos entregados con deuda de todas las fechas / límite configurado">{estado.count}/{estado.limite} fiados en total</span>
  }
  const detalle = (row: FiadoRow) => <div className="space-y-3 rounded-lg bg-gray-50 p-3">
    {[...row.pedidos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero).map(p => <div key={p.id} className="border-b py-2 last:border-0">
      <p className="text-sm font-medium">Pedido #{p.numero} · {new Date(p.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</p>
      <p className="text-sm text-gray-600">Saldo <MoneyDisplay value={Number(p.saldo)} userRole={userRole} /> · Total <MoneyDisplay value={Number(p.total)} userRole={userRole} /></p>
      <PedidoDocumentLinks pedidoId={p.id} numero={p.numero} facturaId={p.factura?.id} facturaNumero={p.factura?.numero}
        userRole={userRole} onOpenPedido={onOpenPedido} onOpenFactura={onOpenFactura} />
    </div>)}
  </div>
  const acciones = (row: FiadoRow) => <div className="flex flex-wrap gap-2">
    <button type="button" className="min-h-11 rounded-lg border px-3 text-sm text-blue-700" aria-expanded={expandido === row.clienteId}
      onClick={() => setExpandido(expandido === row.clienteId ? '' : row.clienteId)}>{expandido === row.clienteId ? 'Ocultar' : 'Ver pedidos'}</button>
    {puedeCobrar && <button type="button" className="min-h-11 rounded-lg bg-blue-600 px-3 text-sm text-white" onClick={() => onCobrar?.({ id: row.clienteId, nombre: row.nombreCli })}>Registrar pago</button>}
    {puedeCobrar && <button type="button" className="min-h-11 rounded-lg bg-amber-600 px-3 text-sm text-white" onClick={() => void abrirConversion(row)}>Convertir</button>}
  </div>
  return <section className="space-y-4" aria-label="Consulta de Fiados">
    <div className="rounded-xl border border-red-200 bg-red-50 p-4"><h2 className="text-lg font-bold text-red-900">Control de Fiados</h2>
      <p className="mt-1 text-sm text-red-800">Consulta la deuda de pedidos entregados, agrupada por cliente. Los pedidos sin entregar no se cobran automáticamente desde Fiados.</p>
      <p className="mt-1 text-sm text-red-700">Todas las fechas por defecto. Este período es independiente del filtro de Pedidos.</p>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Período de Fiados">{PERIODOS.map(p => <button key={p.key} type="button" aria-pressed={periodo === p.key}
        className={`min-h-11 rounded-lg border px-3 text-sm ${periodo === p.key ? 'border-red-600 bg-red-600 text-white' : 'border-red-200 bg-white text-red-700'}`}
        onClick={() => setPeriodo(p.key)}>{p.label}</button>)}</div>
    </div>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <p>{pedidos.length ? 'No se pudo actualizar. Se conservan los datos anteriores.' : 'No se pudieron cargar los fiados. No podemos confirmar si hay deudas.'}</p>
      <button className="min-h-11 px-3 font-medium underline" onClick={onPedidosChange}>Reintentar</button>
    </div>}
    {refetching && <p role="status" className="text-sm text-gray-500">Actualizando fiados…</p>}
    <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-xs font-medium text-gray-600 sm:col-span-2 lg:col-span-2">Buscar cliente<input aria-label="Buscar cliente" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-2 text-sm" /></label>
      <label className="text-xs font-medium text-gray-600">Deuda mínima<input type="number" min="0" placeholder="Deuda min" value={min} onChange={e => setMin(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-2 text-sm" /></label>
      <label className="text-xs font-medium text-gray-600">Deuda máxima<input type="number" min="0" placeholder="Deuda max" value={max} onChange={e => setMax(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-2 text-sm" /></label>
      <label className="text-xs font-medium text-gray-600">Antigüedad<select value={dias} onChange={e => setDias(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-2 text-sm"><option value="todos">Todos los días</option><option value="0-7">0–7 días</option><option value="8-30">8–30 días</option><option value="30+">Más de 30 días</option></select></label>
      {hayFiltros && <button className="min-h-11 text-sm text-blue-700 underline" onClick={limpiar}>Limpiar filtros</button>}
    </div>
    {loading && !pedidos.length ? <p role="status" className="rounded-xl border bg-white p-8 text-center">Cargando fiados…</p>
      : error && !pedidos.length ? null : filtrados.length === 0 ? <div className="rounded-xl border bg-white p-8 text-center">
        <h3 className="font-semibold">{hayFiltros ? 'Sin resultados con estos filtros' : 'No hay deuda pendiente de pedidos entregados'}</h3>
        <p className="mt-2 text-sm text-gray-500">{hayFiltros ? 'Revisa la búsqueda y los filtros. Puede haber otros fiados fuera de esta consulta.' : 'Los pedidos sin entregar se consultan en Pedidos.'}</p>
        {hayFiltros && <button className="mt-3 min-h-11 text-blue-700 underline" onClick={limpiar}>Limpiar filtros</button>}
      </div> : <div className="rounded-xl border bg-white p-4">
        <p className="mb-3 text-sm font-semibold">{filtrados.length} cliente{filtrados.length === 1 ? '' : 's'} con deuda entregada{periodo !== 'todos' ? ' en el período elegido' : ''}</p>
        <div className="hidden overflow-x-auto md:block" data-testid="fiados-desktop"><table className="w-full text-sm"><thead><tr className="border-b bg-gray-50 text-left text-gray-600"><th className="p-3">Cliente</th><th className="p-3">{periodo === 'todos' ? 'Deuda total' : 'Deuda en el período'}</th><th className="p-3">Pedidos</th><th className="p-3">Días fiado</th><th className="p-3">Acción</th></tr></thead>
          {filtrados.map(row => <tbody key={row.clienteId}><tr className="border-b"><td className="p-3"><PedidoClienteDisplay {...row} variant="row" /><small className="text-gray-500">{row.telefonoCli}</small></td><td className="p-3 font-bold text-red-600"><MoneyDisplay value={row.deuda} userRole={userRole} /></td><td className="p-3">{row.pedidos.length} en consulta<div>{limiteBadge(row)}</div></td><td className="p-3">{diasFiadoDesde(row.antigua)}</td><td className="p-3">{acciones(row)}</td></tr>{expandido === row.clienteId && <tr><td colSpan={5} className="p-3">{detalle(row)}</td></tr>}</tbody>)}
        </table></div>
        <div className="space-y-4 md:hidden" data-testid="fiados-mobile">{filtrados.map(row => <article key={row.clienteId} className="space-y-3 border-b pb-4 last:border-0"><div className="flex justify-between gap-2"><div><PedidoClienteDisplay {...row} variant="row" /><small className="text-gray-500">{row.telefonoCli}</small></div><strong className="text-red-600"><MoneyDisplay value={row.deuda} userRole={userRole} /></strong></div><p className="text-sm text-gray-600">{row.pedidos.length} pedidos · {diasFiadoDesde(row.antigua)} días</p>{limiteBadge(row)}{acciones(row)}{expandido === row.clienteId && detalle(row)}</article>)}</div>
      </div>}
    {convertir && <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold">Crear deuda de trabajador</h3><p className="text-sm">Se creará una deuda de trabajador tipo FIADO. Se descontará de nómina según el plan configurado.</p><label className="block text-sm">Trabajador responsable<select value={trabajadorId} onChange={e => setTrabajadorId(e.target.value)} className="mt-1 min-h-11 w-full rounded border p-2"><option value="">Seleccionar…</option>{trabajadores.map(t => <option key={t.id} value={t.id}>{t.nombre} · {t.rol}</option>)}</select></label><label className="block text-sm">Monto<input type="number" value={montoDeuda} onChange={e => setMontoDeuda(e.target.value)} className="mt-1 min-h-11 w-full rounded border p-2" /></label><label className="block text-sm">Descripción<input value={descripcion} onChange={e => setDescripcion(e.target.value)} className="mt-1 min-h-11 w-full rounded border p-2" /></label><div className="flex gap-2"><button className="min-h-11 rounded border px-4" onClick={() => setConvertir(null)}>Cancelar</button><button className="min-h-11 rounded bg-amber-600 px-4 text-white" disabled={guardandoDeuda} onClick={() => void crearDeuda()}>{guardandoDeuda ? 'Procesando…' : 'Crear deuda'}</button></div></div>}
  </section>
}
