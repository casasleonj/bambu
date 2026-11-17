"use client";

import { useId, useState } from "react";
import { getProductoIconConfig } from "@/lib/producto-iconos";
import type {
  CantidadEntrega,
  EntregaDestacada,
  EstadoEntregaAlCorte,
} from "@/lib/pedidos-entregas-historial";

const etiquetas: Record<EstadoEntregaAlCorte, string> = {
  PARCIAL: "Parcial en la fecha",
  COMPLETADO_TRAS_PARCIAL: "Completado tras parcial",
  PRIMERA_ENTREGA: "Primera entrega del pedido",
  COMPLETADO: "Entregado en la fecha",
  POR_CONCILIAR: "Por conciliar",
};
const tonos: Record<EstadoEntregaAlCorte, string> = {
  PARCIAL: "bg-amber-100 text-amber-900",
  COMPLETADO_TRAS_PARCIAL: "bg-emerald-50 text-emerald-800",
  PRIMERA_ENTREGA: "bg-blue-50 text-blue-800",
  COMPLETADO: "bg-emerald-50 text-emerald-800",
  POR_CONCILIAR: "bg-stone-100 text-stone-700",
};
const fecha = (dia: string) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric",
  }).format(new Date(dia + "T12:00:00-05:00"));
const nombres: Record<string, [string, string]> = {
  PACA_AGUA: ["paca de agua", "pacas de agua"],
  PACA_HIELO: ["paca de hielo", "pacas de hielo"],
  BOTELLON: ["botellón", "botellones"],
  BOLSA_AGUA: ["bolsa de agua", "bolsas de agua"],
  BOLSA_HIELO: ["bolsa de hielo", "bolsas de hielo"],
};
function cantidades(xs: CantidadEntrega[]) {
  if (!xs.length) return "Cantidad por verificar";
  return xs.map((x) => {
    const nombre = nombres[x.producto]?.[x.cantidad === 1 ? 0 : 1]
      ?? getProductoIconConfig(x.producto).label.toLowerCase();
    return String(x.cantidad) + " " + nombre;
  }).join(" · ");
}
function Hito({
  hito,
}: {
  hito: EntregaDestacada["hitos"][number];
}) {
  return (
    <li className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-xs text-stone-700">
      <time className="font-semibold" dateTime={hito.fecha}>{fecha(hito.fecha)}</time>
      <span aria-hidden="true">·</span>
      <span>{cantidades(hito.cantidades)}</span>
      {hito.completado && <span className="font-semibold text-emerald-800">✓ Completado</span>}
      {hito.porConciliar && <span className="font-semibold text-amber-800">Por conciliar</span>}
    </li>
  );
}

