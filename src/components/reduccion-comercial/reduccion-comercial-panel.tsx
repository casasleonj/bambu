'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import { formatCurrency } from '@/lib/utils'
import { generateUUID } from '@/lib/uuid'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { topeReduccion } from '@/modules/pedidos/domain/services/reduccion-comercial.service'

interface LineaReducible {
  producto: string
  cantPedido: number
  cantEntrega: number
  precio: number
}

interface Reduccion {
  id: string
  producto: string
  cantidadReducida: number
  cantPedidoAntes: number
  cantPedidoDespues: number
  monto: number
  motivo: string
  aceptadoPor: string
  medio: string
  estado: 'PENDIENTE' | 'APLICADA' | 'RECHAZADA'
  solicitadoAt: string
  resueltoAt: string | null
  solicitadoPor: { nombre: string }
  resueltoPor: { nombre: string } | null
  notaCredito: { numero: string } | null
  totalAntes: number | null
  totalDespues: number | null
}

interface Contexto {
  yo: { nombre: string }
  puedeAutorizar: boolean
  cliente: { titular: string; tienda: string | null; contactos: Array<{ id: string; nombre: string; relacion: string | null }> }
  reducciones: Reduccion[]
}

interface Props {
  pedidoId: string
  lineas: LineaReducible[]
  userRole?: string | null
  /** Pedido cancelado/anulado: solo se muestra el historial. */
  reducible: boolean
  total: number
  totalPagado: number
}

const MEDIOS = [
  { valor: 'TELEFONO', etiqueta: 'Por teléfono', texto: 'por teléfono' },
  { valor: 'PRESENCIAL', etiqueta: 'En persona', texto: 'en persona' },
  { valor: 'MENSAJE', etiqueta: 'Por mensaje', texto: 'por mensaje' },
] as const
type Medio = (typeof MEDIOS)[number]['valor']

const MOTIVOS = ['Ya no necesita el resto', 'Compró en otro lado', 'No quiere esperar'] as const
const OTRO = 'otro'

const BADGE: Record<Reduccion['estado'], string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  APLICADA: 'bg-green-100 text-green-800',
  RECHAZADA: 'bg-gray-100 text-gray-700',
}
const TEXTO: Record<Reduccion['estado'], string> = { PENDIENTE: 'Pendiente', APLICADA: 'Aplicada', RECHAZADA: 'Rechazada' }

const centavos = (n: number) => Math.round(n * 100)
const fechaCorta = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const chipCls = (on: boolean) =>
  `min-h-11 rounded-full border px-3 text-left text-sm ${on ? 'border-blue-600 bg-blue-50 font-semibold text-gray-900' : 'border-gray-300 bg-white text-gray-800'}`

/**
 * Reducción comercial aceptada (#451, #541): «el cliente ya no quiere el resto».
 * Sigue la maqueta aprobada: el sistema completa lo que sabe (producto, cantidad propuesta con su
 * tope, titular como quien aceptó) y el usuario decide solo cómo lo dijo (sin valor por defecto)
 * y el motivo. Detrás de `NEXT_PUBLIC_CIERRE_V2`: quien la monta decide si la muestra.
 */
