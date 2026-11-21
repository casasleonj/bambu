"use client";

import { OperacionList } from "./operacion-list";
import type { AccionesConsulta } from "./operacion-consulta";
import type { AccionKey, Pedido } from "./types";

interface Props {
  pedidos: Pedido[];
  total: number;
  error: boolean;
  cargando: boolean;
  viewport: "desktop" | "mobile";
  hoyBogota: string;
  consulta: AccionesConsulta;
  onAccion: (pedido: Pedido, key: AccionKey) => void;
  onOpen: (pedido: Pedido) => void;
  onVerTodos: () => void;
  onReintentar?: () => void;
  modoRecorridoExterno?: boolean;
}

/**
 * #797: pedidos de días anteriores que siguen sin entregarse, visibles en «Hoy».
 * Es una lectura aparte: no cambia `Pedido.fecha`, no suma a «Pedidos de hoy» ni
 * altera el resumen. Reutiliza las filas y acciones de la lista del Hub.
 */
export function PendientesAnteriores({
  pedidos, total, error, cargando, viewport, hoyBogota, consulta,
  onAccion, onOpen, onVerTodos, onReintentar, modoRecorridoExterno,
}: Props) {
  if (!cargando && !error && total === 0) return null;
  const marco =
    "rounded-xl border border-amber-300 bg-amber-50 p-3 lg:p-4";
  if (error)
    return (
      <section className={marco} data-testid="pendientes-anteriores" aria-label="Pendientes de días anteriores">
        <h2 className="text-base font-bold text-slate-800">⏳ Pendientes de días anteriores</h2>
        <div role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          No pudimos leer los pendientes de días anteriores. La lista de hoy sigue funcionando.
          {onReintentar && (
            <button type="button" onClick={onReintentar} className="ml-2 min-h-11 rounded border border-red-300 bg-white px-3 font-semibold">
              Reintentar
            </button>
          )}
        </div>
      </section>
    );
  if (cargando && pedidos.length === 0)
    return (
      <section className={marco} data-testid="pendientes-anteriores-carga" aria-label="Pendientes de días anteriores" aria-busy="true">
        <h2 className="text-base font-bold text-slate-800">⏳ Pendientes de días anteriores…</h2>
        <div className="mt-2 animate-pulse space-y-2">
          <div className="h-14 rounded-lg bg-amber-100" />
          <div className="h-14 rounded-lg bg-amber-100" />
        </div>
      </section>
    );
  return (
    <section className={marco} data-testid="pendientes-anteriores" aria-label="Pendientes de días anteriores">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800">⏳ Pendientes de días anteriores ({total})</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Siguen sin entregar. No cuentan como pedidos creados hoy.
          </p>
        </div>
        {total > pedidos.length && (
          <button type="button" onClick={onVerTodos} className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-slate-800" data-testid="pendientes-anteriores-ver-todos">
            Ver los {total} en la consulta
          </button>
        )}
      </div>
      <OperacionList
        pedidos={pedidos}
        viewport={viewport}
        hoyBogota={hoyBogota}
        onAccion={onAccion}
        onOpen={onOpen}
        consulta={consulta}
        arrastre
        modoRecorridoExterno={modoRecorridoExterno}
      />
      {total > pedidos.length && (
        <p className="mt-2 text-xs text-slate-600">
          Mostrando los {pedidos.length} más antiguos de {total}.
        </p>
      )}
    </section>
  );
}
