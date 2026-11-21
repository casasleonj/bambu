"use client";
import { useEffect, useRef, useState } from "react";
import { OperacionConsulta, type AccionesConsulta } from "./operacion-consulta";
import type { AccionKey, Pedido } from "./types";

type Fase = "listo" | "gps" | "calculando" | "calculado" | "desactualizado" | "error";
interface Props {
  activo: boolean;
  pedidos: Pedido[];
  hoyBogota: string;
  acciones: AccionesConsulta;
  onAccion: (p: Pedido, k: AccionKey) => void;
  onOpen: (p: Pedido) => void;
}
function registro(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function ubicacionActual(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo no tiene GPS disponible. Revisa los permisos y HTTPS."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, err => reject(new Error(
      err.code === 1 ? "Autoriza la ubicación de este dispositivo para continuar."
        : "No se pudo obtener la ubicación actual. Revisa la señal GPS."
    )), { maximumAge: 0, enableHighAccuracy: true, timeout: 12000 });
  });
}

/** Consulta visual, nunca despacha ni cambia el estado de los pedidos. */
export function CercaniaPedidos({ activo, pedidos, hoyBogota, acciones, onAccion, onOpen }: Props) {
  const [elegidos, setElegidos] = useState<Pedido[]>([]);
  const [orden, setOrden] = useState<string[]>([]);
  const [fase, setFase] = useState<Fase>("listo");
  const [error, setError] = useState<string | null>(null);
  const [proveedor, setProveedor] = useState("");
  const envio = useRef(0);
  const ocupada = useRef(false);
  const focoTrasMover = useRef<string | null>(null);
  useEffect(() => {
    const id = focoTrasMover.current;
    if (!id) return;
    const controles = document.querySelectorAll<HTMLInputElement>('input[data-testid^="cercania-check-"]');
    const control = Array.from(controles).find(el => el.getAttribute("data-testid") === `cercania-check-${id}`);
    control?.focus({ preventScroll: true });
    focoTrasMover.current = null;
  }, [elegidos]);
  const encontrados = new Map(pedidos.map(p => [p.id, p]));
  const ids = new Set(elegidos.map(p => p.id));
  const seleccionados = elegidos.map(p => encontrados.get(p.id) ?? p);
  const ordenados = fase === "calculado"
    ? [...seleccionados].sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id))
    : seleccionados;
  const vistos = new Set<string>();
  const restantes = pedidos.filter(p => {
    if (vistos.has(p.id) || ids.has(p.id)) return false;
    vistos.add(p.id);
    return true;
  });
  const seleccion = (marcado: boolean) => ({ marcado, onAlternar: alternar });

  function alternar(p: Pedido) {
    if (ocupada.current) return;
    if (!ids.has(p.id) && elegidos.length >= 25) {
      setError("Puedes seleccionar hasta 25 pedidos por cálculo; ninguno será omitido.");
      return;
    }
    envio.current += 1;
    focoTrasMover.current = p.id;
    setElegidos(anterior => anterior.some(x => x.id === p.id)
      ? anterior.filter(x => x.id !== p.id) : [...anterior, p]);
    setOrden([]);
    setProveedor("");
    setFase(fase === "calculado" || fase === "desactualizado" ? "desactualizado" : "listo");
    setError(null);
  }

  async function calcular() {
    if (!activo || ocupada.current || !elegidos.length) return;
    ocupada.current = true;
    const version = ++envio.current;
    const pedidoIds = elegidos.map(p => p.id);
    setError(null);
    setFase("gps");
    try {
      if (!navigator.onLine) throw new Error("Sin conexión. La selección se conserva.");
      const pos = await ubicacionActual();
      if (version !== envio.current) return;
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
          (lat === 0 && lng === 0) || !Number.isFinite(accuracy) || accuracy > 1000)
        throw new Error("El GPS es demasiado impreciso para iniciar este recorrido.");
      setFase("calculando");
      const respuesta = await fetch("/api/pedidos/recorrido-vial", {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoIds, origen: { lat, lng } }),
      });
      const datos: unknown = await respuesta.json();
      if (version !== envio.current) return;
      if (!respuesta.ok || !registro(datos) || datos.success !== true) {
        const motivo = registro(datos) && registro(datos.error) && typeof datos.error.message === "string"
          ? datos.error.message : "El servicio vial no está disponible.";
        throw new Error(motivo);
      }
      const ruta = datos.ordenPedidoIds;
      if (!Array.isArray(ruta) || ruta.length !== pedidoIds.length ||
          ruta.some(id => typeof id !== "string" || !pedidoIds.includes(id)) ||
          new Set(ruta).size !== pedidoIds.length)
        throw new Error("La respuesta omitió o duplicó visitas. No se aplicó el orden.");
      setOrden(ruta as string[]);
      setProveedor(typeof datos.proveedor === "string" ? datos.proveedor : "");
      setFase("calculado");
    } catch (e) {
      if (version !== envio.current) return;
      setError(e instanceof Error ? e.message : "No fue posible calcular el recorrido.");
      setFase("error");
    } finally {
      ocupada.current = false;
    }
  }

  if (!activo) return null;
  const espera = fase === "gps" || fase === "calculando";
  return (
    <section className="space-y-3" data-testid="pedidos-cercania">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-blue-900">Seleccionados ({seleccionados.length})</h2>
          <span className="rounded-full bg-white px-2 py-1 text-xs text-blue-900" aria-live="polite">
            {fase === "calculado" ? "Orden sugerido" : fase === "desactualizado" ? "Desactualizado" : "Sin calcular"}
          </span>
        </div>
        <p className="mt-1 text-xs text-blue-900">
          {fase === "calculado" ? "Paradas numeradas por el proveedor vial." :
            "Los pedidos elegidos suben aquí; su orden inicial no es un recorrido optimizado."}
        </p>
        {ordenados.length ? <div className="mt-3 rounded-lg bg-white p-2 sm:p-3">
          <OperacionConsulta pedidos={ordenados} viewport="mobile" hoyBogota={hoyBogota}
            onAccion={onAccion} onOpen={onOpen} acciones={acciones}
            seleccion={{
              ...seleccion(true),
              ordenIds: fase === "calculado" ? orden : undefined,
              fueraDePaginaIds: new Set(seleccionados.filter(p => !encontrados.has(p.id)).map(p => p.id)),
            }}
          />
        </div> : <p className="mt-3 rounded-lg border border-dashed border-blue-300 p-3 text-sm">
          Marca uno o varios pedidos de la lista inferior.
        </p>}
        <p className="mt-3 text-xs text-blue-900">📍 Origen: GPS actual de este dispositivo, obtenido al calcular.</p>
        <button type="button" data-testid="cercania-calcular" disabled={espera || !elegidos.length}
          onClick={() => void calcular()}
          className="mt-2 min-h-11 w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
          {fase === "gps" ? "Obteniendo GPS…" : fase === "calculando" ? "Calculando…" :
            fase === "desactualizado" ? "Actualizar recorrido" :
            fase === "calculado" ? "Volver a calcular" : `Calcular recorrido (${elegidos.length})`}
        </button>
        {fase === "desactualizado" && <p className="mt-2 text-sm text-amber-900" role="status">
          La selección cambió; el orden anterior no es válido.</p>}
        {error && <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900" role="alert">{error}</p>}
        {fase === "calculado" && <p className="mt-2 text-xs text-blue-900" role="status">
          ✓ Recorrido sugerido {proveedor ? `(${proveedor})` : ""}. No crea embarques.</p>}
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4">
        <h2 className="font-bold text-slate-800">Otros pedidos ({restantes.length} visibles)</h2>
        <p className="mt-1 text-xs text-slate-500">Puedes seguir buscando y filtrando; los seleccionados permanecen arriba.</p>
        {restantes.length ? <OperacionConsulta pedidos={restantes} viewport="mobile"
          hoyBogota={hoyBogota} onAccion={onAccion} onOpen={onOpen} acciones={acciones}
          seleccion={seleccion(false)} /> :
          <p className="py-4 text-sm text-slate-500">No hay más pedidos con estos filtros.</p>}
      </div>
    </section>
  );
}
