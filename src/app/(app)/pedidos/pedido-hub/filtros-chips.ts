import type { FiltrosConsultaPedidos as F } from "@/lib/pedidos-consulta";

/**
 * Reglas puras de los chips de «Pedidos» (#606/#607/#633).
 * Dentro de un grupo de selección múltiple las opciones se combinan con «o»;
 * entre grupos distintos con «y». «Gestión del pedido» (foco) y los estados de
 * entrega son excluyentes entre sí, igual que en la consulta original.
 */
export const CANALES = ["PUNTO", "DOMICILIO"] as const;
export const ESTADOS_ENTREGA = [
  ["PENDIENTE", "Por entregar"],
  ["EN_RUTA", "En ruta"],
  ["NO_ENTREGADO", "No entregado"],
  ["ENTREGADO", "Entregado"],
  ["CANCELADO", "Cancelado"],
  ["ANULADO", "Anulado"],
] as const;
export const FOCOS = [
  ["entregaParcial", "Entrega parcial"],
  ["porPlanificar", "Por planificar · sin embarque"],
  ["enRuta", "Gestión · en ruta"],
  ["esperandoPago", "Esperando pago · entregado"],
  ["pendientesN2", "Con pendiente N2"],
  ["excepciones", "Con excepción o incidencia"],
] as const;
export const PAGOS = [
  ["sin_pago", "Sin pago registrado"],
  ["parcial", "Pago parcial"],
  ["registrado", "Pagado registrado"],
  ["fiado", "Fiado · entregado con saldo"],
] as const;
export const ORIGENES = [
  ["PEDIDO", "Pedido"],
  ["VENTA_RAPIDA", "Venta rápida"],
  ["VENTA_LIBRE", "Venta libre"],
  ["RECURRENTE", "Pedido habitual"],
] as const;
export type FocoConsulta = Exclude<F["foco"], "">;
export type FiltroMoto = "todos" | "con" | "sin";
export interface RepartidorOpcion {
  id: string;
  nombre: string;
  activo: boolean;
  usaMoto: boolean;
}

const alternar = (valores: string[], v: string) =>
  valores.includes(v) ? valores.filter((x) => x !== v) : [...valores, v];

/** Vacío en el contrato = «Punto y domicilio». */
export function canalesVisibles(f: F): string[] {
  return f.canal.length ? f.canal : [...CANALES];
}
export function alternarCanal(f: F, canal: string): F {
  const sig = alternar(canalesVisibles(f), canal);
  // Nunca queda sin canal: quitar el último es no-op; ambos = sin restricción.
  if (sig.length === 0) return f;
  return { ...f, canal: sig.length === CANALES.length ? [] : sig };
}
export function alternarEstadoEntrega(f: F, estado: string): F {
  const sig = alternar(f.estadoEntrega, estado);
  const incluyeInactivo = sig.some((s) => s === "CANCELADO" || s === "ANULADO");
  return {
    ...f,
    estadoEntrega: sig,
    foco: "",
    registro: incluyeInactivo && f.registro === "activos" ? "todos" : f.registro,
  };
}
export function alternarFoco(f: F, foco: FocoConsulta): F {
  return { ...f, foco: f.foco === foco ? "" : foco, estadoEntrega: [] };
}
export function alternarPago(f: F, pago: Exclude<F["pago"], "todos">): F {
  return { ...f, pago: f.pago === pago ? "todos" : pago, estadoPago: [] };
}
/** «Pedido habitual» = origen RECURRENTE; `conRecurrencia` (enlaces antiguos) equivale a lo mismo. */
export function origenesVisibles(f: F): string[] {
  return f.conRecurrencia && !f.origen.includes("RECURRENTE")
    ? [...f.origen, "RECURRENTE"]
    : f.origen;
}
export function alternarOrigen(f: F, origen: string): F {
  const activos = origenesVisibles(f);
  const sig = activos.includes(origen)
    ? activos.filter((o) => o !== origen)
    : [...activos, origen];
  return { ...f, origen: sig, conRecurrencia: false };
}
export function alternarRepartidor(f: F, id: string): F {
  return { ...f, repartidorId: alternar(f.repartidorId, id) };
}
export function elegirRegistro(f: F, registro: F["registro"]): F {
  return {
    ...f,
    registro,
    estadoEntrega:
      registro === "anulados"
        ? []
        : f.estadoEntrega.filter((s) => s !== "ANULADO" && s !== "CANCELADO"),
    foco: registro === "anulados" ? "" : f.foco,
  };
}