/** #763: eventos físicos visibles, no otro listado de ventas o pedidos. */
export function EntregasDestacadas({
  entregas,
  total,
  rangoAmplio,
  hasta,
  onVerPedido,
  onVerTodas,
  plegable = false,
  periodo = "en el período",
}: {
  entregas: EntregaDestacada[];
  total: number;
  rangoAmplio: boolean;
  hasta: string;
  onVerPedido: (id: string) => void;
  onVerTodas: () => void;
  /** #841: empieza plegada en una línea para no competir con los pendientes. */
  plegable?: boolean;
  /** «hoy» cuando el rango es exactamente hoy; si no, «en el período». */
  periodo?: "hoy" | "en el período";
}) {
  const [abierta, setAbierta] = useState(false);
  const idDetalle = useId();
  if (!total && !rangoAmplio) return null;
  // El aviso de rango amplio es información importante: nunca se pliega.
  const plegada = plegable && !rangoAmplio && !abierta;
  return (
    <section
      aria-label="Entregas parciales y de pedidos anteriores"
      data-testid="entregas-historicas-763"
      className={
        plegada
          ? ""
          : "space-y-3 rounded-xl border border-stone-200 bg-white p-3 lg:p-4"
      }
    >
      {plegable && !rangoAmplio && (
        plegada ? (
          <button
            type="button"
            aria-expanded={false}
            data-testid="entregas-historicas-toggle"
            onClick={() => setAbierta(true)}
            className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left"
          >
            <span>
              <span className="block text-sm font-bold text-slate-800">
                🚚 {total} {total === 1 ? "pedido anterior con entregas" : "pedidos anteriores con entregas"} {periodo}
              </span>
              <span className="block text-xs text-stone-600">
                Entregas parciales y de pedidos anteriores
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-blue-700">Ver detalle ▾</span>
          </button>
        ) : null
      )}
      {!plegada && (<div id={idDetalle} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800">🚚 Entregas parciales y de pedidos anteriores</h2>
          <p className="mt-1 text-xs text-stone-600">
            Movimientos físicos del período · no son pedidos ni ventas adicionales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
              {total} pedido(s)
            </span>
          )}
          {plegable && !rangoAmplio && (
            <button
              type="button"
              aria-expanded={true}
              aria-controls={idDetalle}
              data-testid="entregas-historicas-toggle"
              onClick={() => setAbierta(false)}
              className="min-h-11 px-2 text-sm font-semibold text-blue-700"
            >
              Ocultar ▴
            </button>
          )}
        </div>
      </div>
      {rangoAmplio ? (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Para consultar entregas parciales de períodos mayores a 32 días, selecciona un intervalo más corto. La lista habitual de pedidos conserva su filtro.
        </p>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {entregas.map((e) => {
            const posteriores = !!e.fechaCompletado && !!hasta && e.fechaCompletado > hasta;
            return (
              <article
                key={e.pedidoId}
                className="min-w-0 space-y-2 rounded-xl border border-stone-200 bg-[#f8f5ef] p-3"
                data-testid={"entrega-historica-" + e.numero}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="min-h-9 text-left text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
                    onClick={() => onVerPedido(e.pedidoId)}
                    aria-label={"Ver pedido " + e.numero}
                  >
                    Pedido #{e.numero}
                  </button>
                  <span className={"rounded-full px-2 py-1 text-xs font-semibold " + tonos[e.estadoAlCorte]}>
                    {etiquetas[e.estadoAlCorte]}
                  </span>
                </div>
                <p className="truncate text-sm font-medium text-stone-800" title={e.nombre}>{e.nombre}</p>
                <p className="text-sm font-bold text-stone-900">
                  {cantidades(e.cantidadesDelRango)} <span className="font-normal text-stone-600">entregadas en el período</span>
                </p>
                <p className="text-xs text-stone-600">
                  Pedido del {fecha(e.fechaPedido)} · acumulado al corte: {cantidades(e.cantidadesAlCorte)}
                </p>
                <div className="border-t border-stone-200 pt-2">
                  <p className="mb-1 text-xs font-semibold text-stone-700">Fechas de entrega</p>
                  <ol className="space-y-1">
                    {e.hitos.slice(0, 2).map((h) => <Hito key={h.fecha} hito={h} />)}
                  </ol>
                  {e.hitos.length > 2 && (
                    <details className="mt-1 text-xs text-blue-800">
                      <summary className="min-h-8 cursor-pointer py-1 font-semibold">
                        Ver las {e.hitos.length} fechas de entrega
                      </summary>
                      <ol className="space-y-1 pl-2">
                        {e.hitos.slice(2).map((h) => <Hito key={h.fecha} hito={h} />)}
                      </ol>
                    </details>
                  )}
                </div>
                {e.fechaCompletado ? (
                  <p className="text-xs font-semibold text-emerald-800">
                    {posteriores ? "Completado posteriormente: " : "Completado el "}
                    {fecha(e.fechaCompletado)}
                  </p>
                ) : (
                  <p className="text-xs font-medium text-stone-600">
                    {e.estadoAlCorte === "POR_CONCILIAR"
                      ? "Fecha de finalización por verificar."
                      : "Sin finalización física verificada."}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {total > entregas.length && (
        <p className="text-xs text-stone-600">
          Mostrando {entregas.length} de {total} pedidos con entregas destacadas.
        </p>
      )}
      <button
        type="button"
        className="min-h-11 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-800 hover:bg-blue-100"
        onClick={onVerTodas}
      >
        Consultar entregas por fecha
      </button>
      </div>)}
    </section>
  );
}