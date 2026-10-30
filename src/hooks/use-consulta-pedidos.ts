"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  parametrosConsulta,
  type FiltrosConsultaPedidos,
  type ResultadoConsultaPedidos,
} from "@/lib/pedidos-consulta";

/** Lista y resumen viajan juntos. Una respuesta anterior nunca gana a otra consulta. */
export function useConsultaPedidos(
  filtros: FiltrosConsultaPedidos,
  refreshKey: number,
  enabled = true,
  initial?: ResultadoConsultaPedidos,
) {
  const key = parametrosConsulta(filtros).toString();
  const coincideInicial = initial?.consultaKey === key;
  const [lectura, setLectura] = useState<{
    datos: ResultadoConsultaPedidos;
    filtros: FiltrosConsultaPedidos;
    key: string;
  } | null>(() =>
    initial && coincideInicial ? { datos: initial, filtros, key } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(!coincideInicial);
  const seq = useRef(0),
    controller = useRef<AbortController | null>(null);
  const refetch = useCallback(async () => {
    controller.current?.abort();
    const actual = ++seq.current,
      abort = new AbortController();
    controller.current = abort;
    setPendiente(true);
    setError(null);
    try {
      const response = await fetch(`/api/pedidos/consulta?${key}`, {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]),
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        if (actual === seq.current) setLectura(null);
        throw new Error(
          response.status === 401
            ? "La sesión terminó. Inicia sesión de nuevo."
            : "Tu perfil no puede consultar Pedidos.",
        );
      }
      const datos = await response.json();
      if (
        !response.ok ||
        !datos.success ||
        datos.consultaKey !== key ||
        !Array.isArray(datos.pedidos) ||
        !Number.isSafeInteger(datos.total) ||
        datos.total < 0 ||
        datos.page !== filtros.page ||
        datos.pageSize !== filtros.pageSize ||
        typeof datos.leidoAt !== "string" ||
        !Number.isFinite(Date.parse(datos.leidoAt))
      )
        throw new Error(
          datos.error?.message || "No se pudo actualizar la consulta.",
        );
      if (actual === seq.current && !abort.signal.aborted)
        setLectura({
          datos,
          filtros: JSON.parse(
            JSON.stringify(filtros),
          ) as FiltrosConsultaPedidos,
          key,
        });
    } catch (e) {
      if (actual === seq.current && !abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : "No se pudo actualizar la consulta.",
        );
    } finally {
      if (actual === seq.current && !abort.signal.aborted) setPendiente(false);
    }
    // La key contiene todos los filtros. No depender de objetos nuevos por render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Inicia una solicitud externa real; no copia props a estado derivable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled) void refetch();
    return () => controller.current?.abort();
  }, [refetch, refreshKey, enabled]);
  return {
    lectura,
    error,
    pendiente,
    refetch,
    cambiando: !!lectura && lectura.key !== key,
  };
}
