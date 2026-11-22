"use client";
import { useEffect, useRef, useState } from "react";
import { OperacionConsulta, type AccionesConsulta } from "./operacion-consulta";
import { OperacionList } from "./operacion-list";
import { esVisitaPendienteCercania, resumirCargaCercania } from "./resumen-carga-cercania";
import { getProductoIconConfig } from "@/lib/producto-iconos";
import type { AccionKey, Pedido } from "./types";

type Fase = "listo" | "gps" | "calculando" | "calculado" | "desactualizado" | "error";
interface Props {
  activo: boolean;
  pedidos: Pedido[];
  viewport: "desktop" | "mobile";
  hoyBogota: string;
  acciones: AccionesConsulta;
  onAccion: (p: Pedido, k: AccionKey) => void;
  onOpen: (p: Pedido) => void;
}
function registro(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
const nombresProductos: Record<string, [string, string]> = {
  PACA_AGUA: ["paca de agua", "pacas de agua"],
  PACA_HIELO: ["paca de hielo", "pacas de hielo"],
  BOTELLON: ["botellón", "botellones"],
  BOLSA_AGUA: ["bolsa de agua", "bolsas de agua"],
  BOLSA_HIELO: ["bolsa de hielo", "bolsas de hielo"],
};

function nombreProducto(producto: string, unidades: number): string {
  const nombres = nombresProductos[producto];
  return nombres ? nombres[unidades === 1 ? 0 : 1] : getProductoIconConfig(producto).label;
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
export function CercaniaPedidos({ activo, pedidos, viewport, hoyBogota, acciones, onAccion, onOpen }: Props) {
  const [elegidos, setElegidos] = useState<Pedido[]>([]);
  const [orden, setOrden] = useState<string[]>([]);
  const [fase, setFase] = useState<Fase>("listo");
  const [error, setError] = useState<string | null>(null);
  const [proveedor, setProveedor] = useState("");
  const [firmaSolicitud, setFirmaSolicitud] = useState<string | null>(null);
  const [ultimaPagina, setUltimaPagina] = useState(pedidos);
  const envio = useRef(0);
  const ocupada = useRef(false);
  const focoTrasMover = useRef<string | null>(null);
  const firmaActual = useRef<string>("");
  useEffect(() => {
    const id = focoTrasMover.current;
    if (!id) return;
    const controles = document.querySelectorAll<HTMLInputElement>('input[data-testid^="cercania-check-"]');
    const control = Array.from(controles).find(el => el.getAttribute("data-testid") === `cercania-check-${id}`);
    control?.focus({ preventScroll: true });
    focoTrasMover.current = null;
  }, [elegidos]);
  const encontrados = new Map(pedidos.map(p => [p.id, p]));
  // React permite ajustar estado frente a nuevos props durante render si se
  // protege por identidad de la nueva página. No utilizar setState en effect.
  // Así la selección inválida se elimina DE VERDAD y no resucita al paginar.
  if (ultimaPagina !== pedidos) {
    setUltimaPagina(pedidos);
    const invalidados = new Set(elegidos.filter(p => {
      const actual = encontrados.get(p.id);
      return actual !== undefined && !esVisitaPendienteCercania(actual, hoyBogota);
    }).map(p => p.id));
    if (invalidados.size)
      setElegidos(anterior => anterior.filter(p => !invalidados.has(p.id)));
  }
  // Fuera de página se conserva una instantánea hasta obtener datos frescos.
  // La API valida otra vez su estado físico al calcular.
  const seleccionados = elegidos.map(p => encontrados.get(p.id) ?? p)
    .filter(p => esVisitaPendienteCercania(p, hoyBogota));
  const ids = new Set(seleccionados.map(p => p.id));
  const carga = resumirCargaCercania(seleccionados);
  // Los cambios físicos, financieros o de ubicación invalidan una sugerencia ya calculada.
  // No se optimiza de nuevo sin acción explícita del usuario (#930).
  const firmaGestion = JSON.stringify(seleccionados.map(p => [
    p.id, p.canal, p.estadoEntrega, p.estadoPago, p.embarqueId,
    p.entregaLat, p.entregaLng, p.lat, p.lng, p.saldo, p.exigible,
    p.fechaEntrega, p.entregaNoAntesDe, p.items?.map(i => [
      i.producto, i.cantPedido, i.cantEntrega, i.cantRegaloPedido, i.cantRegaloEntrega,
    ]),
    p.cPacaAguaEnt, p.cPacaHieloEnt, p.cBotellonFabEnt, p.cBotellonDomEnt,
    p.cBolsaAguaEnt, p.cBolsaHieloEnt,
  ]));
  useEffect(() => {
    firmaActual.current = firmaGestion;
  }, [firmaGestion]);
  // Una respuesta vial solo representa el snapshot con el que se solicitó.
  // Derivar su caducidad evita efectos que llamen a setState (error de lint).
  const faseVisible = firmaSolicitud !== null && firmaSolicitud !== firmaGestion &&
    (fase === "gps" || fase === "calculando" || fase === "calculado")
    ? "desactualizado" : fase;
  const ordenados = faseVisible === "calculado"
    ? [...seleccionados].sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id))
    : seleccionados;
  const vistos = new Set<string>();
  const restantes = pedidos.filter(p => {
    if (vistos.has(p.id) || ids.has(p.id) || !esVisitaPendienteCercania(p, hoyBogota)) return false;
    vistos.add(p.id);
    return true;
  });

  function alternar(p: Pedido) {
    if (ocupada.current) return;
    if (!ids.has(p.id) && !esVisitaPendienteCercania(p, hoyBogota)) return;
    if (!ids.has(p.id) && seleccionados.length >= 25) {
      setError("Puedes seleccionar hasta 25 pedidos por cálculo; ninguno será omitido.");
      return;
    }
    envio.current += 1;
    focoTrasMover.current = p.id;
    const estabaMarcado = ids.has(p.id);
    setElegidos(anterior => estabaMarcado
      ? anterior.filter(x => x.id !== p.id)
      : [...anterior.filter(x => x.id !== p.id), p]);
    setOrden([]);
    setProveedor("");
    setFase(fase === "calculado" || fase === "desactualizado" ? "desactualizado" : "listo");
    setError(null);
  }

  async function calcular() {
    if (!activo || ocupada.current || !seleccionados.length) return;
    ocupada.current = true;
    const version = ++envio.current;
    const pedidoIds = seleccionados.map(p => p.id);
    const firmaInicio = firmaGestion;
    setFirmaSolicitud(firmaInicio);
    setError(null);
    setFase("gps");
    try {
      if (!navigator.onLine) throw new Error("Sin conexión. La selección se conserva.");
      const pos = await ubicacionActual();
      if (version !== envio.current || firmaActual.current !== firmaInicio) {
        setOrden([]);
        setFase("desactualizado");
        return;
      }
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
      if (version !== envio.current || firmaActual.current !== firmaInicio) {
        setOrden([]);
        setFase("desactualizado");
        return;
      }
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
      if (version !== envio.current || firmaActual.current !== firmaInicio) {
        setOrden([]);
        setFase("desactualizado");
        return;
      }
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
          <span className="sr-only" aria-live="polite">{seleccionados.length} pedidos seleccionados</span>
          <span className="rounded-full bg-white px-2 py-1 text-xs text-blue-900" aria-live="polite">
            {faseVisible === "calculado" ? "Orden sugerido" : faseVisible === "desactualizado" ? "Desactualizado" : "Sin calcular"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm text-blue-950" aria-live="polite"
          data-testid="cercania-resumen-carga">
          <span className="rounded-lg border border-blue-200 bg-white px-3 py-2 font-semibold"
            data-testid="cercania-total-pedidos">
            {carga.pedidos} {carga.pedidos === 1 ? "pedido" : "pedidos"}
          </span>
          <span className="rounded-lg border border-blue-200 bg-white px-3 py-2 font-semibold"
            data-testid="cercania-total-productos">
            {carga.pedidosSinDesglose ? "Al menos " : ""}{carga.unidades} {carga.unidades === 1 ? "unidad" : "unidades"} por llevar
          </span>
        </div>
        {carga.porProducto.length > 0 && (
          <p className="mt-2 text-xs text-blue-900" data-testid="cercania-desglose-productos">
            {carga.porProducto.map(x => `${x.unidades} ${nombreProducto(x.producto, x.unidades)}`).join(" · ")}
          </p>
        )}
        {carga.pedidosSinDesglose > 0 && (
          <p className="mt-2 text-xs font-medium text-amber-900" role="status">
            {carga.pedidosSinDesglose} {carga.pedidosSinDesglose === 1 ? "pedido requiere" : "pedidos requieren"} verificar cantidades antes de preparar la carga.
          </p>
        )}
        <p className="mt-2 text-xs text-blue-900">
          {faseVisible === "calculado" ? "Paradas numeradas por el proveedor vial." :
            "Los pedidos elegidos suben aquí; su orden inicial no es un recorrido optimizado."}
        </p>
        {ordenados.length ? <div className="mt-3 rounded-lg bg-white p-2 sm:p-3">
          <OperacionConsulta pedidos={ordenados} viewport={viewport} hoyBogota={hoyBogota}
            onAccion={onAccion} onOpen={onOpen} acciones={acciones}
            seleccion={{
              marcado: true,
              onAlternar: alternar,
              ordenIds: faseVisible === "calculado" ? orden : undefined,
              fueraDePaginaIds: new Set(seleccionados.filter(p => !encontrados.has(p.id)).map(p => p.id)),
            }}
          />
        </div> : <p className="mt-3 rounded-lg border border-dashed border-blue-300 p-3 text-sm">
          Marca uno o varios pedidos de la lista inferior.
        </p>}
        <p className="mt-3 text-xs text-blue-900">📍 Origen: GPS actual de este dispositivo, obtenido al calcular.</p>
        <button type="button" data-testid="cercania-calcular" disabled={espera || !seleccionados.length}
          onClick={() => void calcular()}
          className="mt-2 min-h-11 w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
          {fase === "gps" ? "Obteniendo GPS…" : fase === "calculando" ? "Calculando…" :
            faseVisible === "desactualizado" ? "Actualizar recorrido" :
            faseVisible === "calculado" ? "Volver a calcular" : `Calcular recorrido (${seleccionados.length})`}
        </button>
        {faseVisible === "desactualizado" && <p className="mt-2 text-sm text-amber-900" role="status">
          La selección cambió o se modificó un pedido; el orden anterior ya no es válido.</p>}
        {error && <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900" role="alert">{error}</p>}
        {faseVisible === "calculado" && <p className="mt-2 text-xs text-blue-900" role="status">
          ✓ Recorrido sugerido {proveedor === "HEIGIT_VROOM" ? "(HeiGIT / OpenStreetMap)" :
            proveedor === "GOOGLE_ROUTE_OPTIMIZATION" ? "(Google)" : ""}. No crea embarques.
          {proveedor === "HEIGIT_VROOM" && <span> · Datos © <a href="https://www.openstreetmap.org/copyright"
            target="_blank" rel="noopener noreferrer" className="underline">Colaboradores de OpenStreetMap</a></span>}</p>}
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4">
        <h2 className="font-bold text-slate-800">Otros pedidos ({restantes.length} visibles)</h2>
        <p className="mt-1 text-xs text-slate-500">Puedes seguir buscando y filtrando; los seleccionados permanecen arriba.</p>
        {restantes.length ? <OperacionList pedidos={restantes} viewport={viewport}
          hoyBogota={hoyBogota} onAccion={onAccion} onOpen={onOpen} consulta={acciones}
          modoRecorridoExterno={false}
          seleccion={{ marcado: false, onAlternar: alternar }} /> :
          <p className="py-4 text-sm text-slate-500">No hay más pedidos con estos filtros.</p>}
      </div>
    </section>
  );
}
