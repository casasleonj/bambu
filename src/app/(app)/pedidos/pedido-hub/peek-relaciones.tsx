'use client'

import Link from 'next/link'
import { PedidoExceptionPanel } from './pedido-exception-panel'
import { PedidoCambioCantidad } from './pedido-cambio-cantidad'
import type { PeekLayer2 } from './peek-cache'
import type { Pedido } from './types'

const money = (n: number) => new Intl.NumberFormat('es-CO').format(Number(n) || 0)

/**
 * Sub-panel de relaciones del peek (blueprint §6.2). **Acceso y navegación,
 * no fusión** — cada relación es un cross-link a su propio contexto.
 * Distingue explícitamente el **saldo de esta operación** de la **deuda del
 * cliente** (cartera).
 */
export function PeekRelaciones({
  pedido,
  data,
  onOpenVinculado,
  onAccionN2,
  onMutadoN2,
  puedeAjustar,
}: {
  pedido: Pedido
  data: PeekLayer2
  onOpenVinculado: (id: string) => void
  onAccionN2?: (key: 'completar-pendiente' | 'nueva-demanda' | 'venta-libre') => void
  onMutadoN2?: () => void
  /** G11 (Fase 6-i): sólo ADMIN/ASISTENTE pueden abrir "Cambiar cantidades". */
  puedeAjustar?: boolean
}) {
  const saldoOperacion = Number(pedido.saldo) || 0

  return (
    <div className="space-y-2 text-sm" data-testid="peek-relaciones">
      {/* Saldo de ESTA operación — nunca se confunde con la deuda del cliente */}
      {saldoOperacion > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
          <span className="text-red-800">Saldo de esta operación</span>
          <span className="font-semibold text-red-800">${money(saldoOperacion)}</span>
        </div>
      )}

      {data.embarqueResumen && (
        <RelRow label={`Embarque #${data.embarqueResumen.numeroDia} · ${data.embarqueResumen.estado}${data.embarqueResumen.repartidor ? ' · ' + data.embarqueResumen.repartidor : ''}`}>
          <Link href={`/embarques/${data.embarqueResumen.id}`} className="text-blue-600 hover:underline" data-testid="peek-rel-embarque">Ver →</Link>
        </RelRow>
      )}

      {pedido.factura && (
        <RelRow label={`Factura #${pedido.factura.numero} · ${pedido.factura.estado}`}>
          <a href={`/facturas?openFactura=${pedido.factura.id}`} className="text-blue-600 hover:underline" data-testid="peek-rel-factura">Ver →</a>
        </RelRow>
      )}

      {/* Cartera = deuda del CLIENTE (agregada), distinta del saldo de arriba */}
      {saldoOperacion > 0 && pedido.clienteId !== 'CONSUMIDOR_FINAL' && (
        <RelRow label="Cartera del cliente">
          <a href={`/cartera?clienteId=${pedido.clienteId}`} className="text-blue-600 hover:underline" data-testid="peek-rel-cartera">Ver →</a>
        </RelRow>
      )}

      {data.pedidosVinculados.length > 0 && (
        <div className="rounded-lg border border-gray-200 px-3 py-2">
          <div className="mb-1 text-xs text-gray-500">Pedidos vinculados (G11)</div>
          {data.pedidosVinculados.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onOpenVinculado(v.id)}
              className="block w-full text-left text-blue-600 hover:underline"
              data-testid={`peek-rel-vinculado-${v.id}`}
            >
              {v.rol === 'demanda' ? 'Nueva demanda' : 'Origen'}: #{v.numero} · ${money(v.total)} · {v.estadoEntrega}
            </button>
          ))}
        </div>
      )}

      <PedidoExceptionPanel
        pedido={pedido}
        layer2={data}
        onMutado={onMutadoN2}
        onNuevaDemanda={onAccionN2 ? () => onAccionN2('nueva-demanda') : undefined}
        onVentaLibre={onAccionN2 ? () => onAccionN2('venta-libre') : undefined}
      />

      {puedeAjustar && onMutadoN2 && onAccionN2 && (
        <PedidoCambioCantidad
          pedido={pedido}
          onMutado={onMutadoN2}
          onNuevaDemanda={() => onAccionN2('nueva-demanda')}
        />
      )}

      {data.casosAbiertos.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2" data-testid="peek-rel-casos">
          <div className="text-xs font-medium text-red-800">Excepciones abiertas</div>
          {data.casosAbiertos.map((c) => (
            <div key={c.id} className="text-red-900">
              {c.alertaTipo.replace(/_/g, ' ')} · {c.status}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
      <span className="text-gray-700">{label}</span>
      {children}
    </div>
  )
}
