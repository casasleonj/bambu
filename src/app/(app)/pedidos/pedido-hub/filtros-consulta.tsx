"use client";
import { useState } from "react";
import { getPresetDate, getTodayString } from "@/lib/dates";
import {
  leerFiltrosConsulta,
  parametrosConsulta,
  type FiltrosConsultaPedidos,
} from "@/lib/pedidos-consulta";

type Props = {
  filtros: FiltrosConsultaPedidos;
  repartidores: Array<{ id: string; nombre: string; activo: boolean }>;
  sinConexion: boolean;
  onAplicar: (f: FiltrosConsultaPedidos) => void;
  onLimpiar: () => void;
};
const control =
  "min-h-11 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-800";
export function FiltrosConsulta({
  filtros,
  repartidores,
  sinConexion,
  onAplicar,
  onLimpiar,
}: Props) {
  const key = parametrosConsulta(filtros).toString();
  const [anterior, setAnterior] = useState(key),
    [draft, setDraft] = useState(filtros);
  const [mas, setMas] = useState(false),
    [personas, setPersonas] = useState(false),
    [error, setError] = useState<string | null>(null);
  if (anterior !== key) {
    setAnterior(key);
    setDraft(filtros);
    setError(null);
  }
  const cambiar = <K extends keyof FiltrosConsultaPedidos>(
    k: K,
    v: FiltrosConsultaPedidos[K],
  ) => setDraft((d) => ({ ...d, [k]: v }));
  function periodo(preset: "hoy" | "ayer" | "turno" | "todos" | "rango") {
    if (preset === "rango") {
      setMas(true);
      return;
    }
    const d = getPresetDate(preset);
    setDraft((f) => ({
      ...f,
      desde: d?.desde ?? "",
      hasta: d?.hasta ?? "",
      all: preset === "todos",
      desdeHora: "",
      hastaHora: "",
    }));
  }
  const aplicar = () => {
    try {
      const f = { ...draft, resumen: true, page: 1 };
      const p = parametrosConsulta(f);
      // Validar también mientras se edita; el servidor repite esta validación.
      const validado = leerFiltrosConsulta(p);
      setError(null);
      onAplicar(validado);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisa los filtros.");
    }
  };
  const pendientes =
    JSON.stringify({ ...draft, page: 1 }) !==
    JSON.stringify({ ...filtros, page: 1 });
  const focoEntrega = draft.foco || draft.estadoEntrega[0] || "";
  const hoy = getTodayString(),
    ayer = getPresetDate("ayer")!.desde;
  return (
    <section
      className="rounded-xl border border-stone-200 bg-white p-4 lg:p-4"
      aria-label="Filtros de Pedidos"
      data-testid="consulta-filtros"
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["hoy", "Hoy"],
            ["ayer", "Ayer"],
            ["turno", "Ayer y hoy"],
            ["todos", "Todos"],
            ["rango", "Elegir rango"],
          ] as const
        ).map(([k, label]) => {
          const activo =
            k === "todos"
              ? draft.all
              : k === "hoy"
                ? !draft.all && draft.desde === hoy && draft.hasta === hoy
                : k === "ayer"
                  ? !draft.all && draft.desde === ayer && draft.hasta === ayer
                  : k === "turno"
                    ? !draft.all && draft.desde === ayer && draft.hasta === hoy
                    : false;
          return (
            <button
              type="button"
              key={k}
              aria-pressed={activo}
              onClick={() => periodo(k)}
              className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${activo ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.65fr]">
        <label className="min-w-0 text-xs font-semibold text-slate-600">
          Canal de venta
          <select
            className={`${control} mt-1`}
            aria-label="Canal de venta"
            value={draft.canal.length === 1 ? draft.canal[0] : "AMBOS"}
            onChange={(e) =>
              cambiar(
                "canal",
                e.target.value === "AMBOS" ? [] : [e.target.value],
              )
            }
          >
            <option value="AMBOS">Punto y domicilio</option>
            <option value="PUNTO">🏪 Solo punto</option>
            <option value="DOMICILIO">🚚 Solo domicilio</option>
          </select>
        </label>
        <div className="min-w-0">
          <span
            className="text-xs font-semibold text-slate-600"
            id="repartidores-label"
          >
            Repartidor de la entrega
          </span>
          <button
            type="button"
            aria-labelledby="repartidores-label"
            aria-expanded={personas}
            onClick={() => setPersonas((v) => !v)}
            className={`${control} mt-1 text-left`}
            data-testid="consulta-repartidores"
          >
            🚚{" "}
            {draft.repartidorId.length
              ? repartidores
                  .filter((r) => draft.repartidorId.includes(r.id))
                  .map((r) => r.nombre)
                  .join(" o ") || `${draft.repartidorId.length} seleccionados`
              : "Todos"}{" "}
            ▾
          </button>
        </div>
        <div className="flex min-w-0 items-end gap-2 md:col-span-2 xl:col-span-1">
          <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
            Buscar pedido, cliente, negocio o creador
            <input
              type="search"
              className={`${control} mt-1`}
              placeholder="Nombre, teléfono o #pedido"
              value={draft.search}
              maxLength={120}
              onChange={(e) => cambiar("search", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  aplicar();
                }
              }}
            />
          </label>
          <button
            type="button"
            aria-expanded={mas}
            onClick={() => setMas((v) => !v)}
            className="min-h-11 shrink-0 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
          >
            Más filtros
          </button>
        </div>
      </div>
      {personas && (
        <fieldset className="mt-3 flex flex-wrap gap-3 rounded-lg border border-stone-300 p-3">
          <legend className="px-1 text-xs font-semibold">
            Elige uno o varios repartidores
          </legend>
          {repartidores.length ? (
            repartidores.map((r) => (
              <label
                key={r.id}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={draft.repartidorId.includes(r.id)}
                  onChange={(e) =>
                    cambiar(
                      "repartidorId",
                      e.target.checked
                        ? [...draft.repartidorId, r.id]
                        : draft.repartidorId.filter((id) => id !== r.id),
                    )
                  }
                />
                {r.nombre}
                {!r.activo ? " (inactivo)" : ""}
              </label>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              No hay repartidores disponibles en esta lectura.
            </p>
          )}
          <p className="w-full text-xs text-slate-600">
            Filtra por quién entregó, no por quién recibió el dinero ni por la
            asignación actual. Cada pedido se cuenta una sola vez.
          </p>
        </fieldset>
      )}
      {mas && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600">
              Usar la fecha y hora de
              <select
                className={`${control} mt-1`}
                aria-label="Usar la fecha y hora de"
                value={draft.fechaBase}
                onChange={(e) =>
                  cambiar(
                    "fechaBase",
                    e.target.value as FiltrosConsultaPedidos["fechaBase"],
                  )
                }
              >
                <option value="pedido">🧾 Fecha del pedido</option>
                <option value="creacion">✍️ Creación registrada</option>
                <option value="entrega">🚚 Entrega registrada</option>
                <option value="cobro">💵 Cobro registrado</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Entrega
              <select
                className={`${control} mt-1`}
                aria-label="Entrega"
                value={focoEntrega}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    foco: [
                      "porPlanificar",
                      "enRuta",
                      "esperandoPago",
                      "pendientesN2",
                      "excepciones",
                      "entregaParcial",
                    ].includes(v)
                      ? (v as FiltrosConsultaPedidos["foco"])
                      : "",
                    estadoEntrega: [
                      "porPlanificar",
                      "enRuta",
                      "esperandoPago",
                      "pendientesN2",
                      "excepciones",
                      "entregaParcial",
                      "",
                    ].includes(v)
                      ? []
                      : [v],
                    registro: ["ANULADO", "CANCELADO"].includes(v)
                      ? "todos"
                      : d.registro,
                  }));
                }}
              >
                <option value="">Cualquier entrega</option>
                <option value="PENDIENTE">Por entregar</option>
                <option value="entregaParcial">Entrega parcial</option>
                <option value="EN_RUTA">En ruta</option>
                <option value="NO_ENTREGADO">No entregado</option>
                <option value="ENTREGADO">Entregado</option>
                <option value="CANCELADO">Cancelado</option>
                <option value="ANULADO">Anulado</option>
                <optgroup label="Gestión del pedido">
                  <option value="porPlanificar">
                    Por planificar · sin embarque
                  </option>
                  <option value="enRuta">Gestión · en ruta</option>
                  <option value="esperandoPago">
                    Esperando pago · entregado
                  </option>
                  <option value="pendientesN2">Con pendiente N2</option>
                  <option value="excepciones">
                    Con excepción o incidencia
                  </option>
                </optgroup>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Pago
              <select
                className={`${control} mt-1`}
                aria-label="Pago"
                value={draft.pago}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    pago: e.target.value as FiltrosConsultaPedidos["pago"],
                    estadoPago: [],
                  }))
                }
              >
                <option value="todos">Cualquier pago</option>
                <option value="sin_pago">Sin pago registrado</option>
                <option value="parcial">Pago parcial</option>
                <option value="registrado">Pagado registrado</option>
                <option value="fiado">Fiado · entregado con saldo</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Origen
              <select
                aria-label="Origen"
                className={`${control} mt-1`}
                value={
                  draft.conRecurrencia
                    ? "RECURRENTE"
                    : draft.origen.length === 1
                      ? draft.origen[0]
                      : ""
                }
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    origen: e.target.value ? [e.target.value] : [],
                    conRecurrencia: false,
                  }))
                }
              >
                <option value="">Todos los orígenes</option>
                <option value="PEDIDO">Pedido</option>
                <option value="VENTA_RAPIDA">Venta rápida</option>
                <option value="VENTA_LIBRE">Venta libre</option>
                <option value="RECURRENTE">Pedido habitual</option>
              </select>
            </label>
            {(["desde", "hasta"] as const).map((k) => (
              <label key={k} className="text-xs font-semibold text-slate-600">
                {k === "desde" ? "Desde · fecha" : "Hasta · fecha"}
                <input
                  type="date"
                  className={`${control} mt-1`}
                  value={draft[k]}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [k]: e.target.value, all: false }))
                  }
                />
              </label>
            ))}
            {(["desdeHora", "hastaHora"] as const).map((k) => (
              <label key={k} className="text-xs font-semibold text-slate-600">
                {k === "desdeHora" ? "Desde la hora" : "Hasta la hora"}
                <input
                  type="time"
                  className={`${control} mt-1`}
                  value={draft[k]}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [k]: e.target.value,
                      all: false,
                      desde: d.desde || hoy,
                      hasta: d.hasta || hoy,
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Hora de Colombia. Si eliges solo horas, se usa la fecha indicada
            arriba. La hora final incluye todo ese minuto; entre fechas
            distintas es un intervalo continuo.
          </p>
          <fieldset className="mt-3 flex flex-wrap gap-2 rounded-lg border border-stone-200 px-3 pb-2">
            <legend className="text-xs font-semibold text-stone-600">
              Estado del registro
            </legend>
            {(
              [
                ["activos", "Activos"],
                ["todos", "Todos"],
                ["anulados", "Anulados"],
              ] as const
            ).map(([k, label]) => (
              <button
                type="button"
                key={k}
                aria-pressed={draft.registro === k}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    registro: k,
                    estadoEntrega: k === "anulados" ? [] : d.estadoEntrega.filter(
                      (s) => !["ANULADO", "CANCELADO"].includes(s),
                    ),
                    foco: k === "anulados" ? "" : d.foco,
                  }))
                }
                className={`min-h-9 rounded-lg border px-3 text-sm ${draft.registro === k ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200"}`}
              >
                {label}
              </button>
            ))}
          </fieldset>
          <p className="mt-1 text-xs text-slate-500">
            Activos excluye cancelados y anulados; Todos los incluye. Los
            anulados no suman como ventas.
          </p>
        </>
      )}
      {(draft.clienteId ||
        draft.estadoPago.length > 0 ||
        draft.estadoEntrega.length > 1 ||
        draft.origen.length > 1) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-blue-800">
          {draft.clienteId && (
            <button
              type="button"
              className="min-h-9 rounded-full border border-blue-200 bg-blue-50 px-3"
              onClick={() => cambiar("clienteId", "")}
            >
              Cliente seleccionado · Quitar ×
            </button>
          )}
          {draft.estadoPago.length > 0 && (
            <button
              type="button"
              className="min-h-9 rounded-full border border-blue-200 bg-blue-50 px-3"
              onClick={() => cambiar("estadoPago", [])}
            >
              Estado de pago:{" "}
              {draft.estadoPago
                .map(
                  (s) =>
                    ({
                      PENDIENTE: "Pendiente",
                      PARCIAL: "Parcial",
                      PAGADO: "Pagado",
                      ANTICIPADO: "Anticipado",
                      VENCIDO: "Vencido",
                      ANULADO: "Anulado",
                    })[s as "PENDIENTE"],
                )
                .join(", ")}{" "}
              · Quitar ×
            </button>
          )}
          {draft.estadoEntrega.length > 1 && (
            <button
              type="button"
              className="min-h-9 rounded-full border border-blue-200 bg-blue-50 px-3"
              onClick={() => cambiar("estadoEntrega", [])}
            >
              Varios estados de entrega · Quitar ×
            </button>
          )}
          {draft.origen.length > 1 && (
            <button
              type="button"
              className="min-h-9 rounded-full border border-blue-200 bg-blue-50 px-3"
              onClick={() => cambiar("origen", [])}
            >
              Varios orígenes · Quitar ×
            </button>
          )}
        </div>
      )}
      {pendientes && (
        <p className="mt-3 text-xs text-amber-800">
          Cambios sin aplicar. Pulsa «Aplicar filtros» para actualizar la lista
          y su resumen.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
          onClick={() => {
            setMas(false);
            setPersonas(false);
            onLimpiar();
          }}
        >
          Limpiar filtros
        </button>
        <button
          type="button"
          disabled={sinConexion}
          className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          onClick={aplicar}
        >
          Aplicar filtros
        </button>
      </div>
    </section>
  );
}
