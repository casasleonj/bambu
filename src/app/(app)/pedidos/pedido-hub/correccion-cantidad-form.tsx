'use client'

import { useEffect, useState } from 'react'
import { AjusteImpacto } from './ajuste-impacto'
import { useAjusteCantidad } from './use-ajuste-cantidad'
import type { AjusteGuardCode } from '@/modules/pedidos/application/use-cases/ProyectarAjusteCantidadUseCase'
import type { Pedido } from '../pedidos-client/types'

const prod = (p: string) => p.replace(/_/g, ' ').toLowerCase()

/**
 * G11 rama A — formulario de corrección de cantidad (plan Fase 6-i).
 *
 * El usuario ya declaró "me equivoqué al capturar" (P3). Elige producto +
 * cantidad correcta + motivo (obligatorio) → se **proyecta** el impacto
 * read-only → revisa → confirma. El backend revalida y recalcula todo.
 *
 * Si un guard del backend bloquea (P4/P5): se muestra el mensaje del guard
 * + las **alternativas válidas como botones que el usuario elige** — el
 * sistema NUNCA convierte la corrección en Nueva Demanda ni en Venta Libre.
 */
export function CorreccionCantidadForm({
  pedido,
  onCancel,
  onMutado,
  onIrANuevaDemanda,
}: {
  pedido: Pedido
  onCancel: () => void
  onMutado: () => void
  /** el usuario elige explícitamente pasar a rama B (no es automático). */
  onIrANuevaDemanda: () => void
}) {
  const items = (pedido.items ?? []).filter((i) => i.cantPedido > 0)
  const [producto, setProducto] = useState(items[0]?.producto ?? '')
  const itemActual = items.find((i) => i.producto === producto)
  const [cantidadNueva, setCantidadNueva] = useState(itemActual?.cantPedido ?? 0)
  const [motivo, setMotivo] = useState('')
  // Guard devuelto por el commit (409), atado a la firma de inputs que lo
  // produjo: al cambiar producto/cantidad, `sig` cambia y el guard deja de
  // aplicar solo — sin setState en efecto (React Compiler / set-state-in-effect).
  const [commitGuard, setCommitGuard] = useState<{ sig: string; guard: AjusteGuardCode } | null>(null)
  const [offlineMsg, setOfflineMsg] = useState(false)
  // F9-iii: 409 sin guard reconocido = conflicto de concurrencia. Atado a la
  // firma de inputs que lo produjo (mismo patrón que `commitGuard`).
  const [commitConflicto, setCommitConflicto] = useState<string | null>(null)
  const a = useAjusteCantidad(pedido.id, onMutado)

  const sig = `${producto}:${cantidadNueva}`
  const conflicto = commitConflicto === sig

  function cambiarProducto(p: string) {
    setProducto(p)
    setCantidadNueva(items.find((i) => i.producto === p)?.cantPedido ?? 0)
  }

  // Proyecta ante cualquier cambio de producto/cantidad (semántica preview).
  useEffect(() => {
    if (!producto || cantidadNueva < 0) { a.limpiar(); return }
    a.proyectar({ producto, cantidadNueva })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto, cantidadNueva])

  // Guard efectivo: el proyectado (preview) o el que devolvió el commit para
  // estos mismos inputs.
  const guard = a.proyeccion?.bloqueadoPor ?? (commitGuard?.sig === sig ? commitGuard.guard : null)

  const puedeConfirmar =
    !a.confirmando &&
    motivo.trim().length > 0 &&
    (a.proyeccion?.puedeCorregir ?? false) &&
    !guard &&
    !conflicto

  const confirmar = async () => {
    const r = await a.confirmar({ producto, cantidadNueva, motivo: motivo.trim() })
    if (r.offline) setOfflineMsg(true)
    if (r.guard) setCommitGuard({ sig, guard: r.guard })
    if (r.conflicto) setCommitConflicto(sig)
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" data-testid="correccion-cantidad-form">
      <div className="text-xs font-semibold text-gray-700">Corregir la cantidad</div>

      {items.length > 1 && (
        <label className="mt-2 block text-[11px] text-gray-600">
          Producto
          <select
            value={producto}
            onChange={(e) => cambiarProducto(e.target.value)}
            data-testid="correccion-producto"
            className="ml-2 rounded border border-gray-300 px-1.5 py-0.5"
          >
            {items.map((i) => <option key={i.producto} value={i.producto}>{prod(i.producto)}</option>)}
          </select>
        </label>
      )}

      <label className="mt-2 block text-[11px] text-gray-600">
        Cantidad correcta{itemActual ? ` (capturada: ${itemActual.cantPedido})` : ''}
        <input
          type="number"
          min={0}
          value={Number.isNaN(cantidadNueva) ? '' : cantidadNueva}
          onChange={(e) => setCantidadNueva(Math.max(0, parseInt(e.target.value, 10) || 0))}
          data-testid="correccion-cantidad"
          className="ml-2 w-16 rounded border border-gray-300 px-1.5 py-0.5 text-right"
        />
      </label>

      <label className="mt-2 block text-[11px] text-gray-600">
        Motivo (obligatorio)
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          data-testid="correccion-motivo"
          rows={2}
          placeholder="Ej: se capturaron 12 pero el cliente pidió 10"
          className="mt-0.5 block w-full rounded border border-gray-300 px-1.5 py-1 text-xs"
        />
      </label>

      {a.proyectando && <p className="mt-2 text-[11px] text-gray-400" data-testid="correccion-proyectando">Calculando impacto…</p>}
      {a.proyeccion && !a.proyectando && <div className="mt-2"><AjusteImpacto proyeccion={a.proyeccion} /></div>}

      {/* Guard bloqueante → mensaje + alternativas que el usuario ELIGE (P5) */}
      {guard && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px]" data-testid={`correccion-guard-${guard}`}>
          {guard === 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA' && (
            <>
              <p className="text-amber-900">Esta cantidad ya fue entregada ({itemActual?.cantEntrega ?? 0} unidades) y no puede modificarse mediante este flujo. Lo entregado es cumplimiento histórico.</p>
              <button type="button" onClick={onIrANuevaDemanda} data-testid="correccion-alt-nueva-demanda" className="mt-1 text-blue-600 hover:underline">
                ¿El cliente pidió más? → Nueva demanda
              </button>
            </>
          )}
          {guard === 'CORRECCION_PEDIDO_CERRADO' && (
            <>
              <p className="text-amber-900">Este pedido ya está {pedido.estadoEntrega.toLowerCase()}. Un pedido cerrado no se reabre desde acá; corregirlo requiere una reversión monetaria.</p>
              <a href={`/cartera?clienteId=${pedido.clienteId}`} data-testid="correccion-alt-cartera" className="mt-1 inline-block text-blue-600 hover:underline">Ir a Cartera →</a>
            </>
          )}
          {guard === 'CORRECCION_GENERARIA_SOBREPAGO' && (
            <>
              <p className="text-amber-900">Bajar la cantidad dejaría saldo a favor. Primero hay que registrar esa devolución/crédito en Cartera.</p>
              <a href={`/cartera?clienteId=${pedido.clienteId}`} data-testid="correccion-alt-cartera" className="mt-1 inline-block text-blue-600 hover:underline">Ir a Cartera →</a>
            </>
          )}
        </div>
      )}

      {conflicto && !guard && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px]" data-testid="correccion-conflicto" role="status">
          <p className="text-amber-900">Este pedido cambió mientras corregías. Revisá el estado actual antes de reintentar.</p>
          <button type="button" onClick={onMutado} data-testid="correccion-ver-estado" className="mt-1 text-blue-600 hover:underline">
            Ver estado actual →
          </button>
        </div>
      )}
      {a.error && !guard && !conflicto && <p className="mt-2 text-[11px] text-amber-700" data-testid="correccion-error">{a.error}</p>}
      {offlineMsg && <p className="mt-2 text-[11px] text-blue-700" data-testid="correccion-offline">Sin conexión — la corrección se aplicará al recuperar la red.</p>}

      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={onCancel} className="text-[11px] text-gray-500">Cancelar</button>
        <button
          type="button"
          onClick={confirmar}
          disabled={!puedeConfirmar}
          data-testid="correccion-confirmar"
          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {a.confirmando ? 'Aplicando…' : 'Confirmar corrección'}
        </button>
      </div>
    </div>
  )
}