/** Lista que ve el usuario en el selector: activos primero; inactivos solo si los pide. */
export function repartidoresVisibles(
  todos: RepartidorOpcion[],
  { moto, inactivos, texto, elegidos }: {
    moto: FiltroMoto;
    inactivos: boolean;
    texto: string;
    elegidos: string[];
  },
): RepartidorOpcion[] {
  const q = texto.trim().toLocaleLowerCase("es");
  return todos
    .filter(
      (r) =>
        (r.activo || inactivos || elegidos.includes(r.id)) &&
        (moto === "todos" || (moto === "con") === r.usaMoto) &&
        (!q || r.nombre.toLocaleLowerCase("es").includes(q)),
    )
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, "es"));
}

export interface FiltroActivo {
  clave: string;
  etiqueta: string;
  quitar: (f: F) => F;
}
const etiqueta = (pares: readonly (readonly [string, string])[], v: string) =>
  pares.find(([k]) => k === v)?.[1] ?? v;

/** Resumen de lo activo fuera del periodo y la búsqueda, cada uno con su «quitar». */
export function filtrosActivos(
  f: F,
  repartidores: RepartidorOpcion[],
): FiltroActivo[] {
  const out: FiltroActivo[] = [];
  if (f.canal.length)
    out.push({
      clave: "canal",
      etiqueta: `Canal: ${f.canal.map((c) => (c === "PUNTO" ? "Punto" : "Domicilio")).join(" o ")}`,
      quitar: (x) => ({ ...x, canal: [] }),
    });
  if (f.estadoEntrega.length)
    out.push({
      clave: "entrega",
      etiqueta: `Entrega: ${f.estadoEntrega.map((s) => etiqueta(ESTADOS_ENTREGA, s)).join(" o ")}`,
      quitar: (x) => ({ ...x, estadoEntrega: [] }),
    });
  if (f.foco)
    out.push({
      clave: "foco",
      etiqueta: etiqueta(FOCOS, f.foco),
      quitar: (x) => ({ ...x, foco: "" }),
    });
  if (f.pago !== "todos")
    out.push({
      clave: "pago",
      etiqueta: `Pago: ${etiqueta(PAGOS, f.pago)}`,
      quitar: (x) => ({ ...x, pago: "todos" }),
    });
  if (f.estadoPago.length)
    out.push({
      clave: "estadoPago",
      etiqueta: `Estado de pago: ${f.estadoPago.join(", ")}`,
      quitar: (x) => ({ ...x, estadoPago: [] }),
    });
  const origenes = origenesVisibles(f);
  if (origenes.length)
    out.push({
      clave: "origen",
      etiqueta: `Origen: ${origenes.map((o) => etiqueta(ORIGENES, o)).join(" o ")}`,
      quitar: (x) => ({ ...x, origen: [], conRecurrencia: false }),
    });
  if (f.repartidorId.length)
    out.push({
      clave: "repartidor",
      etiqueta: `Repartidor: ${f.repartidorId
        .map((id) => repartidores.find((r) => r.id === id)?.nombre ?? "Otro")
        .join(" o ")}`,
      quitar: (x) => ({ ...x, repartidorId: [] }),
    });
  if (f.registro !== "activos")
    out.push({
      clave: "registro",
      etiqueta: `Registro: ${f.registro === "todos" ? "Todos" : "Anulados"}`,
      quitar: (x) => ({ ...x, registro: "activos" }),
    });
  if (f.fechaBase !== "pedido")
    out.push({
      clave: "fechaBase",
      etiqueta: `Fecha de ${({ creacion: "creación", entrega: "entrega", cobro: "cobro", pedido: "pedido" })[f.fechaBase]}`,
      quitar: (x) => ({ ...x, fechaBase: "pedido" }),
    });
  if (f.desdeHora || f.hastaHora)
    out.push({
      clave: "horas",
      etiqueta: `Hora: ${f.desdeHora || "…"}–${f.hastaHora || "…"}`,
      quitar: (x) => ({ ...x, desdeHora: "", hastaHora: "" }),
    });
  if (f.clienteId)
    out.push({
      clave: "cliente",
      etiqueta: "Cliente seleccionado",
      quitar: (x) => ({ ...x, clienteId: "" }),
    });
  return out;
}
