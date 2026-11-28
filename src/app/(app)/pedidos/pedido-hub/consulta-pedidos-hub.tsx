"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sugerirRecorridoBarrios } from "@/lib/barrios/recorrido-aproximado";
import { useShallowSearchParams } from "@/hooks/use-shallow-search-params";
import { useConsultaPedidos } from "@/hooks/use-consulta-pedidos";
import { useScrollInfinitoPedidos } from "@/hooks/use-scroll-infinito-pedidos";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { EstadoGestionAdmin } from "@/hooks/use-gestion-admin";
import {
  arrastreIntegrado,
  baseEfectiva,
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
import { rotulosCompromiso } from "@/lib/pedidos-compromiso-rotulos";
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
  const [cercaniaActivo, setCercaniaActivo] = useState(false);
  const [modoRecorridoLocal, setModoRecorrido] = useState(false);
  const prioridadesActuales = useMemo(() => new URLSearchParams(paramKey).getAll("recorrido"), [paramKey]);
  // Las preferencias de ESTE recorrido se mantienen solo mientras la vista está montada:
  // no se guardan globalmente para otro repartidor, día o viaje.
  const prioridadesGuardadas = useRef<string[]>(prioridadesActuales);
  // Cercanía es otro modo: que la URL tenga prioridades no puede activarlo a la vez.
  const modoRecorrido = !cercaniaActivo && (modoRecorridoLocal || prioridadesActuales.length > 0);
  const scrollActivo = modoRecorrido || cercaniaActivo;
  const scroll = useScrollInfinitoPedidos({
    activo: scrollActivo,
    base: lectura?.datos ?? null,
    filtros: consulta.filtros,
    cambiando,
    pendienteBase: pendiente,
  });
  const datos = scrollActivo ? (scroll.datos ?? lectura?.datos) : lectura?.datos,
    filtrosLeidos = lectura?.filtros,
    hayDatos = !!lectura;
  const { onTotal, onPedidos } = props;
  // #1046: no solicitar repetidamente todas las páginas cuando los barrios
  // están plegados y el centinela sigue dentro del viewport sin nuevo scroll.
  const sentinelaScroll = useRef<HTMLDivElement | null>(null);
  const autoPreparado = useRef(true);
  const alcanceAuto = scrollActivo
    ? parametrosConsulta({ ...consulta.filtros, page: 1 }).toString() : "";
  useEffect(() => { autoPreparado.current = true; }, [alcanceAuto, scrollActivo]);
  useEffect(() => {
    if (!scrollActivo || !scroll.hayMas || scroll.cargandoMas || scroll.errorMas ||
        pendiente || cambiando || !isOnline) return;
    const nodo = sentinelaScroll.current;
    if (!nodo || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(entradas => {
      if (!entradas.some(entrada => entrada.isIntersecting)) {
        autoPreparado.current = true;
      } else if (autoPreparado.current) {
        autoPreparado.current = false;
        void scroll.cargarMas();
      }
    }, { rootMargin: "200px 0px" });
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [scrollActivo, scroll.hayMas, scroll.cargandoMas, scroll.errorMas,
      scroll.cargarMas, pendiente, cambiando, isOnline]);
  // En enlaces viejos con ?recorrido=...&page=N, el modo infinito empieza
  // siempre desde la página 1. El modo General conserva la URL paginada.
  useEffect(() => {
    if (modoRecorrido && consulta.filtros.page !== 1)
      params.set({ page: "1" }, { history: "replace" });
  }, [modoRecorrido, consulta.filtros.page, params]);
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
  useEffect(() => {
    if (prioridadesActuales.length > 0 && !cercaniaActivo) {
      prioridadesGuardadas.current = [...prioridadesActuales];
    }
  }, [prioridadesActuales, cercaniaActivo]);
  // Si el usuario activa Recorrido antes de que llegue la agregación global de
  // barrios, esperar esos datos completos; nunca inferir ruta desde la página.
  useEffect(() => {
    if (!modoRecorridoLocal || cercaniaActivo || prioridadesActuales.length > 0 || !datos?.grupos?.length) return;
    const sugerencia = sugerirRecorridoBarrios(datos.grupos).claves;
    if (!sugerencia.length) return;
    prioridadesGuardadas.current = sugerencia;
    params.set({ recorrido: sugerencia, agrupar: "barrio", page: "1" }, { history: "replace" });
  }, [modoRecorridoLocal, cercaniaActivo, prioridadesActuales, datos?.grupos, params]);
  // Atrás/Adelante debe reconciliar el modo local con la URL visitada.
  // El cambio de estado ocurre en el evento externo, no dentro del cuerpo del efecto.
  useEffect(() => {
    const alNavegar = () => {
      setModoRecorrido(false);
      setCercaniaActivo(false);
    };
    window.addEventListener("popstate", alNavegar);
    return () => window.removeEventListener("popstate", alNavegar);
  }, []);
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
  // #851: la vista por fecha prometida lleva su propio título y no muestra la
  // etiqueta de «Fecha del pedido» (esa fecha no se aplica en ella).
  const compromiso = enExpansion ? null : rotulosCompromiso(filtrosLeidos?.foco);
  const estadoLinea =
    estadoBusqueda.tipo === "cargando"
      ? "Buscando…"
      : estadoBusqueda.tipo === "error"
        ? "No se pudo buscar"
        : datos
          ? `${datos.total} resultado(s) de toda la consulta`
          : "Consultando…";
  // #915: agrupado por barrio, los pendientes/parciales de días anteriores y las entregas de pedidos
  // anteriores van DENTRO del grupo de su barrio, no como secciones sueltas.
  const integrado = arrastreIntegrado(filtrosLeidos ?? consulta.filtros);
  const encabezado = compromiso ? (
    <div className="mb-3" data-testid="encabezado-compromiso">
      <p className="text-xs text-slate-500">
        Por fecha prometida de entrega · {estadoLinea} · hora de Colombia ·{" "}
        <button
          type="button"
          className="min-h-11 text-blue-700 underline"
          onClick={() =>
            filtrosLeidos && aplicar({ ...filtrosLeidos, foco: "", page: 1 })
          }
        >
          Ver por fecha del pedido
        </button>
      </p>
    </div>
  ) : (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {enExpansion
            ? "Todos los períodos"
            : filtrosLeidos?.resumen
              ? "Pedidos de la consulta"
              : integrado
                ? "Pedidos de hoy y anteriores"
                : "Pedidos de hoy"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {estadoLinea} · hora de Colombia
        </p>
      </div>
      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
        {
          {
            pedido: "Fecha del pedido",
            creacion: "Fecha de creación",
            entrega: "Fecha de entrega",
            cobro: "Fecha del cobro",
          }[baseEfectiva(filtrosLeidos ?? consulta.filtros)]
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
  const arrastrados = aplicaArrastrados && !integrado
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
  const periodoEntregas: "hoy" | "en el período" =
    filtrosLeidos && filtrosLeidos.desde === hoyEntregas && filtrosLeidos.hasta === hoyEntregas
      ? "hoy"
      : "en el período";
  const entregasAplican = !!datos && !!filtrosLeidos && baseEfectiva(filtrosLeidos) === "pedido" && !filtrosLeidos.all;
  // Sin filas que agrupar, las entregas anteriores se muestran como antes (no deben desaparecer).
  const integradoConFilas = integrado && !datos?.actividadIntegrada && !!datos && datos.pedidos.length > 0;
  const entregasNode =
    entregasAplican && !datos?.actividadIntegrada && !integradoConFilas && datos && filtrosLeidos ? (
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
  const hubNode = (
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
                modoRecorridoExterno={modoRecorrido}
                cercaniaActivo={cercaniaActivo}
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
                  grupos: datos?.grupos,
                  entregasAnteriores: integradoConFilas && entregasAplican && datos && filtrosLeidos
                    ? {
                        entregas: datos.destacadas ?? [],
                        primeraPagina: datos.page <= 1,
                        hasta: filtrosLeidos.hasta,
                        periodo: periodoEntregas,
                        onVerTodas: () => aplicar({ ...filtrosLeidos, fechaBase: "entrega", resumen: true, page: 1 }),
                      }
                    : undefined,
                  grupoActivo: filtrosLeidos?.grupoBarrio || undefined,
                  franjas: filtrosLeidos?.foco === "paraHoy",
                  vacioCompromiso: rotulosCompromiso(filtrosLeidos?.foco) ?? undefined,
                  onGrupoBarrio: filtrosLeidos
                    ? (clave) => aplicar({ ...filtrosLeidos, grupoBarrio: clave ?? "", page: 1 })
                    : undefined,
                }}
              />
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
      <div className="flex flex-wrap items-center gap-2" data-testid="pedidos-modos">
        <button type="button" aria-pressed={modoRecorrido} data-testid="recorrido-toggle"
          className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${modoRecorrido ? "border-blue-700 bg-blue-700 text-white" : "border-stone-300 bg-white text-slate-800"}`}
          onClick={() => {
            const activar = !modoRecorrido;
            if (prioridadesActuales.length > 0) prioridadesGuardadas.current = [...prioridadesActuales];
            const sugerencia = activar && !prioridadesGuardadas.current.length
              ? sugerirRecorridoBarrios(datos?.grupos ?? []).claves
              : prioridadesGuardadas.current;
            params.set({
              recorrido: activar ? sugerencia : undefined,
              agrupar: 'barrio',
              page: '1',
            }, { history: 'push' });
            setModoRecorrido(activar);
            setCercaniaActivo(false);
          }}>
          Recorrido
        </button>
        <button type="button" aria-pressed={cercaniaActivo} data-testid="cercania-toggle"
          className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${cercaniaActivo ? "border-blue-700 bg-blue-700 text-white" : "border-stone-300 bg-white text-slate-800"}`}
          onClick={() => {
            if (!cercaniaActivo) {
              // Solo se suspende la prioridad en la URL mientras está activo GPS.
              // Al regresar a Recorrido se restaura exactamente el orden elegido.
              if (prioridadesActuales.length > 0) prioridadesGuardadas.current = [...prioridadesActuales];
              params.set({ recorrido: undefined, page: "1" }, { history: "push" });
              setModoRecorrido(false);
            } else if (consulta.filtros.page !== 1) {
              // La carga incremental siempre empieza desde la primera página.
              params.set({ page: "1" }, { history: "replace" });
            }
            setCercaniaActivo(valor => !valor);
          }}>
          📍 Cercanía
        </button>
        <span className="text-xs text-slate-600">
          {cercaniaActivo ? "Selecciona pedidos; el GPS se obtiene al calcular."
            : modoRecorrido ? "Orden manual de barrios"
            : "Lista General por defecto"}
        </span>
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
            <ResumenConsulta resumen={datos.resumen} filtros={filtrosLeidos} onReintentar={() => void refetch()} />
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
            {cercaniaActivo ? (
              hubNode
            ) : (
              <>
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
              hubNode
            )}
              </>
            )}
            {scrollActivo && datos && (
              <div className="mt-4 space-y-2 border-t border-stone-200 pt-3 text-sm"
                data-testid="scroll-infinito-pedidos">
                <p className="text-slate-600" role="status" aria-live="polite">
                  Mostrando {datos.pedidos.length} de {datos.total} pedidos
                  {scroll.cargandoMas ? " · Cargando más…" : ""}
                </p>
                {scroll.errorMas && (
                  <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
                    {scroll.errorMas}
                    <button type="button" onClick={() => void scroll.cargarMas()}
                      disabled={scroll.cargandoMas || pendiente || cambiando || !isOnline}
                      className="ml-2 min-h-11 rounded border border-amber-500 bg-white px-3 font-semibold disabled:opacity-50">
                      Reintentar carga
                    </button>
                    <button type="button" onClick={refresh}
                      className="ml-2 min-h-11 rounded border border-amber-500 bg-white px-3 font-semibold">
                      Actualizar lista
                    </button>
                  </div>
                )}
                {scroll.hayMas && (
                  <div ref={sentinelaScroll} data-testid="scroll-infinito-centinela"
                    className="flex justify-center py-2">
                    <button type="button" data-testid="scroll-infinito-cargar-mas"
                      onClick={() => void scroll.cargarMas()}
                      disabled={scroll.cargandoMas || pendiente || cambiando || !isOnline}
                      className="min-h-11 rounded-lg border border-blue-400 bg-white px-5 font-semibold text-blue-800 disabled:opacity-50">
                      {scroll.cargandoMas ? "Cargando más pedidos…" : !isOnline
                        ? "Sin conexión: vuelve a conectarte"
                        : "Cargar más pedidos"}
                    </button>
                  </div>
                )}
                {!scroll.hayMas && !pendiente && !cambiando && scroll.datos && datos.total > 0 && (
                  <p className="text-center text-xs text-slate-500">Todos los pedidos de esta consulta están cargados.</p>
                )}
              </div>
            )}
            {!scrollActivo && datos && datos.total > datos.pageSize && (
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
