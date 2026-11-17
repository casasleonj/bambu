"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallowSearchParams } from "@/hooks/use-shallow-search-params";
import { useConsultaPedidos } from "@/hooks/use-consulta-pedidos";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { EstadoGestionAdmin } from "@/hooks/use-gestion-admin";
import {
  clavesConsultaPedidos,
  filtrosArrastrados,
  leerFiltrosConsulta,
  parametrosConsulta,
  type FiltrosConsultaPedidos,
  type ResultadoConsultaPedidos,
} from "@/lib/pedidos-consulta";
import { PedidoHub, type PedidoHubCounts } from "./index";
import { FiltrosConsulta } from "./filtros-consulta";
import { EntregasDestacadas } from "./entregas-destacadas";
import { ResumenConsulta } from "./resumen-consulta";
import { RecurrentesDelDia } from "./recurrentes-del-dia";
import { fechaLecturaConsulta } from "./fecha-consulta";
import { getTodayString } from "@/lib/dates";
import {
  derivarEstadoBusqueda,
  textoVolver,
  tituloVacio,
} from "./busqueda-sin-resultados";
import type { AccionKey, Pedido } from "./types";

interface Props {
  userRole: string | null;
  gestion: EstadoGestionAdmin;
  refreshKey: number;
  counts: PedidoHubCounts;
  pendientes: Pedido[];
  onAccion: (p: Pedido, k: AccionKey) => void;
  onNuevaOperacion?: () => void;
  onVerPedido: (id: string) => void;
  onVerFactura: (p: Pedido) => void;
  onRefetchCounts: () => void;
  onTotal: (n: number) => void;
  onPedidos: (pedidos: Pedido[]) => void;
  onCorregirPendiente: (id: string) => void;
  onDescartarPendiente: (id: string) => void;
  onPeekMovilChange?: (abierta: boolean) => void;
  initial?: ResultadoConsultaPedidos;
}
export function ConsultaPedidosHub(props: Props) {
  const params = useShallowSearchParams(),
    isOnline = useOnlineStatus(),
    paramKey = params.toString();
  const consulta = useMemo(() => {
    try {
      return {
        filtros: leerFiltrosConsulta(new URLSearchParams(paramKey)),
        error: null,
      };
    } catch (error) {
      return {
        filtros: leerFiltrosConsulta(new URLSearchParams()),
        error:
          error instanceof Error
            ? error.message
            : "Revisa los filtros del enlace.",
      };
    }
  }, [paramKey]);
  const { lectura, error, pendiente, cambiando, refetch } = useConsultaPedidos(
    consulta.filtros,
    props.refreshKey,
    !consulta.error,
    props.initial,
  );
  const datos = lectura?.datos,
    filtrosLeidos = lectura?.filtros,
    hayDatos = !!lectura;
  const { onTotal, onPedidos } = props;
  useEffect(() => {
    onTotal(datos?.total ?? 0);
    onPedidos([...(datos?.pedidos ?? []), ...(datos?.arrastrados ?? [])]);
  }, [datos, onTotal, onPedidos]);
  const aplicar = useCallback(
    (f: FiltrosConsultaPedidos) => {
      const nuevos = parametrosConsulta(f),
        updates: Record<string, string | string[] | undefined> = {};
      for (const k of clavesConsultaPedidos) {
        const valores = nuevos.getAll(k);
        updates[k] = valores.length > 1 ? valores : valores[0] || undefined;
      }
      params.set(updates, { history: "push" });
    },
    [params],
  );
  const limpiar = () => {
    const updates: Record<string, undefined> = {};
    for (const k of clavesConsultaPedidos) updates[k] = undefined;
    params.set(updates, { history: "push" });
  };
  const refresh = () => {
    void refetch();
    props.onRefetchCounts();
  };
  const gestionDesconocida =
    props.userRole === "ADMIN" &&
    props.gestion.estadoConsulta &&
    props.gestion.estadoConsulta !== "verificado";
  const filas = useMemo(
    () => [...props.pendientes, ...(datos?.pedidos ?? [])],
    [props.pendientes, datos?.pedidos],
  );
  // #788: rango que había antes de pulsar «Ver todos los períodos» (solo se honra
  // mientras la búsqueda sea la misma que lo originó).
  const [filtrosPrevios, setFiltrosPrevios] =
    useState<FiltrosConsultaPedidos | null>(null);
  const estadoBusqueda = derivarEstadoBusqueda({
    filtrosUrl: consulta.filtros,
    lectura: lectura
      ? { filtros: lectura.filtros, total: lectura.datos.total }
      : null,
    cambiando,
    hayError: !!error,
    filasVisibles: filas.length,
    filtrosPrevios:
      filtrosPrevios &&
      filtrosPrevios.search.trim() === consulta.filtros.search.trim()
        ? filtrosPrevios
        : null,
    hoy: getTodayString(),
  });
  // Mismo cambio de rango que el chip «Todos»; el texto buscado se conserva.
  const verTodosLosPeriodos = () => {
    setFiltrosPrevios(consulta.filtros);
    aplicar({
      ...consulta.filtros,
      desde: "",
      hasta: "",
      desdeHora: "",
      hastaHora: "",
      all: true,
      page: 1,
    });
  };
  const volverAlPeriodo = () => {
    const previos = filtrosPrevios;
    setFiltrosPrevios(null);
    if (previos)
      aplicar({ ...previos, search: consulta.filtros.search, page: 1 });
  };
  const limpiarBusqueda = () =>
    aplicar({ ...consulta.filtros, search: "", page: 1 });
  const enExpansion =
    estadoBusqueda.tipo === "cargando" ||
    estadoBusqueda.tipo === "error" ||
    estadoBusqueda.tipo === "resultado" ||
    estadoBusqueda.tipo === "sin-resultados-en-todos";
  const muestraHub =
    !(datos && datos.total > 0 && datos.pedidos.length === 0) &&
    (estadoBusqueda.tipo === "normal" || estadoBusqueda.tipo === "resultado");
  // El título de la lista va dentro de PedidoHub (después de los pendientes
  // anteriores) cuando se dibuja la lista; en los demás estados va solo.
  const encabezado = (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {enExpansion
            ? "Todos los períodos"
            : filtrosLeidos?.resumen
              ? "Pedidos de la consulta"
              : "Pedidos de hoy"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {estadoBusqueda.tipo === "cargando"
            ? "Buscando…"
            : estadoBusqueda.tipo === "error"
              ? "No se pudo buscar"
              : datos
                ? `${datos.total} resultado(s) de toda la consulta`
                : "Consultando…"}{" "}
          · hora de Colombia
        </p>
      </div>
      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
        {
          {
            pedido: "Fecha del pedido",
            creacion: "Fecha de creación",
            entrega: "Fecha de entrega",
            cobro: "Fecha del cobro",
          }[filtrosLeidos?.fechaBase ?? consulta.filtros.fechaBase]
        }
      </span>
    </div>
  );
  const baseArrastrados = filtrosLeidos ?? consulta.filtros;
  const aplicaArrastrados = !!filtrosArrastrados(baseArrastrados);
  const verArrastrados = () => {
    const fa = filtrosArrastrados(baseArrastrados);
    if (fa) aplicar({ ...fa, resumen: true, pageSize: baseArrastrados.pageSize });
  };
  const arrastrados = aplicaArrastrados
    ? {
        pedidos: datos?.arrastrados ?? [],
        total: datos?.arrastradosTotal ?? 0,
        error: !!datos?.arrastradosError,
        cargando: !hayDatos && pendiente,
        onVerTodos: verArrastrados,
        onReintentar: refresh,
      }
    : undefined;
  // #841: las entregas de pedidos anteriores van plegadas, después de los pendientes.
  const hoyEntregas = getTodayString();
  const entregasNode =
    datos && filtrosLeidos?.fechaBase === "pedido" && !filtrosLeidos.all ? (
      <EntregasDestacadas
        entregas={datos.destacadas ?? []}
        total={datos.destacadasTotal ?? 0}
        rangoAmplio={!!datos.destacadasRangoAmplio}
        hasta={filtrosLeidos.hasta}
        plegable
        periodo={
          filtrosLeidos.desde === hoyEntregas && filtrosLeidos.hasta === hoyEntregas
            ? "hoy"
            : "en el período"
        }
        onVerPedido={props.onVerPedido}
        onVerTodas={() => aplicar({ ...filtrosLeidos, fechaBase: "entrega", resumen: true, page: 1 })}
      />
    ) : null;
  return (
    <div
      className="space-y-3 rounded-xl bg-[#f6f0e5] p-3 lg:p-4"
      data-testid="consulta-pedidos-hub"
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs ${gestionDesconocida ? "border-amber-200 bg-amber-50 text-amber-900" : props.gestion.activa ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-stone-300 bg-stone-100 text-stone-700"}`}
      >
        {gestionDesconocida ? (
          <span>
            {props.gestion.estadoConsulta === "error"
              ? "No se pudo consultar la gestión directa."
              : "Consultando gestión directa…"}{" "}
            No se habilitan acciones sin verificarla.
          </span>
        ) : props.userRole === "ADMIN" ? (
          <span>
            <strong>
              {props.gestion.activa
                ? "✅ Gestión directa activa"
                : "⏸ Gestión directa desactivada"}
            </strong>
            <span className="ml-2">
              {props.gestion.activa
                ? "Registra entregas y cobros desde el pedido, sin embarque."
                : "La gestión directa no se cambia desde esta lista. Planificar conserva su acceso."}
            </span>
          </span>
        ) : (
          <span>
            📦 Consulta entregas y pagos desde cada pedido. Las acciones
            dependen de tu perfil.
          </span>
        )}
        {props.gestion.estadoConsulta === "error" && (
          <button
            type="button"
            className="min-h-11 rounded border px-3 font-semibold"
            onClick={props.gestion.reintentar}
          >
            Reintentar consulta
          </button>
        )}
      </div>
      <FiltrosConsulta
        filtros={consulta.filtros}
        repartidores={datos?.repartidores ?? []}
        sinConexion={!isOnline}
        onAplicar={aplicar}
        onLimpiar={limpiar}
      />
      {consulta.error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>{consulta.error}</p>
          <button
            type="button"
            onClick={limpiar}
            className="mt-2 min-h-11 rounded border px-3"
          >
            Restablecer a Hoy
          </button>
        </div>
      ) : (
        <>
          {cambiando && !enExpansion && (
            <p
              role="status"
              className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"
            >
              {pendiente
                ? "Actualizando la consulta…"
                : "No se pudo aplicar la nueva consulta."}{" "}
              Conservamos la lectura anterior y sus filtros hasta obtener una
              respuesta completa.
            </p>
          )}
          {!muestraHub && entregasNode}
          {datos?.resumen && filtrosLeidos && (
            <ResumenConsulta resumen={datos.resumen} filtros={filtrosLeidos} />
          )}
          {(estadoBusqueda.tipo === "resultado" ||
            estadoBusqueda.tipo === "sin-resultados-en-todos") && (
            <div
              role="status"
              data-testid="busqueda-todos-periodos"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
            >
              <span>
                Mostrando <strong>todos los períodos</strong> para «
                {estadoBusqueda.busqueda}».
              </span>
              <button
                type="button"
                onClick={volverAlPeriodo}
                className="min-h-11 rounded border border-blue-300 bg-white px-3 font-semibold"
              >
                {textoVolver(estadoBusqueda.volver)}
              </button>
            </div>
          )}
          <section className="rounded-xl border border-stone-200 bg-white p-4">
            {!muestraHub && encabezado}
            {datos && datos.total > 0 && datos.pedidos.length === 0 ? (
              <div className="p-5 text-center">
                <p className="text-sm text-slate-600">
                  Esta página ya no tiene resultados. Hay {datos.total} pedidos
                  en la consulta.
                </p>
                <button
                  type="button"
                  className="mt-3 min-h-11 rounded border px-3"
                  onClick={() => aplicar({ ...consulta.filtros, page: 1 })}
                >
                  Volver a la primera página
                </button>
              </div>
            ) : estadoBusqueda.tipo === "vacio" ? (
              <div
                className="p-5 text-center"
                data-testid="busqueda-sin-resultados"
              >
                <div className="text-3xl" aria-hidden="true">
                  🔎
                </div>
                <h3 className="mt-2 text-base font-bold text-slate-800">
                  {tituloVacio(estadoBusqueda.periodo, estadoBusqueda.busqueda)}
                </h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                  El cliente o negocio puede tener pedidos en otros días. Tu
                  búsqueda se conserva.
                </p>
                <button
                  type="button"
                  onClick={verTodosLosPeriodos}
                  className="mt-3 min-h-11 rounded-lg bg-blue-700 px-4 font-bold text-white"
                >
                  Ver todos los períodos
                </button>
                <button
                  type="button"
                  onClick={limpiarBusqueda}
                  className="mx-auto mt-2 block min-h-11 px-3 text-sm font-semibold text-blue-700"
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : estadoBusqueda.tipo === "cargando" ? (
              <div
                role="status"
                aria-live="polite"
                className="animate-pulse space-y-2"
                data-testid="busqueda-cargando"
              >
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-gray-100" />
                ))}
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    disabled
                    className="min-h-11 rounded-lg bg-blue-300 px-4 font-bold text-white"
                  >
                    Buscando pedidos…
                  </button>
                </div>
              </div>
            ) : estadoBusqueda.tipo === "error" ? (
              <div
                role="alert"
                data-testid="busqueda-error"
                className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                <h3 className="font-bold">No se pudo buscar</h3>
                <p className="mt-1">
                  Revisa tu conexión e inténtalo de nuevo. Tu búsqueda «
                  {estadoBusqueda.busqueda}» sigue escrita y no se perdió nada.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={refresh}
                    className="min-h-11 rounded-lg bg-blue-700 px-4 font-bold text-white"
                  >
                    Reintentar
                  </button>
                  <button
                    type="button"
                    onClick={volverAlPeriodo}
                    className="min-h-11 rounded-lg border bg-white px-4 font-semibold text-slate-800"
                  >
                    {textoVolver(estadoBusqueda.volver)}
                  </button>
                </div>
              </div>
            ) : estadoBusqueda.tipo === "sin-resultados-en-todos" ? (
              <div
                className="p-5 text-center"
                data-testid="busqueda-sin-resultados-todos"
              >
                <h3 className="text-base font-bold text-slate-800">
                  Sin pedidos para «{estadoBusqueda.busqueda}» en ningún período
                </h3>
                <button
                  type="button"
                  onClick={limpiarBusqueda}
                  className="mx-auto mt-2 block min-h-11 px-3 text-sm font-semibold text-blue-700"
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              <PedidoHub
                pedidos={filas}
                counts={props.counts}
                loading={!hayDatos && pendiente}
                refetching={hayDatos && pendiente}
                error={error}
                userRole={props.userRole}
                onAccion={props.onAccion}
                onNuevaOperacion={props.onNuevaOperacion}
                onRetry={refresh}
                onRefetch={refresh}
                onPeekMovilChange={props.onPeekMovilChange}
                arrastrados={arrastrados}
                encabezadoLista={encabezado}
                entregasSlot={entregasNode}
                consulta={{
                  userRole: props.userRole,
                  gestionDirecta: props.gestion.activa && !gestionDesconocida,
                  volver: `/pedidos${paramKey ? "?" + paramKey : ""}`,
                  onVerPedido: props.onVerPedido,
                  onVerFactura: props.onVerFactura,
                  onCorregirPendiente: props.onCorregirPendiente,
                  onDescartarPendiente: props.onDescartarPendiente,
                }}
              />
            )}
            {datos && datos.total > datos.pageSize && (
              <nav
                aria-label="Páginas de la consulta"
                className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3 text-xs text-slate-600"
              >
                <span>
                  Página {datos.page} de{" "}
                  {Math.max(1, Math.ceil(datos.total / datos.pageSize))} ·{" "}
                  {datos.total} pedidos
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={datos.page <= 1 || pendiente || cambiando}
                    onClick={() =>
                      aplicar({ ...consulta.filtros, page: datos.page - 1 })
                    }
                    className="min-h-11 rounded-lg border px-3 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={
                      datos.page * datos.pageSize >= datos.total ||
                      pendiente ||
                      cambiando
                    }
                    onClick={() =>
                      aplicar({ ...consulta.filtros, page: datos.page + 1 })
                    }
                    className="min-h-11 rounded-lg border px-3 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </nav>
            )}
            {datos && (
              <p className="mt-3 text-xs text-slate-500">
                Lectura del{" "}
                {fechaLecturaConsulta(datos.leidoAt)}
                .
                {!isOnline
                  ? " Sin conexión; conserva las cifras de esta lectura."
                  : ""}
              </p>
            )}
          </section>
          {/* Hasta la fase C se conserva el generador contextual existente. */}
          <RecurrentesDelDia />
        </>
      )}
    </div>
  );
}
