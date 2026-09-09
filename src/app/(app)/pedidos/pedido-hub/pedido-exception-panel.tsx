'use client'

import { useState } from 'react'
import { clasificarN2 } from './n2-naturaleza'
import { CompletarPendienteForm } from './completar-pendiente-form'
import { ActividadAcciones } from './actividad-acciones'
import type { PeekLayer2 } from './peek-cache'
import type { Pedido } from '../pedidos-client/types'

const prod = (p: string) => p.replace(/_/g, ' ').toLowerCase()

// Solo estos anulan la operación (ponen total=0) — no admiten gestión de
// pendientes. Un pedido ENTREGADO con remanente ES un caso N2 legítimo
// (entrega parcial). El backend no guarda por estado; esto es criterio de UX.
const ESTADOS_CERRADOS = ['CANCELADO', 'ANULADO']

/** remanente por producto a partir de los items del pedido. */
export function remanentePorProducto(pedido: Pedido): Array<{ producto: string; cantPedido: number; cantEntrega: number; remanente: number }> {
  return (pedido.items ?? [])
    .map((i) => ({ producto: i.producto, cantPedido: i.cantPedido, cantEntrega: i.cantEntrega, remanente: i.cantPedido - i.cantEntrega }))
    .filter((i) => i.remanente > 0)
}

export interface PedidoExceptionPanelProps {
  pedido: Pedido
  layer2: PeekLayer2
  /** conflicto 409 en curso (lo setea el flujo de F5-ii/iii). */
  conflictoEnCurso?: boolean
  /** tras una mutación N2: recargar el peek + refetch. Si falta, el CTA
   *  "Completar el pendiente" no se muestra (modo display puro / degradado). */
  onMutado?: () => void
  /** navega al workspace con pedidoOrigenId (G11.B) — declaración explícita, no inferencia. */
  onNuevaDemanda?: () => void
  /** navega al flujo de Venta Libre (contexto de Embarque). */
  onVentaLibre?: () => void
}

/**
 * PedidoExceptionPanel (plan Fase 5) — N2 (pendientes) **en el peek**.
 *
 * Aparece SOLO si hay un `ObligacionPendiente` activo o si el pedido tiene
 * remanente sin gestionar. Un pendiente parcial puede ser NORMAL (P1) — el
 * color/⚠ solo para excepción/conflicto/inconsistencia/riesgo.
 *
 * F5-i es **display**: clasifica la naturaleza, muestra el remanente y las
 * actividades, y ofrece las tres opciones de la frontera N2 ↔ nueva demanda
 * ↔ Venta Libre (P4) — nunca infiere cuál. Los flujos de mutación (completar,
 * cambiar modo, liberar) los cablean F5-ii/F5-iii.
 */
