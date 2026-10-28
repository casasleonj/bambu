'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/modal'
import { useGestionAdmin } from '@/hooks/use-gestion-admin'
import { generateUUID } from '@/lib/uuid'
import { fetchResilient } from '@/lib/fetch-resilient'
import { offlineDb } from '@/lib/db/offline'
import { syncWithServer, SYNC_ITEM_DONE_EVENT } from '@/lib/db/sync'
import { importeFiadoSchema, metodoFiadoSchema, repartirCobroFiado, sumarCobroFiado,
  type LineaCobroFiado, type PreparacionCobroFiado, type ResultadoCobroFiado } from '@/lib/fiados-cobro'
import { CobroOficinaCampos } from '../registrar-entrega/cobro-oficina-campos'
import { camposCobro, datosCobroIniciales, validarCobro, hayErroresCobro, type DatosCobroOficina } from '../registrar-entrega/logica-cobro'
import { PedidoDocumentLinks, type AccesoDocumentosPedido } from './pedido-document-links'

interface ClienteCobro { id: string; nombre: string }
interface Payload { clienteId: string; pagos: LineaCobroFiado[]; offlineId: string; versionDeuda: string
  recibioDinero?: 'OFICINA' | 'REPARTIDOR'; repartidorId?: string; fechaRecepcion?: string }
interface Borrador {
  cliente: ClienteCobro; referencia: string; lineas: Array<{ metodo: string; monto: string }>
  cobro: DatosCobroOficina; etapa: 'editar' | 'revisar' | 'pendiente' | 'revisar-cambio'
  cuerpo?: Payload; motivo?: 'enviando' | 'network' | 'timeout' | 'incierto' | 'rechazado'
  preparacion?: PreparacionCobroFiado
  consultadoAt?: string
}
interface Props extends AccesoDocumentosPedido {
  cliente: ClienteCobro | null; actorId: string | null; visible: boolean
  onClose: () => void; onRegistrado: () => void
}
const dinero = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP',
  minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n)
const METODOS = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata', BONO: 'Bono' }
const storageKey = (actor: string) => `bambu:fiados:borradores:${actor}`
function leerBorradores(actor: string): Borrador[] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey(actor)) || '[]')
    return Array.isArray(raw) ? raw.filter((x): x is Borrador => !!x && typeof x === 'object'
      && typeof x.referencia === 'string' && typeof x.cliente?.id === 'string' && Array.isArray(x.lineas)) : []
  } catch { return [] }
}

