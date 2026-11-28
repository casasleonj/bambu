"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parametrosConsulta,
  type FiltrosConsultaPedidos,
  type ResultadoConsultaPedidos,
} from "@/lib/pedidos-consulta";
import type { Pedido } from "@/app/(app)/pedidos/pedido-hub/types";

interface EstadoPaginas {
  alcance: string;
  paginas: ReadonlyArray<ReadonlyArray<Pedido>>;
  cargando: boolean;
  error: string | null;
}
const SIN_PAGINAS: EstadoPaginas["paginas"] = [];

/**
 * #1046: carga incremental SOLO para Recorrido y Cercanía.
 * La primera página (y sus sumarios/grupos globales) proviene del hook normal.
 * Las siguientes usan el mismo endpoint, sin cambiar la URL ni el historial.
 *
 * El orden y el corte antes de paginar pertenecen al servidor; no reordenar
 * localmente ni inventar sumarios a partir de las páginas ya cargadas.
 */
export function useScrollInfinitoPedidos({
  activo, base, filtros, cambiando, pendienteBase,
}: {
  activo: boolean;
  base: ResultadoConsultaPedidos | null;
  filtros: FiltrosConsultaPedidos;
  cambiando: boolean;
  pendienteBase: boolean;
}) {
  const claveInicial = parametrosConsulta({ ...filtros, page: 1 }).toString();
  const inicial = activo && !cambiando && filtros.page === 1 &&
    base?.consultaKey === claveInicial && base.page === 1 &&
    base.pageSize === filtros.pageSize ? base : null;
  const alcance = inicial ? claveInicial + "|" + inicial.leidoAt : "";
  const [estado, setEstado] = useState<EstadoPaginas>({
    alcance: "", paginas: SIN_PAGINAS, cargando: false, error: null,
  });
  const enVuelo = useRef<AbortController | null>(null);
  const paginas = estado.alcance === alcance ? estado.paginas : SIN_PAGINAS;
  const cargandoMas = estado.alcance === alcance && estado.cargando && !!enVuelo.current;
  const errorMas = estado.alcance === alcance ? estado.error : null;
  const hayMas = !!inicial && (paginas.length + 1) * inicial.pageSize < inicial.total;

  const datos = useMemo<ResultadoConsultaPedidos | null>(() => {
    if (!inicial) return null;
    if (paginas.length === 0) return inicial;
    return { ...inicial, pedidos: [...inicial.pedidos, ...paginas.flat()] };
  }, [inicial, paginas]);

  // Ante un cambio de consulta, modo o snapshot: cancelar la respuesta vieja.
  useEffect(() => {
    return () => {
      enVuelo.current?.abort();
      enVuelo.current = null;
    };
  }, [alcance, activo]);

  const cargarMas = useCallback(async () => {
    if (!activo || !inicial || pendienteBase || !hayMas || enVuelo.current) return;
    const pagina = paginas.length + 2;
    const clavePagina = parametrosConsulta({ ...filtros, page: pagina }).toString();
    const controlador = new AbortController();
    enVuelo.current = controlador;
    setEstado({ alcance, paginas, cargando: true, error: null });
    try {
      const respuesta = await fetch("/api/pedidos/consulta?" + clavePagina, {
        cache: "no-store",
        signal: AbortSignal.any([controlador.signal, AbortSignal.timeout(25000)]),
      });
      if (respuesta.status === 401 || respuesta.status === 403)
        throw new Error(respuesta.status === 401
          ? "La sesión terminó. Inicia sesión de nuevo."
          : "Tu perfil no puede consultar Pedidos.");
      const bruto: unknown = await respuesta.json();
      const resultado = bruto && typeof bruto === "object"
        ? bruto as Partial<ResultadoConsultaPedidos> & { success?: boolean; error?: { message?: string } }
        : null;
      if (!respuesta.ok || !resultado?.success ||
          resultado.consultaKey !== clavePagina || resultado.page !== pagina ||
          resultado.pageSize !== inicial.pageSize || !Array.isArray(resultado.pedidos) ||
          !Number.isSafeInteger(resultado.total) || typeof resultado.leidoAt !== "string" ||
          !Number.isFinite(Date.parse(resultado.leidoAt))) {
        throw new Error(resultado?.error?.message || "No se pudo cargar la siguiente página.");
      }
      // Paginación por offset: si cambió el universo o se repite un ID,
      // detener la concatenación; no presentar una lista incorrecta como completa.
      const previos = new Set([...inicial.pedidos, ...paginas.flat()].map(p => p.id));
      const hayDuplicados = resultado.pedidos.some(p => {
        if (!p || typeof p.id !== "string" || previos.has(p.id)) return true;
        previos.add(p.id);
        return false;
      });
      const faltanEnPagina = (pagina - 1) * inicial.pageSize + resultado.pedidos.length < inicial.total;
      if (resultado.total !== inicial.total ||
          resultado.pedidos.length === 0 ||
          resultado.pedidos.length > inicial.pageSize ||
          (resultado.pedidos.length < inicial.pageSize && faltanEnPagina) ||
          hayDuplicados) {
        throw new Error("Los pedidos cambiaron durante el recorrido. Actualiza la lista para continuar sin duplicados.");
      }
      if (!controlador.signal.aborted) {
        setEstado(actual => actual.alcance === alcance
          ? { ...actual, paginas: [...actual.paginas, resultado.pedidos as Pedido[]], error: null }
          : actual);
      }
    } catch (e) {
      if (!controlador.signal.aborted) {
        setEstado(actual => actual.alcance === alcance
          ? { ...actual, error: e instanceof Error ? e.message : "No se pudo cargar más pedidos." }
          : actual);
      }
    } finally {
      if (enVuelo.current === controlador) enVuelo.current = null;
      if (!controlador.signal.aborted) {
        setEstado(actual => actual.alcance === alcance ? { ...actual, cargando: false } : actual);
      }
    }
  }, [activo, inicial, pendienteBase, hayMas, paginas, filtros, alcance]);

  return { datos, cargandoMas, errorMas, hayMas, cargarMas };
}