export function PedidoExceptionPanel({
  pedido,
  layer2,
  conflictoEnCurso,
  onMutado,
  onNuevaDemanda,
  onVentaLibre,
}: PedidoExceptionPanelProps) {
  const [gestionando, setGestionando] = useState<{ producto: string; remanente: number } | null>(null)
  const [actividadEnAccion, setActividadEnAccion] = useState<{ id: string; modo: 'PUNTO' | 'DOMICILIO' | null; accion: 'cambiar-modo' | 'liberar' } | null>(null)
  // F9-iii: un 409 de concurrencia en cualquiera de los sub-flujos N2 marca el
  // panel como 'conflicto' (clasificarN2). Distinto de un 409 de regla de
  // negocio, que conserva su mensaje contextual (P5). El prop
  // `conflictoEnCurso` (externo) también lo activa.
  const [conflictoLocal, setConflictoLocal] = useState(false)
  const enConflicto = Boolean(conflictoEnCurso) || conflictoLocal
  const pendiente = layer2.pendienteN2
  const remanentes = remanentePorProducto(pedido)
  const pedidoCerrado = ESTADOS_CERRADOS.includes(pedido.estadoEntrega)
  const canalPedido = pedido.canal === 'PUNTO' ? 'PUNTO' : 'DOMICILIO'

  // Nada que mostrar.
  if (!pendiente && remanentes.length === 0) return null

  // ── Con obligación activa: panel de gestión ──
  if (pendiente) {
    const c = clasificarN2({
      pendienteN2: pendiente,
      estadoEntregaPedido: pedido.estadoEntrega,
      casosAbiertos: layer2.casosAbiertos,
      conflictoEnCurso: enConflicto,
    })
    const tonoClase =
      c.tono === 'rojo' ? 'border-red-200 bg-red-50' :
      c.tono === 'ambar' ? 'border-amber-200 bg-amber-50' :
      'border-gray-200 bg-gray-50'
    const tituloClase =
      c.tono === 'rojo' ? 'text-red-800' :
      c.tono === 'ambar' ? 'text-amber-800' :
      'text-gray-700'

    return (
      <div className={`rounded-lg border px-3 py-2 text-sm ${tonoClase}`} data-testid="pedido-exception-panel">
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${tituloClase}`} data-testid={`n2-naturaleza-${c.naturaleza}`}>
          {c.tono !== 'neutro' && <span aria-hidden>⚠</span>}
          {c.titulo}
        </div>
        {c.detalle && <div className="mt-0.5 text-[11px] text-gray-600">{c.detalle}</div>}

        <div className="mt-1.5 text-gray-800">
          Pendiente: <span className="font-medium">{pendiente.remanente} {prod(pendiente.producto)}</span> · {pendiente.estado.toLowerCase()}
        </div>

        {pendiente.actividades.length > 0 && (
          <div className="mt-1.5 space-y-1" data-testid="n2-actividades">
            {pendiente.actividades.map((a) => {
              const modo = a.modo === 'PUNTO' ? 'PUNTO' : a.modo === 'DOMICILIO' ? 'DOMICILIO' : null
              const enAccion = actividadEnAccion?.id === a.id
              return (
                <div key={a.id} data-testid={`n2-actividad-${a.id}`}>
                  <div className="flex items-center justify-between rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
                    <span className="text-gray-700">
                      {a.cantidad} {prod(pendiente.producto)} · {a.tipo.toLowerCase()} · {modo ? modo.toLowerCase() : 'sin modo'} · {a.estado.toLowerCase()}
                    </span>
                    {onMutado && !enAccion && (a.estado === 'ASIGNADA' || a.estado === 'EN_PROGRESO') && (
                      <span className="flex gap-1">
                        <button type="button" onClick={() => setActividadEnAccion({ id: a.id, modo, accion: 'cambiar-modo' })} data-testid={`n2-actividad-${a.id}-cambiar-modo`} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700 hover:bg-gray-200">Cambiar modo</button>
                        <button type="button" onClick={() => setActividadEnAccion({ id: a.id, modo, accion: 'liberar' })} data-testid={`n2-actividad-${a.id}-liberar`} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700 hover:bg-gray-200">Liberar</button>
                      </span>
                    )}
                  </div>
                  {enAccion && onMutado && (
                    <ActividadAcciones
                      pedidoId={pedido.id}
                      actividadId={a.id}
                      modoActual={actividadEnAccion.modo}
                      accion={actividadEnAccion.accion}
                      onCancel={() => setActividadEnAccion(null)}
                      onMutado={() => { setActividadEnAccion(null); setConflictoLocal(false); onMutado() }}
                      onConflicto={() => setConflictoLocal(true)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Sin obligación: hay remanente sin gestionar ──
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm" data-testid="pedido-exception-panel">
      <div className="text-xs font-semibold text-gray-700" data-testid="n2-naturaleza-normal">
        {pedidoCerrado ? 'Remanente sin gestionar (pedido cerrado)' : 'Este pedido tiene un remanente sin gestionar'}
      </div>
      <div className="mt-1 space-y-0.5 text-gray-800">
        {remanentes.map((r) => (
          <div key={r.producto} data-testid={`n2-remanente-${r.producto}`}>
            {r.remanente} {prod(r.producto)} · entregado {r.cantEntrega} de {r.cantPedido}
          </div>
        ))}
      </div>

      {!pedidoCerrado && gestionando && onMutado && (
        <CompletarPendienteForm
          pedidoId={pedido.id}
          pedidoCanal={canalPedido}
          producto={gestionando.producto}
          remanente={gestionando.remanente}
          onCancel={() => setGestionando(null)}
          onMutado={() => { setGestionando(null); setConflictoLocal(false); onMutado() }}
          onConflicto={() => setConflictoLocal(true)}
        />
      )}

      {!pedidoCerrado && !gestionando && (
        <div className="mt-2 space-y-1.5" data-testid="n2-frontera">
          <p className="text-[11px] text-gray-500">¿Qué corresponde hacer? (elegí — el sistema no lo asume)</p>
          {onMutado && (
            <button
              type="button"
              onClick={() => setGestionando({ producto: remanentes[0].producto, remanente: remanentes[0].remanente })}
              data-testid="n2-cta-completar"
              className="block w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Completar el pendiente
            </button>
          )}
          <div className="flex gap-2 text-[11px]">
            {onNuevaDemanda && (
              <button type="button" onClick={onNuevaDemanda} data-testid="n2-cta-nueva-demanda" className="text-blue-600 hover:underline">
                Nueva demanda →
              </button>
            )}
            {onVentaLibre && (
              <button type="button" onClick={onVentaLibre} data-testid="n2-cta-venta-libre" className="text-blue-600 hover:underline">
                Venta durante la ruta → (se registra en Embarques)
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400">
            Completar = cumplir esta obligación · Nueva demanda = pedido nuevo · Venta durante la ruta = venta emergente sin pedido previo; <b>se registra desde Embarques</b> (repartidor en ruta o Admin/Asistente en la conciliación de ese embarque), no desde acá.
          </p>
        </div>
      )}
      {pedidoCerrado && (
        <p className="mt-1 text-[11px] text-amber-700">El pedido ya está {pedido.estadoEntrega.toLowerCase()} — no admite gestión de pendientes.</p>
      )}
    </div>
  )
}
