"use client";
import { useCallback, useEffect, useMemo } from "react";
import { useShallowSearchParams } from "@/hooks/use-shallow-search-params";
import { useConsultaPedidos } from "@/hooks/use-consulta-pedidos";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { EstadoGestionAdmin } from "@/hooks/use-gestion-admin";
import {
  clavesConsultaPedidos,
  leerFiltrosConsulta,
  parametrosConsulta,
  type FiltrosConsultaPedidos,
  type ResultadoConsultaPedidos,
} from "@/lib/pedidos-consulta";
import { PedidoHub, type PedidoHubCounts } from "./index";
import { FiltrosConsulta } from "./filtros-consulta";
import { ResumenConsulta } from "./resumen-consulta";
import { RecurrentesDelDia } from "./recurrentes-del-dia";
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
    onPedidos(datos?.pedidos ?? []);
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
          {cambiando && (
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
          {datos?.resumen && filtrosLeidos && (
            <ResumenConsulta resumen={datos.resumen} filtros={filtrosLeidos} />
          )}
          <section className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {filtrosLeidos?.resumen
                    ? "Pedidos de la consulta"
                    : "Pedidos de hoy"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {datos
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
                {new Intl.DateTimeFormat("es-CO", {
                  timeZone: "America/Bogota",
                  dateStyle: "short",
                  timeStyle: "medium",
                }).format(new Date(datos.leidoAt))}
                .
                {!isOnline
                  ? " Sin conexión; conserva las cifras de esta lectura."
                  : ""}
              </p>
            )}
          </section>
          {/* Hasta la fase C se conserva el generador contextual existente. */}
          <RecurrentesDelDia onGenerado={refresh} />
        </>
      )}
    </div>
  );
}
