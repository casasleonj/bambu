"use client";
// #853 Fase 3: «Dinero de lo entregado hoy». Solo presenta; no calcula ni recalcula nada.
import { formatCurrency } from "@/lib/utils";
import type { EconomiaHoyResultado } from "@/lib/pedidos-economia-operativa-hoy.repository";
import { vistaEconomiaHoy } from "./operacion-hoy-presentacion";

const money = (n: number) => formatCurrency(n);

export function EconomiaHoy({
  economia,
  error,
  onReintentar,
}: {
  economia?: EconomiaHoyResultado;
  error?: boolean;
  onReintentar?: () => void;
}) {
  if (!economia && !error) return null;
  return (
    <div className="mt-3 border-t-2 border-blue-300 pt-3" data-testid="economia-hoy">
      <h3 className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-bold text-slate-800">
        <span>💰 Dinero de lo entregado hoy</span>
        <span className="hidden text-xs font-normal text-stone-600 sm:inline">mismo valor que «Ventas» del Dashboard</span>
      </h3>
      {error && !economia && (
        <div
          role="status"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800"
          data-testid="economia-hoy-error"
        >
          <span>No se pudo calcular el dinero de hoy. No se muestra un cero inventado.</span>
          {onReintentar && (
            <button type="button" onClick={onReintentar} className="min-h-11 rounded-lg border border-red-300 bg-white px-3 font-semibold">
              Reintentar
            </button>
          )}
        </div>
      )}
      {economia && <Cifras economia={economia} />}
    </div>
  );
}

function Cifras({ economia }: { economia: EconomiaHoyResultado }) {
  const v = vistaEconomiaHoy(economia, money);
  const filas: Array<[string, string, string]> = [
    ["Entregado hoy", money(v.entregadoHoy), "entregado"],
    ["Pagado de eso", money(v.pagadoDeEso), "pagado"],
    ["Por cobrar de eso", v.porCobrarDeEso === null ? "Por conciliar" : money(v.porCobrarDeEso), "por-cobrar"],
  ];
  return (
    <>
      {v.sinEntregas ? (
        <p className="mt-2 text-xs text-stone-600" data-testid="economia-hoy-sin-entregas">
          Aún no hay entregas hoy.
        </p>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {filas.map(([etiqueta, valor, clave]) => (
            <div
              key={clave}
              className="flex items-baseline justify-between gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 sm:block"
              data-testid={`economia-${clave}`}
            >
              <span className="text-xs text-stone-600">{etiqueta}</span>
              <b className="block text-lg font-extrabold tabular-nums text-slate-800 sm:mt-0.5 sm:text-xl">{valor}</b>
            </div>
          ))}
        </div>
      )}
      {v.aviso && (
        <p role="status" className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" data-testid="economia-hoy-aviso">
          {v.aviso}
        </p>
      )}
      <div
        className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-xs text-stone-600"
        data-testid="economia-cobros-hoy"
      >
        <span>
          💵 Cobros recibidos hoy <small>(incluye deudas anteriores; no se suma a lo de arriba)</small>
        </span>
        <b className="text-sm tabular-nums text-slate-800">
          {v.cobros.porConciliar ? `Por conciliar · identificado ${money(v.cobros.neto)}` : money(v.cobros.neto)}
        </b>
      </div>
    </>
  );
}