/** #515/#498: escritorio y móvil comparten estado, identidad y revisión del cobro. */
export function CobroFiadoDialog({ cliente, actorId, visible, userRole, onClose, onRegistrado, onOpenPedido, onOpenFactura }: Props) {
  const [draft, setDraft] = useState<Borrador | null>(null)
  const draftRef = useRef<Borrador | null>(null)
  const [preparacion, setPreparacion] = useState<PreparacionCobroFiado | null>(null)
  const [resultado, setResultado] = useState<ResultadoCobroFiado | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [recientes, setRecientes] = useState<ResultadoCobroFiado[]>([])
  const [locales, setLocales] = useState<Borrador[]>([])
  const [errorRecientes, setErrorRecientes] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const gestion = useGestionAdmin(userRole === 'ADMIN')
  const puedeCobrar = userRole === 'ADMIN' || userRole === 'ASISTENTE'
  const onRegistradoRef = useRef(onRegistrado)
  useEffect(() => { onRegistradoRef.current = onRegistrado }, [onRegistrado])

  const guardar = useCallback((next: Borrador | null, quitar?: string) => {
    draftRef.current = next; setDraft(next)
    if (!actorId) return false
    const prev = leerBorradores(actorId).filter(d => d.referencia !== (quitar || next?.referencia))
    const all = next ? [...prev, next] : prev
    try { sessionStorage.setItem(storageKey(actorId), JSON.stringify(all)); setLocales(all); return true }
    catch { return false }
  }, [actorId])

  const actualizarRecientes = useCallback(async () => {
    if (!actorId || !visible) return
    try {
      const res = await fetch('/api/pedidos/pagar-fiado?recientes=true', { cache: 'no-store', signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error('No se pudieron consultar los pagos recientes.')
      const data = await res.json()
      if (Array.isArray(data.resultados)) { setRecientes(data.resultados); setErrorRecientes(null) }
    } catch { setErrorRecientes('No se pudieron actualizar los pagos recientes. Conservamos los datos anteriores.') }
  }, [actorId, visible])

  useEffect(() => {
    if (!actorId) return
    // Los borradores se consultan después de conocer al usuario; nunca se
    // restauran como un pago confirmado sin respuesta del servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocales(leerBorradores(actorId))
    void actualizarRecientes()
  }, [actorId, actualizarRecientes])

  useEffect(() => {
    if (!cliente || !actorId || !puedeCobrar) return
    const guardado = leerBorradores(actorId).find(d => d.cliente.id === cliente.id)
    const next: Borrador = guardado || { cliente, referencia: generateUUID(), lineas: [{ metodo: '', monto: '' }],
      cobro: datosCobroIniciales(), etapa: 'editar' }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    guardar(next); setPreparacion(next.preparacion ?? null); setResultado(null); setError(null); setErrores({}); setOpen(true)
    let cancelled = false
    // Obtener una revisión verificable al abrir, para conservarla si la señal
    // se pierde mientras el usuario ingresa los medios y montos.
    if (navigator.onLine && next.etapa === 'editar') void fetch(
      `/api/pedidos/pagar-fiado?clienteId=${encodeURIComponent(cliente.id)}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) },
    ).then(async res => {
      if (!res.ok) return
      const data = await res.json()
      const current = draftRef.current
      if (!cancelled && data.preparacion?.clienteId === cliente.id && current?.referencia === next.referencia && current.etapa === 'editar') {
        guardar({ ...current, preparacion: data.preparacion, consultadoAt: new Date().toISOString() })
        setPreparacion(data.preparacion)
      }
    }).catch(() => { /* Revisar reparto conserva su propio error recuperable. */ })
    return () => { cancelled = true }
  }, [cliente, actorId, puedeCobrar, guardar])

  const cerrar = () => { setOpen(false); onClose() }
  const terminar = useCallback(async (data: ResultadoCobroFiado, esperado: Borrador) => {
    const actual = draftRef.current
    if (data.clienteId !== esperado.cliente.id || data.referencia !== esperado.referencia) {
      if (actual?.referencia === esperado.referencia) setError('La respuesta no corresponde a este cobro. Consulta su estado.')
      return
    }
    if (actual?.referencia === esperado.referencia) {
      setResultado(data); guardar(null, esperado.referencia); setPreparacion(null); setError(null)
    } else if (actorId) {
      // Una respuesta tardía no puede reemplazar otro borrador que ya abrió el usuario.
      const remaining = leerBorradores(actorId).filter(d => d.referencia !== esperado.referencia)
      try { sessionStorage.setItem(storageKey(actorId), JSON.stringify(remaining)); setLocales(remaining) } catch { /* La referencia sigue siendo idempotente en el servidor. */ }
    }
    setRecientes(prev => [data, ...prev.filter(r => r.referencia !== data.referencia)].slice(0, 10))
    if (data.referencia) {
      // Solo se retira la solicitud de esta referencia después del acuse real.
      try {
        await offlineDb.requestQueue.where('offlineId').equals(data.referencia).delete()
        await offlineDb.failedItems.where('offlineId').equals(data.referencia).delete()
      } catch { /* Un fallo de caché local no convierte un pago confirmado por el servidor en incierto. */ }
    }
    onRegistradoRef.current()
  }, [guardar, actorId])

  const consultarEstado = useCallback(async () => {
    const actual = draftRef.current
    if (!actual || busyRef.current) return
    busyRef.current = true; setBusy(true); setError(null)
    try {
      const q = new URLSearchParams({ clienteId: actual.cliente.id, offlineId: actual.referencia })
      const res = await fetch(`/api/pedidos/pagar-fiado?${q}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'No se pudo consultar el estado.')
      if (data.estado === 'REGISTRADO') await terminar(data, actual)
      else if (data.estado === 'REGISTRADO_LEGACY') setError('Este cobro ya está registrado. Consulta los pedidos relacionados; no lo registres de nuevo.')
      else {
        const rechazado = await offlineDb.failedItems.where('offlineId').equals(actual.referencia).first()
        if (rechazado) { guardar({ ...actual, etapa: 'revisar-cambio', motivo: 'rechazado' }); setError(rechazado.lastError || 'El cobro requiere revisión.') }
        else setError('Todavía no encontramos un resultado registrado. Puede estar pendiente de envío o procesamiento. Conserva esta referencia.')
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo consultar el estado. Conserva la referencia.') }
    finally { busyRef.current = false; setBusy(false) }
  }, [guardar, terminar])

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<{ offlineId: string; localEndpoint: string; status: string; reason?: string }>).detail
      if (detail.localEndpoint !== 'pagar-fiado') return
      if (detail.offlineId === draftRef.current?.referencia) {
        if (detail.status === 'dlq') {
          guardar({ ...draftRef.current, etapa: 'revisar-cambio', motivo: 'rechazado' })
          setError(detail.reason || 'El cobro requiere revisión antes de registrarse.')
        } else void consultarEstado()
      }
      void actualizarRecientes()
    }
    window.addEventListener(SYNC_ITEM_DONE_EVENT, listener)
    return () => window.removeEventListener(SYNC_ITEM_DONE_EVENT, listener)
  }, [guardar, consultarEstado, actualizarRecientes])

  function editarLinea(index: number, field: 'metodo' | 'monto', value: string) {
    if (!draft) return
    guardar({ ...draft, lineas: draft.lineas.map((l, i) => i === index ? { ...l, [field]: value } : l), etapa: 'editar', cuerpo: undefined })
    setPreparacion(null)
  }

  async function revisar() {
    const actual = draftRef.current
    if (!actual || busyRef.current) return
    const fallos: Record<string, string> = {}
    const pagos: LineaCobroFiado[] = []
    actual.lineas.forEach((l, i) => {
      const metodo = metodoFiadoSchema.safeParse(l.metodo), monto = importeFiadoSchema.safeParse(l.monto)
      if (!metodo.success) fallos[`metodo-${i}`] = 'Selecciona el medio.'
      if (!monto.success) fallos[`monto-${i}`] = 'Ingresa un monto mayor que cero, con hasta dos decimales.'
      if (metodo.success && monto.success) pagos.push({ metodo: metodo.data, monto: monto.data })
    })
    if (gestion.activa && hayErroresCobro(validarCobro(actual.cobro))) fallos.oficina = 'Revisa quién recibió el dinero y la fecha.'
    setErrores(fallos)
    if (Object.keys(fallos).length) { document.getElementById(Object.keys(fallos)[0])?.focus(); return }
    busyRef.current = true; setBusy(true); setError(null)
    try {
      let prep: PreparacionCobroFiado
      if (!navigator.onLine) {
        if (!actual.preparacion) throw new Error('Sin conexión. El borrador está guardado; necesitas conexión para consultar por primera vez el reparto de este cliente.')
        prep = actual.preparacion
      } else {
        const res = await fetch(`/api/pedidos/pagar-fiado?clienteId=${encodeURIComponent(actual.cliente.id)}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
        const data = await res.json()
        if (!res.ok || !data.preparacion) throw new Error(data.error?.message || 'No se pudo revisar la deuda del cliente.')
        prep = data.preparacion
      }
      if (prep.clienteId !== actual.cliente.id) throw new Error('La consulta no corresponde al cliente elegido.')
      if (!prep.pedidos.length) throw new Error('El cliente no tiene deuda pendiente de pedidos entregados. Actualiza Fiados.')
      const cuerpo: Payload = { clienteId: actual.cliente.id, pagos, offlineId: actual.referencia,
        versionDeuda: prep.version, ...(gestion.activa ? camposCobro(actual.cobro) : {}) }
      if (draftRef.current?.referencia !== actual.referencia) return
      setPreparacion(prep); guardar({ ...actual, etapa: 'revisar', cuerpo, preparacion: prep,
        consultadoAt: navigator.onLine ? new Date().toISOString() : actual.consultadoAt })
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo revisar la deuda.') }
    finally { busyRef.current = false; setBusy(false) }
  }

  async function registrar(reintento = false) {
    const actual = draftRef.current
    if (!actual?.cuerpo || busyRef.current) return
    if (!reintento && actual.etapa !== 'revisar') return
    if (!guardar({ ...actual, etapa: 'pendiente', motivo: 'enviando' })) { setError('Este dispositivo no pudo guardar la referencia de recuperación. Revisa su almacenamiento antes de registrar el pago.'); return }
    busyRef.current = true; setBusy(true); setError(null)
    try {
      if (reintento && await offlineDb.requestQueue.where('offlineId').equals(actual.referencia).first()) {
        await syncWithServer()
        busyRef.current = false; setBusy(false)
        await consultarEstado()
        return
      }
      const r = await fetchResilient<ResultadoCobroFiado & { estado?: string }>(
        '/api/pedidos/pagar-fiado', { method: 'POST', body: actual.cuerpo, localEndpoint: 'pagar-fiado' })
      if (r.status === 'ok') {
        if (r.data.estado === 'REGISTRADO_LEGACY') { guardar({ ...actual, etapa: 'pendiente', motivo: 'incierto' }); setError('El cobro ya estaba registrado. Consulta su estado; no lo registres de nuevo.') }
        else await terminar(r.data, actual)
      } else if (r.status === 'offline') guardar({ ...actual, etapa: 'pendiente', motivo: r.reason })
      else if (r.statusCode >= 400 && r.statusCode < 500) { guardar({ ...actual, etapa: 'revisar-cambio', motivo: 'rechazado' }); setError(r.error) }
      else { guardar({ ...actual, etapa: 'pendiente', motivo: 'incierto' }); setError(r.error) }
    } catch { guardar({ ...actual, etapa: 'pendiente', motivo: 'incierto' }); setError('No se pudo verificar el resultado. Conserva la referencia y consulta su estado antes de repetir el cobro.') }
    finally { busyRef.current = false; setBusy(false) }
  }

  const abrirGuardado = (d: Borrador) => { guardar(d); setResultado(null); setPreparacion(null); setError(null); setOpen(true) }
  const abrirResultado = (r: ResultadoCobroFiado) => { setResultado(r); setDraft(null); draftRef.current = null; setError(null); setOpen(true) }
  const pagos = draft?.cuerpo?.pagos ?? []
  const monto = sumarCobroFiado(pagos)
  const reparto = preparacion ? repartirCobroFiado(preparacion.pedidos, monto) : null
  const pendiente = draft?.etapa === 'pendiente'
  const returnLabel = resultado ? 'Volver al resultado del pago' : 'Volver a la revisión del pago'
  const docs = (p: { pedidoId: string; numero: number; facturaId?: string; facturaNumero?: string }) => <PedidoDocumentLinks
    {...p} userRole={userRole} onOpenPedido={onOpenPedido} onOpenFactura={onOpenFactura} volver={returnLabel} />
  const bodyClass = 'min-h-11 w-full rounded-lg border border-gray-300 p-2 text-sm'

  return <>
    {visible && (errorRecientes || recientes.length > 0 || locales.some(d => d.etapa === 'pendiente' || d.etapa === 'revisar-cambio')) && <section className="mb-4 space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Estado de cobros">
      <h2 className="font-semibold text-blue-950">Pagos recientes y pendientes</h2>
      {errorRecientes && <p role="alert" className="text-sm">{errorRecientes} <button className="min-h-11 underline" onClick={() => void actualizarRecientes()}>Reintentar consulta de pagos</button></p>}
      {locales.filter(d => d.etapa === 'pendiente' || d.etapa === 'revisar-cambio').map(d => <div key={d.referencia} className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>{d.cliente.nombre} · {d.etapa === 'revisar-cambio' ? 'Requiere revisión' : 'Pendiente de verificar o sincronizar'}</p><button className="min-h-11 underline" onClick={() => abrirGuardado(d)}>Ver estado del cobro</button></div>)}
      {recientes.map(r => <div key={r.referencia || r.registradoAt} className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>{r.clienteNombre} · Registrado {dinero(r.montoRecibido)}</p><button className="min-h-11 underline" onClick={() => abrirResultado(r)}>Ver resultado y documentos</button></div>)}
    </section>}
    <Modal open={open} onClose={cerrar} title="Cobro de fiado" data-testid="cobro-fiado-dialog"
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4"><div><p className="text-sm text-gray-500">{resultado?.clienteNombre || draft?.cliente.nombre}</p><h2 className="text-xl font-semibold">{resultado ? 'Pago registrado' : pendiente ? draft.motivo === 'network' ? 'Pago guardado en este dispositivo' : 'Estado del registro por verificar' : draft?.etapa === 'revisar' ? 'Revisar antes de registrar' : 'Registrar pago del cliente'}</h2></div><button className="min-h-11 min-w-11 rounded border px-3" aria-label="Cerrar pago" onClick={cerrar}>×</button></header>
      <div className="min-h-0 overflow-y-auto p-4">
        {error && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{error}</p>}
        {busy && <p role="status" className="mb-3 text-sm text-gray-500">{pendiente ? 'Verificando el registro…' : 'Consultando la deuda…'}</p>}
        {resultado ? <>
          <div className="grid gap-3 sm:grid-cols-3">{[['Registrado', resultado.montoRecibido], ['Aplicado a deuda', resultado.montoAplicado], ['Saldo a favor', resultado.saldoFavorAcreditado]].map(([label, value]) => <div className="rounded-lg bg-gray-50 p-3" key={label}><p className="text-sm">{label}</p><strong className="text-lg">{dinero(Number(value))}</strong></div>)}</div>
          <p className="my-3 break-all text-xs text-gray-500">Referencia: {resultado.referencia} · {new Date(resultado.registradoAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>
          {resultado.recepcion && <p className="mb-3 text-sm">Recibió: {resultado.recepcion.nombre} · Fecha de recepción: {new Date(resultado.recepcion.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</p>}
          {resultado.pagosAplicados.map(p => <div className="border-t py-3" key={p.pedidoId}><h3 className="font-semibold">Pedido #{p.numero}: aplicado {dinero(p.montoAplicado)}</h3><p className="text-sm">Saldo después del registro: {dinero(p.saldoRestante)}</p>{docs(p)}</div>)}
          {resultado.medios.map((m, i) => <div key={i} className={`mt-2 rounded-lg p-3 text-sm ${m.confirmacion === 'REPORTADO' ? 'bg-amber-50 text-amber-900' : 'bg-gray-50'}`}><p>{METODOS[m.metodo]}: {dinero(m.monto)} · Aplicado {dinero(m.montoAplicado)}{m.saldoFavor > 0 ? ` · Saldo a favor ${dinero(m.saldoFavor)}` : ''}</p><p>Estado al registrar: {m.confirmacion === 'REPORTADO' ? 'reportado, pendiente de confirmación por la persona autorizada.' : m.confirmacion === 'CONFIRMADO' ? 'pago aplicado confirmado según la regla de este medio.' : 'saldo a favor, sin aplicación a pedidos.'}</p></div>)}
          <p className="mt-3 text-xs text-gray-500">Este es el resultado del registro. El estado actual de cada pedido y sus pagos se consulta en sus detalles.</p>
        </> : pendiente ? <>
          <p className="rounded-lg bg-amber-50 p-3 text-sm">{draft.motivo === 'network' ? 'Falta conexión para enviar y verificar el pago.' : 'No tenemos una respuesta confirmada. El servidor pudo haber registrado el pago.'} No lo registres como un cobro nuevo.</p>
          <p className="mt-3 text-sm">Conservamos los datos y la misma referencia para consultar o sincronizar.</p><p className="mt-3 break-all text-xs text-gray-500">Referencia: {draft.referencia}</p>
        </> : draft?.etapa === 'revisar' && preparacion && reparto ? <>
          <p className="mb-3 text-sm text-blue-900">El cobro considera toda la deuda entregada de este cliente, aunque la lista tenga un filtro de fecha.</p>
          {!navigator.onLine && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm">Sin conexión. Usamos la deuda consultada {draft.consultadoAt ? new Date(draft.consultadoAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'anteriormente'}. El servidor la verificará al sincronizar; si cambió, tendrás que revisar el reparto.</p>}
          <div className="grid gap-3 sm:grid-cols-3">{[['Monto a registrar', monto], ['A deuda entregada', monto - reparto.sobrante], ['Saldo a favor', reparto.sobrante]].map(([label, value]) => <div className="rounded-lg bg-gray-50 p-3" key={label}><p className="text-sm">{label}</p><strong className="text-lg">{dinero(Number(value))}</strong></div>)}</div>
          <p className="my-3 font-semibold">Se aplicará del pedido entregado más antiguo al más reciente:</p>
          {reparto.aplicaciones.map(p => <div key={p.pedidoId} className="border-t py-3"><h3 className="font-semibold">Pedido #{p.numero}{p.facturaNumero ? ` · Factura ${p.facturaNumero}` : ''}</h3><p className="mt-1 text-sm">Se aplica {dinero(p.montoAplicado)} · Queda {dinero(p.saldoRestante)}</p>{docs(p)}</div>)}
          <div className="my-3 rounded-lg bg-gray-50 p-3 text-sm">{pagos.map((p, i) => <p key={i}>{METODOS[p.metodo]}: {dinero(p.monto)}{preparacion.metodosPorConfirmar.includes(p.metodo) ? ' · por confirmar al registrar' : ''}</p>)}<p className="mt-2">{gestion.activa ? `Recepción: ${draft.cobro.fecha} · ${draft.cobro.quien === 'OFICINA' ? 'Oficina' : gestion.repartidores.find(r => r.id === draft.cobro.repartidorId)?.nombre || 'Repartidor'}` : 'Fecha de registro: el servidor la asignará al registrar.'}</p></div>
          {reparto.sobrante > 0 && <p className="my-3 rounded-lg bg-amber-50 p-3 text-sm">El excedente quedará como saldo a favor del cliente. No se aplicará a pedidos sin entregar.</p>}
          <p className="text-sm text-gray-600">Registrar un medio digital y verificar que el dinero llegó son pasos diferentes. El servidor volverá a comprobar el reparto antes de registrar.</p>
        </> : draft && <>
          <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-950">El pago se aplica a la deuda entregada más antigua del cliente, de todas las fechas. Los filtros de Fiados solo cambian la consulta.</p>
          <p className="mb-3 text-sm">Registra el dinero recibido por cada medio. Puedes abonar una parte de la deuda.</p>
          {preparacion && <p className="mb-3 text-sm font-semibold" data-testid="deuda-cliente-preparada">Deuda entregada consultada: {dinero(preparacion.deudaTotal)}</p>}
          {draft.lineas.map((l, i) => <div key={i} className="mb-3 grid grid-cols-[1fr_1fr_auto] items-start gap-2"><div className="min-w-0 text-sm"><label htmlFor={`metodo-${i}`}>Medio {i + 1}</label><select id={`metodo-${i}`} value={l.metodo} onChange={e => editarLinea(i, 'metodo', e.target.value)} aria-invalid={!!errores[`metodo-${i}`]} className={bodyClass}><option value="">Seleccionar…</option>{Object.entries(METODOS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{errores[`metodo-${i}`] && <small className="text-red-700">{errores[`metodo-${i}`]}</small>}</div><div className="min-w-0 text-sm"><label htmlFor={`monto-${i}`}>Monto {i + 1}</label><input id={`monto-${i}`} placeholder="Monto a pagar" inputMode="decimal" type="number" min="0.01" step="0.01" value={l.monto} onChange={e => editarLinea(i, 'monto', e.target.value)} aria-invalid={!!errores[`monto-${i}`]} className={bodyClass} />{errores[`monto-${i}`] && <small className="text-red-700">{errores[`monto-${i}`]}</small>}</div><button className="mt-5 min-h-11 min-w-11 rounded border" aria-label={`Quitar medio ${i + 1}`} disabled={draft.lineas.length === 1} onClick={() => guardar({ ...draft, lineas: draft.lineas.filter((_, index) => i !== index) })}>×</button></div>)}
          <button className="mb-4 min-h-11 rounded-lg border px-4 text-sm" disabled={draft.lineas.length >= 10} onClick={() => guardar({ ...draft, lineas: [...draft.lineas, { metodo: '', monto: '' }] })}>Añadir otro medio</button>
          {gestion.activa && <CobroOficinaCampos datos={draft.cobro} errores={validarCobro(draft.cobro)} intento={Object.keys(errores).length > 0} repartidores={gestion.repartidores} onChange={patch => guardar({ ...draft, cobro: { ...draft.cobro, ...patch } })} />}
          {errores.oficina && <p role="alert" className="mt-2 text-sm text-red-700">{errores.oficina}</p>}
        </>}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-white p-4">
        {resultado ? <button className="min-h-11 rounded-lg bg-blue-600 px-4 text-white" onClick={cerrar}>Volver a Fiados</button>
          : pendiente ? <><button className="min-h-11 rounded-lg border px-3" disabled={busy} onClick={() => void consultarEstado()}>Consultar estado del registro</button><button className="min-h-11 rounded-lg border px-3" disabled={busy} onClick={() => void registrar(true)}>Reintentar con la misma referencia</button><button className="min-h-11 rounded-lg bg-blue-600 px-4 text-white" onClick={cerrar}>Volver a Fiados</button></>
          : draft?.etapa === 'revisar' ? <><button className="min-h-11 rounded-lg border px-4" disabled={busy} onClick={() => guardar({ ...draft, etapa: 'editar', cuerpo: undefined })}>Volver a editar</button><button className="min-h-11 rounded-lg bg-blue-600 px-4 text-white disabled:opacity-50" disabled={busy || !puedeCobrar} onClick={() => void registrar()}>Registrar {dinero(monto)}</button></>
          : <><button className="min-h-11 rounded-lg border px-4" disabled={busy} onClick={() => { if (draft) guardar(null, draft.referencia); cerrar() }}>Cancelar</button><button className="min-h-11 rounded-lg bg-blue-600 px-4 text-white disabled:opacity-50" disabled={busy || !puedeCobrar} onClick={() => void revisar()}>{draft?.etapa === 'revisar-cambio' ? 'Actualizar reparto' : 'Revisar reparto'}</button></>}
      </footer>
    </Modal>
  </>
}
