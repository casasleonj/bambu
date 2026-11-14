"use client";
import { useEffect, useId, useRef, useState } from "react";
import { getPresetDate, getTodayString } from "@/lib/dates";
import {
  leerFiltrosConsulta,
  parametrosConsulta,
  type FiltrosConsultaPedidos,
} from "@/lib/pedidos-consulta";
import {
  alternarCanal,
  alternarEstadoEntrega,
  alternarFoco,
  alternarOrigen,
  alternarPago,
  alternarRepartidor,
  canalesVisibles,
  elegirRegistro,
  ESTADOS_ENTREGA,
  filtrosActivos,
  FOCOS,
  ORIGENES,
  origenesVisibles,
  PAGOS,
  repartidoresVisibles,
  type FiltroMoto,
  type FocoConsulta,
  type RepartidorOpcion,
} from "./filtros-chips";

type Props = {
  filtros: FiltrosConsultaPedidos;
  repartidores: RepartidorOpcion[];
  sinConexion: boolean;
  onAplicar: (f: FiltrosConsultaPedidos) => void;
  onLimpiar: () => void;
};
type Preset = "hoy" | "ayer" | "turno" | "todos" | "rango";
const ESPERA_MS = 400;
const control =
  "min-h-11 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-800";

function Chip({
  activo,
  onClick,
  children,
  atenuado,
  titulo,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  atenuado?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      title={titulo}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${activo ? "border-blue-300 bg-blue-50 text-blue-700" : atenuado ? "border-dashed border-slate-300 text-slate-500" : "border-slate-200 text-slate-700"}`}
    >
      {children}
    </button>
  );
}
function Grupo({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="min-w-0">
      <p id={id} className="mb-1 text-xs font-semibold text-slate-600">
        {titulo}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
      {ayuda && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>}
    </div>
  );
}

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
  const [abierto, setAbierto] = useState(false),
    [personas, setPersonas] = useState(false),
    [moto, setMoto] = useState<FiltroMoto>("todos"),
    [inactivos, setInactivos] = useState(false),
    [textoRep, setTextoRep] = useState(""),
    [error, setError] = useState<string | null>(null);
  const panelId = useId();
  const draftRef = useRef(draft),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pendienteSinRed = useRef(false),
    aplicadoRef = useRef(filtros),
    sinConexionRef = useRef(sinConexion),
    onAplicarRef = useRef(onAplicar);
  useEffect(() => {
    aplicadoRef.current = filtros;
    sinConexionRef.current = sinConexion;
    onAplicarRef.current = onAplicar;
  });
  if (anterior !== key) {
    // El enlace o «atrás» cambió la consulta: el borrador sigue a la URL.
    setAnterior(key);
    setDraft(filtros);
    setError(null);
  }
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const aplicarBorrador = (d: FiltrosConsultaPedidos) => {
    try {
      // Validar aquí; el servidor repite esta validación.
      const validado = leerFiltrosConsulta(
        parametrosConsulta({ ...d, resumen: true, page: 1 }),
      );
      setError(null);
      const firma = (f: FiltrosConsultaPedidos) =>
        parametrosConsulta({ ...f, resumen: true, page: 1 }).toString();
      if (firma(validado) === firma(aplicadoRef.current)) {
        pendienteSinRed.current = false;
        return;
      }
      if (sinConexionRef.current) {
        pendienteSinRed.current = true;
        return;
      }
      pendienteSinRed.current = false;
      onAplicarRef.current(validado);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisa los filtros.");
    }
  };
  useEffect(() => {
    // Al volver la conexión se aplica lo que quedó elegido sin consultar.
    if (!sinConexion && pendienteSinRed.current) aplicarBorrador(draftRef.current);
  }, [sinConexion]);

  /** Cambio inmediato (chips) o con espera (texto, fechas y horas). */
  const cambiar = (
    fn: (d: FiltrosConsultaPedidos) => FiltrosConsultaPedidos,
    esperar = false,
  ) => {
    const sig = fn(draftRef.current);
    draftRef.current = sig;
    setDraft(sig);
    if (timer.current) clearTimeout(timer.current);
    if (esperar)
      timer.current = setTimeout(
        () => aplicarBorrador(draftRef.current),
        ESPERA_MS,
      );
    else aplicarBorrador(sig);
  };
  function periodo(preset: Preset) {
    if (preset === "rango") {
      setAbierto(true);
      return;
    }
    const d = getPresetDate(preset);
    cambiar((f) => ({
      ...f,
      desde: d?.desde ?? "",
      hasta: d?.hasta ?? "",
      all: preset === "todos",
      desdeHora: "",
      hastaHora: "",
    }));
  }

  const hoy = getTodayString(),
    ayer = getPresetDate("ayer")!.desde;
  const activos = filtrosActivos(draft, repartidores);
  const visibles = repartidoresVisibles(repartidores, {
    moto,
    inactivos,
    texto: textoRep,
    elegidos: draft.repartidorId,
  });
  const ocultosInactivos = repartidores.filter((r) => !r.activo).length;
  const esRango =
    !draft.all &&
    !(draft.desde === hoy && draft.hasta === hoy) &&
    !(draft.desde === ayer && draft.hasta === ayer) &&
    !(draft.desde === ayer && draft.hasta === hoy);
  const canales = canalesVisibles(draft);
  const hayAlgo = activos.length > 0 || Boolean(draft.search) || esRango;

  return (
    <section
      className="rounded-xl border border-stone-200 bg-white p-4 lg:p-4"
      aria-label="Filtros de Pedidos"
      data-testid="consulta-filtros"
    >
      <div className="flex flex-wrap gap-2">
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
                    : esRango;
          return (
            <Chip key={k} activo={activo} onClick={() => periodo(k)}>
              {label}
            </Chip>
          );
        })}
      </div>
      <div className="mt-3 flex min-w-0 items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
          Buscar pedido, cliente, negocio o creador
          <input
            type="search"
            className={`${control} mt-1`}
            placeholder="Nombre, teléfono o #pedido"
            value={draft.search}
            maxLength={120}
            onChange={(e) =>
              cambiar((d) => ({ ...d, search: e.target.value }), true)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (timer.current) clearTimeout(timer.current);
                aplicarBorrador(draftRef.current);
              }
            }}
          />
        </label>
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={panelId}
          onClick={() => setAbierto((v) => !v)}
          className="min-h-11 shrink-0 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
        >
          Filtros{activos.length ? ` (${activos.length})` : ""}{" "}
          <span aria-hidden="true">{abierto ? "▴" : "▾"}</span>
        </button>
      </div>

      {abierto && (
        <div id={panelId} className="mt-3 space-y-4 rounded-lg border border-stone-200 p-3">
          <Grupo titulo="Canal de venta">
            <Chip
              activo={canales.includes("PUNTO")}
              onClick={() => cambiar((f) => alternarCanal(f, "PUNTO"))}
            >
              🏪 Punto
            </Chip>
            <Chip
              activo={canales.includes("DOMICILIO")}
              onClick={() => cambiar((f) => alternarCanal(f, "DOMICILIO"))}
            >
              🚚 Domicilio
            </Chip>
          </Grupo>
          <Grupo
            titulo="Entrega"
            ayuda="Puedes elegir varios estados; se muestran los que cumplan cualquiera."
          >
            {ESTADOS_ENTREGA.map(([k, label]) => (
              <Chip
                key={k}
                activo={draft.estadoEntrega.includes(k)}
                onClick={() => cambiar((f) => alternarEstadoEntrega(f, k))}
              >
                {label}
              </Chip>
            ))}
          </Grupo>
          <Grupo
            titulo="Gestión del pedido"
            ayuda="Una sola a la vez; reemplaza a los estados de entrega."
          >
            {FOCOS.map(([k, label]) => (
              <Chip
                key={k}
                activo={draft.foco === k}
                onClick={() => cambiar((f) => alternarFoco(f, k as FocoConsulta))}
              >
                {label}
              </Chip>
            ))}
          </Grupo>
          <Grupo titulo="Pago">
            {PAGOS.map(([k, label]) => (
              <Chip
                key={k}
                activo={draft.pago === k}
                onClick={() => cambiar((f) => alternarPago(f, k))}
              >
                {label}
              </Chip>
            ))}
          </Grupo>
          <Grupo titulo="Origen">
            {ORIGENES.map(([k, label]) => (
              <Chip
                key={k}
                activo={origenesVisibles(draft).includes(k)}
                onClick={() => cambiar((f) => alternarOrigen(f, k))}
              >
                {label}
              </Chip>
            ))}
          </Grupo>

          <div className="min-w-0">
            <p
              className="mb-1 text-xs font-semibold text-slate-600"
              id={`${panelId}-rep`}
            >
              Repartidor de la entrega
            </p>
            <button
              type="button"
              aria-labelledby={`${panelId}-rep`}
              aria-expanded={personas}
              onClick={() => setPersonas((v) => !v)}
              className={`${control} text-left sm:max-w-sm`}
              data-testid="consulta-repartidores"
            >
              🚚{" "}
              {draft.repartidorId.length
                ? repartidores
                    .filter((r) => draft.repartidorId.includes(r.id))
                    .map((r) => r.nombre)
                    .join(" o ") || `${draft.repartidorId.length} seleccionados`
                : "Todos"}{" "}
              <span aria-hidden="true">{personas ? "▴" : "▾"}</span>
            </button>
            {personas && (
              <fieldset className="mt-2 space-y-3 rounded-lg border border-stone-300 p-3">
                <legend className="px-1 text-xs font-semibold">
                  Elige uno o varios repartidores
                </legend>
                <input
                  type="search"
                  aria-label="Buscar repartidor"
                  placeholder="Buscar repartidor"
                  className={control}
                  value={textoRep}
                  maxLength={60}
                  onChange={(e) => setTextoRep(e.target.value)}
                />
                <div role="group" aria-label="Moto" className="flex flex-wrap gap-2">
                  {(
                    [
                      ["todos", "Todos"],
                      ["con", "🏍️ Con moto"],
                      ["sin", "Sin moto"],
                    ] as const
                  ).map(([k, label]) => (
                    <Chip key={k} activo={moto === k} onClick={() => setMoto(k)}>
                      {label}
                    </Chip>
                  ))}
                </div>
                {visibles.length ? (
                  <div className="flex flex-wrap gap-x-4">
                    {visibles.map((r) => (
                      <label
                        key={r.id}
                        className="flex min-h-11 items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={draft.repartidorId.includes(r.id)}
                          onChange={() =>
                            cambiar((f) => alternarRepartidor(f, r.id))
                          }
                        />
                        {r.nombre}
                        {r.usaMoto ? " 🏍️" : ""}
                        {!r.activo ? " (inactivo)" : ""}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    {repartidores.length
                      ? "Ningún repartidor coincide con estos criterios."
                      : "No hay repartidores disponibles en esta lectura."}
                  </p>
                )}
                {ocultosInactivos > 0 && (
                  <button
                    type="button"
                    aria-pressed={inactivos}
                    onClick={() => setInactivos((v) => !v)}
                    className="min-h-11 text-sm text-blue-700 underline"
                  >
                    {inactivos
                      ? "Ocultar inactivos"
                      : `Mostrar inactivos (${ocultosInactivos})`}
                  </button>
                )}
                <p className="text-xs text-slate-600">
                  Filtra por quién entregó, no por quién recibió el dinero ni por
                  la asignación actual. Cada pedido se cuenta una sola vez. «Con
                  moto» es un dato del trabajador y solo acota esta lista.
                </p>
              </fieldset>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600">
              Usar la fecha y hora de
              <select
                className={`${control} mt-1`}
                aria-label="Usar la fecha y hora de"
                value={draft.fechaBase}
                onChange={(e) =>
                  cambiar((f) => ({
                    ...f,
                    fechaBase: e.target
                      .value as FiltrosConsultaPedidos["fechaBase"],
                  }))
                }
              >
                <option value="pedido">🧾 Fecha del pedido</option>
                <option value="creacion">✍️ Creación registrada</option>
                <option value="entrega">🚚 Entrega registrada</option>
                <option value="cobro">💵 Cobro registrado</option>
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
                    cambiar(
                      (d) => ({ ...d, [k]: e.target.value, all: false }),
                      true,
                    )
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
                    cambiar(
                      (d) => ({
                        ...d,
                        [k]: e.target.value,
                        all: false,
                        desde: d.desde || hoy,
                        hasta: d.hasta || hoy,
                      }),
                      true,
                    )
                  }
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Hora de Colombia. Si eliges solo horas, se usa la fecha indicada
            arriba. La hora final incluye todo ese minuto; entre fechas
            distintas es un intervalo continuo.
          </p>
          <div
            role="group"
            aria-label="Estado del registro"
            className="flex flex-wrap gap-2"
          >
            {(
              [
                ["activos", "Activos"],
                ["todos", "Todos"],
                ["anulados", "Anulados"],
              ] as const
            ).map(([k, label]) => (
              <Chip
                key={k}
                activo={draft.registro === k}
                onClick={() => cambiar((f) => elegirRegistro(f, k))}
              >
                {label}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Activos excluye cancelados y anulados; Todos los incluye. Los
            anulados no suman como ventas.
          </p>
        </div>
      )}

      {activos.length > 0 && (
        <div
          className="mt-3 flex flex-wrap items-center gap-2 text-xs text-blue-800"
          aria-label="Filtros activos"
        >
          {activos.map((a) => (
            <button
              key={a.clave}
              type="button"
              className="min-h-9 rounded-full border border-blue-200 bg-blue-50 px-3"
              aria-label={`Quitar filtro ${a.etiqueta}`}
              onClick={() => cambiar(a.quitar)}
            >
              {a.etiqueta} ✕
            </button>
          ))}
        </div>
      )}
      {sinConexion && (
        <p role="status" className="mt-3 text-xs text-amber-800">
          Sin conexión. Tus filtros quedan elegidos y se aplicarán al volver.
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
      {hayAlgo && (
        <div className="mt-3">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              pendienteSinRed.current = false;
              setAbierto(false);
              setPersonas(false);
              setMoto("todos");
              setInactivos(false);
              setTextoRep("");
              onLimpiar();
            }}
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </section>
  );
}