export function ReduccionComercialPanel({ pedidoId, lineas, userRole, reducible, total, totalPagado }: Props) {
  const puedePedir = reducible && (userRole === 'ADMIN' || userRole === 'ASISTENTE')
  const [ctx, setCtx] = useState<Contexto | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [producto, setProducto] = useState('')
  const [cantidad, setCantidad] = useState<number | null>(null)
  const [quien, setQuien] = useState<string>('titular')
  const [otraPersona, setOtraPersona] = useState('')
  const [medio, setMedio] = useState<Medio | null>(null)
  const [motivoSel, setMotivoSel] = useState<string | null>(null)
  const [motivoOtro, setMotivoOtro] = useState('')
  const [rechazando, setRechazando] = useState<string | null>(null)
  const [notaRechazo, setNotaRechazo] = useState('')
  // Una clave por borrador: un reintento no duplica la solicitud.
  const [offlineId, setOfflineId] = useState(() => generateUUID())

  useEffect(() => {
    let cancelado = false
    fetch(`/api/pedidos/${pedidoId}/reducciones-comerciales`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Contexto) => {
        if (cancelado) return
        setCtx(d)
        setError(false)
        setCargando(false)
      })
      .catch(() => {
        if (cancelado) return
        setError(true)
        setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [pedidoId, version])

  const recargar = useCallback(() => {
    setCargando(true)
    setVersion((v) => v + 1)
  }, [])

  // Tope por línea: lo pendiente, acotado por lo ya pagado (misma regla que el servidor).
  const topes = useMemo(
    () =>
      lineas.map((l) => ({
        ...l,
        pendiente: Math.max(0, l.cantPedido - l.cantEntrega),
        tope: topeReduccion({
          total, totalPagado, cantPedido: l.cantPedido, cantEntrega: l.cantEntrega, precio: l.precio,
          unidadesOtrasLineas: lineas.filter((o) => o.producto !== l.producto).reduce((s, o) => s + o.cantPedido, 0),
        }),
      })),
    [lineas, total, totalPagado],
  )
  const reducibles = topes.filter((l) => l.tope > 0)
  const conPendiente = topes.filter((l) => l.pendiente > 0)
  const linea = reducibles.find((l) => l.producto === producto) ?? reducibles[0]
  const cantEfectiva = linea ? Math.min(Math.max(1, cantidad ?? linea.tope), linea.tope) : 0
  const montoC = linea ? centavos(linea.precio) * cantEfectiva : 0
  const totalNuevoC = centavos(total) - montoC
  const topeBajoPendiente = Boolean(linea && linea.tope < linea.pendiente)

  const titular = ctx?.cliente.titular ?? ''
  const nombreAceptante =
    quien === 'titular' ? titular : quien === 'otra' ? otraPersona.trim() : (ctx?.cliente.contactos.find((c) => c.id === quien)?.nombre ?? '')
  const medioSel = MEDIOS.find((m) => m.valor === medio)
  const motivoTexto = motivoSel === OTRO ? motivoOtro.trim() : (motivoSel ?? '')

  const faltan: string[] = []
  if (quien === 'otra' && nombreAceptante.length < 2) faltan.push('quién lo aceptó')
  if (!medio) faltan.push('cómo lo dijo')
  if (motivoTexto.length < 3) faltan.push('el motivo')
  const completo = Boolean(linea) && faltan.length === 0

  function abrirFormulario() {
    setProducto(reducibles[0]?.producto ?? '')
    setCantidad(null)
    setQuien('titular')
    setOtraPersona('')
    setMedio(null)
    setMotivoSel(null)
    setMotivoOtro('')
    setErrorEnvio(null)
    setConfirmando(false)
    setAbierto(true)
  }

  async function enviar() {
    if (!completo || !linea || !medio || enviando) return
    setEnviando(true)
    setErrorEnvio(null)
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/reducir-pedido`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto: linea.producto, cantidadReducida: cantEfectiva, motivo: motivoTexto, aceptadoPor: nombreAceptante, medio, offlineId }),
      })
      const data = (await res.json()) as { estado?: string; error?: { message?: string; code?: string } }
      if (!res.ok) {
        setConfirmando(false)
        setErrorEnvio(
          data.error?.code === 'REDUCCION_OBSOLETA' || data.error?.code === 'REDUCCION_SOBRE_ENTREGADO'
            ? 'La línea cambió desde que se preparó la reducción. Recarga el pedido y vuelve a intentarlo.'
            : (data.error?.message ?? 'No se pudo registrar la reducción'),
        )
        return
      }
      toast.success(data.estado === 'APLICADA' ? 'Reducción aplicada: el total y la factura se recalcularon.' : 'Solicitud enviada: quien autoriza reducciones debe aplicarla.')
      setConfirmando(false)
      setAbierto(false)
      setOfflineId(generateUUID())
      recargar()
    } catch {
      setConfirmando(false)
      setErrorEnvio('Sin conexión: la reducción necesita red. Lo que elegiste sigue en el formulario; intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  async function resolver(id: string, resolucion: 'AUTORIZAR' | 'RECHAZAR') {
    try {
      const res = await fetch(`/api/pedidos/reducciones-comerciales/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolucion, ...(resolucion === 'RECHAZAR' && notaRechazo.trim() ? { nota: notaRechazo.trim() } : {}) }),
      })
      const data = (await res.json()) as { error?: { message?: string } }
      if (!res.ok) {
        toast.error(data.error?.message ?? 'No se pudo resolver la solicitud')
        return
      }
      toast.success(resolucion === 'AUTORIZAR' ? 'Reducción autorizada y aplicada.' : 'Solicitud rechazada.')
      setRechazando(null)
      setNotaRechazo('')
      recargar()
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.')
    }
  }

  const filas = ctx?.reducciones ?? []
  const puedeAutorizar = Boolean(ctx?.puedeAutorizar)
  const hayPendiente = filas.some((f) => f.estado === 'PENDIENTE')
  const puedeAbrir = puedePedir && reducibles.length > 0
  const bloqueadoPorPago = puedePedir && conPendiente.length > 0 && reducibles.length === 0

  if (!cargando && !error && filas.length === 0 && !puedeAbrir && !bloqueadoPorPago) return null

  return (
    <div className="rounded-lg border bg-white p-3" data-testid="reduccion-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Reducir el pedido</h3>
        {puedeAbrir && !abierto && (
          <button type="button" onClick={abrirFormulario} className="min-h-11 rounded-lg border px-3 text-sm font-medium text-blue-700" data-testid="reduccion-abrir">
            El cliente ya no quiere el resto
          </button>
        )}
      </div>

      {bloqueadoPorPago && !abierto && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="reduccion-bloqueada">
          El cliente ya pagó {formatCurrency(totalPagado)}, todo el pedido. No se puede quitar nada sin reversar un pago antes.
        </p>
      )}

      {errorEnvio && !abierto && (
        <p className="mt-3 rounded-lg bg-red-700 p-3 text-sm text-white" role="alert" data-testid="reduccion-error-envio">{errorEnvio}</p>
      )}

      {abierto && linea && (
        <div className="mt-3 space-y-4" data-testid="reduccion-form">
          {topeBajoPendiente && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status" data-testid="reduccion-tope-aviso">
              El cliente ya pagó {formatCurrency(totalPagado)}. Como máximo puedes quitar {linea.tope}{' '}
              {linea.tope === 1 ? 'unidad' : 'unidades'}: con {linea.pendiente} el pedido costaría{' '}
              {formatCurrency((centavos(total) - centavos(linea.precio) * linea.pendiente) / 100)}, menos de lo pagado, y eso requiere reversar un pago primero.
            </p>
          )}
          {errorEnvio && (
            <p className="rounded-lg bg-red-700 p-3 text-sm text-white" role="alert" data-testid="reduccion-error-envio">{errorEnvio}</p>
          )}

          <div className="space-y-1.5">
            <p className="text-xs text-gray-600">
              <b className="text-sm font-semibold text-gray-900">Cantidad que deja de pedir</b>
              {reducibles.length > 1 ? '' : ` · ${getProductoIconConfig(linea.producto).label}, faltan ${linea.pendiente} por entregar`}
            </p>
            {reducibles.length > 1 && (
              <select
                value={linea.producto}
                onChange={(e) => { setProducto(e.target.value); setCantidad(null) }}
                className="h-11 w-full rounded-lg border px-2 text-sm"
                aria-label="Producto"
                data-testid="reduccion-producto"
              >
                {reducibles.map((l) => (
                  <option key={l.producto} value={l.producto}>
                    {getProductoIconConfig(l.producto).label} (faltan {l.pendiente})
                  </option>
                ))}
              </select>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={enviando || cantEfectiva <= 1} onClick={() => setCantidad(cantEfectiva - 1)} aria-label="Quitar una" className="h-11 w-11 rounded-lg border text-xl disabled:opacity-40" data-testid="reduccion-menos">−</button>
              <span className="min-w-16 text-center text-xl font-bold tabular-nums" role="status" data-testid="reduccion-cantidad">{cantEfectiva}</span>
              <button type="button" disabled={enviando || cantEfectiva >= linea.tope} onClick={() => setCantidad(cantEfectiva + 1)} aria-label="Agregar una" className="h-11 w-11 rounded-lg border text-xl disabled:opacity-40" data-testid="reduccion-mas">+</button>
              <span className="text-xs text-gray-600">{cantEfectiva === linea.pendiente ? 'Todo lo pendiente' : topeBajoPendiente && cantEfectiva === linea.tope ? 'Tope por lo ya pagado' : 'Parte de lo pendiente'} · máximo {linea.tope}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-gray-600"><b className="text-sm font-semibold text-gray-900">¿Quién lo aceptó?</b> · del lado del cliente</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quién lo aceptó">
              <button type="button" role="radio" aria-checked={quien === 'titular'} onClick={() => setQuien('titular')} className={chipCls(quien === 'titular')} data-testid="reduccion-quien-titular">
                {titular || 'Titular'}<small className="block text-[11px] font-normal text-gray-500">Titular</small>
              </button>
              {(ctx?.cliente.contactos ?? []).map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={quien === c.id} onClick={() => setQuien(c.id)} className={chipCls(quien === c.id)} data-testid={`reduccion-quien-${c.id}`}>
                  {c.nombre}<small className="block text-[11px] font-normal text-gray-500">{c.relacion ? `${c.relacion} · contacto` : 'Contacto'}</small>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={quien === 'otra'} onClick={() => setQuien('otra')} className={chipCls(quien === 'otra')} data-testid="reduccion-quien-otra">Otra persona</button>
            </div>
            {quien === 'otra' && (
              <input value={otraPersona} onChange={(e) => setOtraPersona(e.target.value)} maxLength={120} aria-label="Nombre de quien lo aceptó" placeholder="Nombre de quien habló" className="h-11 w-full rounded-lg border px-3 text-sm" data-testid="reduccion-otra-nombre" />
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-gray-600"><b className="text-sm font-semibold text-gray-900">¿Cómo lo dijo?</b> · obligatorio</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Cómo lo dijo">
              {MEDIOS.map((m) => (
                <button key={m.valor} type="button" role="radio" aria-checked={medio === m.valor} onClick={() => setMedio(m.valor)} className={`${chipCls(medio === m.valor)} rounded-lg text-center`} data-testid={`reduccion-medio-${m.valor}`}>
                  {m.etiqueta}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-gray-900">Motivo</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Motivo">
              {MOTIVOS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={motivoSel === m} onClick={() => setMotivoSel(m)} className={chipCls(motivoSel === m)} data-testid="reduccion-motivo-chip">{m}</button>
              ))}
              <button type="button" role="radio" aria-checked={motivoSel === OTRO} onClick={() => setMotivoSel(OTRO)} className={chipCls(motivoSel === OTRO)} data-testid="reduccion-motivo-otro">Otro…</button>
            </div>
            {motivoSel === OTRO && (
              <textarea value={motivoOtro} onChange={(e) => setMotivoOtro(e.target.value)} rows={2} maxLength={500} aria-label="Motivo" placeholder="Cuéntalo en una frase" className="w-full rounded-lg border px-3 py-2 text-sm" data-testid="reduccion-motivo-texto" />
            )}
          </div>

          <p className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-900" role="status" data-testid="reduccion-efecto">
            El total baja <b className="tabular-nums">{formatCurrency(montoC / 100)}</b> ({cantEfectiva} × {formatCurrency(linea.precio)}) y queda en{' '}
            <b className="tabular-nums">{formatCurrency(totalNuevoC / 100)}</b>. Se emite una nota de crédito por ese valor.
          </p>

          <div className="grid gap-0.5 rounded-lg border bg-gray-50 p-3 text-sm" data-testid="reduccion-auto">
            <span><span className="text-gray-500">Se registra a nombre de</span> {ctx?.yo.nombre || 'tu usuario'} (tú)</span>
            <span><span className="text-gray-500">Fecha</span> {fechaCorta(new Date().toISOString())} · <span className="text-gray-500">Precio</span> {formatCurrency(linea.precio)} c/u</span>
          </div>

          {faltan.length > 0 && (
            <p className="text-sm text-gray-600" role="status" data-testid="reduccion-falta">Falta: <b className="text-amber-800">{faltan.join(' y ')}.</b></p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={() => setAbierto(false)} className="min-h-11 flex-1 rounded-lg border text-sm" data-testid="reduccion-cancelar">Cancelar</button>
            <button type="button" onClick={() => setConfirmando(true)} disabled={!completo} className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-50" data-testid="reduccion-revisar">
              {puedeAutorizar ? 'Revisar y aplicar' : 'Revisar y pedir autorización'}
            </button>
          </div>
        </div>
      )}

      <Modal open={confirmando && Boolean(linea)} onClose={() => !enviando && setConfirmando(false)} title="¿Aplicar esta reducción?" className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" data-testid="reduccion-confirmacion">
        {linea && (
          <div className="space-y-3">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b"><td className="py-1.5">{ctx?.cliente.tienda ?? titular} · {getProductoIconConfig(linea.producto).label.toLowerCase()}</td><td className="py-1.5 text-right tabular-nums">{linea.cantPedido} → {linea.cantPedido - cantEfectiva}</td></tr>
                <tr className="border-b"><td className="py-1.5">Total del pedido</td><td className="py-1.5 text-right tabular-nums">{formatCurrency(total)} → {formatCurrency(totalNuevoC / 100)}</td></tr>
                <tr className="border-b"><td className="py-1.5">Ya pagado</td><td className="py-1.5 text-right tabular-nums">{formatCurrency(totalPagado)}</td></tr>
                <tr className="border-b"><td className="py-1.5">Saldo por cobrar</td><td className="py-1.5 text-right tabular-nums">{formatCurrency(total - totalPagado)} → {formatCurrency((totalNuevoC - centavos(totalPagado)) / 100)}</td></tr>
                <tr><td className="py-1.5 font-bold">Nota de crédito</td><td className="py-1.5 text-right font-bold tabular-nums">{formatCurrency(montoC / 100)}</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-gray-600">
              Lo ya entregado ({linea.cantEntrega}) no cambia. Aceptó {nombreAceptante}{quien === 'titular' ? ' (titular)' : ''}, {medioSel?.texto}. Queda registrado a nombre de {ctx?.yo.nombre || 'tu usuario'} y no se deshace desde esta pantalla.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={() => setConfirmando(false)} disabled={enviando} className="min-h-11 flex-1 rounded-lg border text-sm disabled:opacity-50" data-testid="reduccion-volver">Volver</button>
              <button type="button" onClick={() => void enviar()} disabled={enviando} className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-50" data-testid="reduccion-enviar">
                {enviando ? 'Aplicando…' : puedeAutorizar ? 'Aplicar reducción' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {cargando && <p className="mt-2 text-sm text-gray-400">Cargando…</p>}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          No se pudo cargar el historial.{' '}
          <button type="button" onClick={recargar} className="underline">Reintentar</button>
        </p>
      )}

      {hayPendiente && !puedeAutorizar && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="reduccion-esperando">
          Esperando a quien autoriza. El total sigue en {formatCurrency(total)}.
        </p>
      )}

      {filas.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="reduccion-lista">
          {filas.map((c) => (
            <li key={c.id} className="rounded-lg border p-2 text-sm" data-testid="reduccion-item">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold tabular-nums">
                  {getProductoIconConfig(c.producto).label}: {c.cantPedidoAntes} → {c.cantPedidoDespues} · {formatCurrency(c.monto)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[c.estado]}`}>{TEXTO[c.estado]}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-600">
                {c.motivo} · aceptó {c.aceptadoPor}, {MEDIOS.find((m) => m.valor === c.medio)?.texto ?? c.medio} · pidió {c.solicitadoPor.nombre}
                {c.resueltoPor ? ` · ${c.estado === 'RECHAZADA' ? 'rechazó' : 'autorizó'} ${c.resueltoPor.nombre}` : ''}
              </p>
              {c.estado === 'APLICADA' && c.totalAntes !== null && c.totalDespues !== null && (
                <p className="text-xs text-gray-600">
                  Total {formatCurrency(c.totalAntes)} → {formatCurrency(c.totalDespues)}
                  {c.notaCredito ? ` · ${c.notaCredito.numero}` : ''} · {fechaCorta(c.resueltoAt ?? c.solicitadoAt)}
                </p>
              )}
              {c.estado === 'PENDIENTE' && puedeAutorizar && rechazando !== c.id && (
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void resolver(c.id, 'AUTORIZAR')} className="min-h-11 flex-1 rounded-lg bg-green-600 text-sm font-medium text-white" data-testid="reduccion-autorizar">Autorizar</button>
                  <button type="button" onClick={() => { setRechazando(c.id); setNotaRechazo('') }} className="min-h-11 flex-1 rounded-lg border text-sm" data-testid="reduccion-rechazar">Rechazar</button>
                </div>
              )}
              {c.estado === 'PENDIENTE' && puedeAutorizar && rechazando === c.id && (
                <div className="mt-2 space-y-2">
                  <label className="block text-xs text-gray-600" htmlFor={`nota-${c.id}`}>
                    Nota para quien la pidió (opcional)
                    <input id={`nota-${c.id}`} value={notaRechazo} onChange={(e) => setNotaRechazo(e.target.value)} maxLength={500} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm" data-testid="reduccion-nota-rechazo" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setRechazando(null)} className="min-h-11 flex-1 rounded-lg border text-sm">Volver</button>
                    <button type="button" onClick={() => void resolver(c.id, 'RECHAZAR')} className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white" data-testid="reduccion-confirmar-rechazo">Confirmar rechazo</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
