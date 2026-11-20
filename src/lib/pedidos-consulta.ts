import { getTodayString, parseDateParam } from "./dates";
import { normalizeCanalFilter } from "./pedido-canal";
import type { CobrosPeriodo } from "./cobros-periodo";
import type { EntregaDestacada } from "./pedidos-entregas-historial";
import type { Pedido } from "@/app/(app)/pedidos/pedidos-client/types";

export interface ProductoConsulta {
  producto: string;
  pedidas: number;
  entregadas: number;
}
export interface ResumenConsultaPedidos {
  importe: number;
  pagado: number;
  saldo: number;
  fiado: number;
  pendienteEntrega: number;
  productos: ProductoConsulta[];
  entregasPorConciliar: number;
  importesPorConciliar: boolean;
  exigiblesPorConciliar?: number;
  cobros: Omit<CobrosPeriodo, "movimientos"> | null;
}
/** #836 F3: grupo de barrio con el total REAL de la consulta completa (no de la página). */
export interface GrupoBarrioConsulta {
  clave: string;
  etiqueta: string;
  total: number;
  /** Demanda física exigible del barrio, independiente de cobros. */
  remanentes?: Record<string, number>;
  unidadesPendientes?: number;
}
export interface ResultadoConsultaPedidos {
  consultaKey: string;
  pedidos: Pedido[];
  total: number;
  page: number;
  pageSize: number;
  leidoAt: string;
  resumen: ResumenConsultaPedidos | null;
  repartidores: Array<{
    id: string;
    nombre: string;
    activo: boolean;
    /** Atributo propio del trabajador (#633), no derivado de asignaciones ni del rol. */
    usaMoto: boolean;
  }>;
  /** #836 F3: totales por barrio de TODO el conjunto filtrado; solo con `agrupar=barrio`. */
  grupos?: GrupoBarrioConsulta[];
  /** Actividad física destacada, independiente del listado por fecha del pedido. */
  destacadas?: EntregaDestacada[];
  destacadasTotal?: number;
  destacadasRangoAmplio?: boolean;
  /**
   * #797: pendientes de días anteriores a la consulta, más antiguos primero.
   * Es una lectura aparte: no altera `pedidos`, `total`, `resumen` ni la fecha
   * de ningún pedido. Ausente cuando la consulta no incluye hoy.
   */
  arrastrados?: Pedido[];
  arrastradosTotal?: number;
  /** #915: en la vista agrupada los pendientes/parciales de días anteriores ya vienen DENTRO de `pedidos`. */
  arrastradosIntegrados?: boolean;
  /** La lectura de arrastrados falló; la lista principal sigue siendo válida. */
  arrastradosError?: boolean;
}

export type FechaConsulta = "pedido" | "creacion" | "entrega" | "cobro";
export type RegistroConsulta = "activos" | "todos" | "anulados";
export type PagoConsulta =
  "todos" | "sin_pago" | "parcial" | "registrado" | "fiado";
export interface FiltrosConsultaPedidos {
  desde: string;
  hasta: string;
  desdeHora: string;
  hastaHora: string;
  all: boolean;
  fechaBase: FechaConsulta;
  registro: RegistroConsulta;
  canal: string[];
  origen: string[];
  estadoEntrega: string[];
  estadoPago: string[];
  pago: PagoConsulta;
  repartidorId: string[];
  search: string;
  clienteId: string;
  foco:
    | ""
    | "porPlanificar"
    | "enRuta"
    | "esperandoPago"
    | "pendientesN2"
    | "excepciones"
    | "entregaParcial"
    // #836 F1: vista por FECHA PROMETIDA (`Pedido.fechaEntrega`), no por fecha de pedido.
    | "paraHoy" // prevista hoy + atrasada abierta
    | "programados"; // prevista para un día futuro
  conRecurrencia: boolean;
  /** #836 F3: agrupa la lista por barrio efectivo (servidor, conjunto completo). */
  agrupar: "" | "barrio";
  /** #836 F3: solo los pedidos de un grupo de barrio (clave de `grupos`). */
  grupoBarrio: string;
  /** Orden manual temporal, aplicado antes de paginar. */
  recorrido?: string[];
  resumen: boolean;
  page: number;
  pageSize: number;
}
export class FiltroPedidosError extends Error {}
export const clavesConsultaPedidos = [
  "desde",
  "hasta",
  "desdeHora",
  "hastaHora",
  "all",
  "fechaBase",
  "registro",
  "canal",
  "tipo",
  "origen",
  "estadoEntrega",
  "estadoPago",
  "pago",
  "repartidorId",
  "search",
  "clienteId",
  "foco",
  "conRecurrencia",
  "agrupar",
  "grupoBarrio",
  "recorrido",
  "resumen",
  "page",
  "pageSize",
] as const;

function opcion<T extends string>(
  p: URLSearchParams,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = p.get(key);
  if (value === null || value === "") return fallback;
  if (!values.includes(value as T))
    throw new FiltroPedidosError(`El filtro «${key}» no es válido.`);
  return value as T;
}
function lista(
  p: URLSearchParams,
  key: string,
  values?: readonly string[],
): string[] {
  const items = [...new Set(p.getAll(key))];
  if (
    items.length > 20 ||
    items.some((s) => !s || s.length > 100 || (values && !values.includes(s)))
  )
    throw new FiltroPedidosError(`Revisa el filtro «${key}».`);
  return items;
}
/** Clave de grupo: `sin-barrio`, `b:<id>` o `t:<texto normalizado>`; acotada y sin comodines. */
function leerGrupoBarrio(p: URLSearchParams): string {
  const v = p.get("grupoBarrio") || "";
  if (!v) return "";
  if (v.length > 120 || !/^(sin-barrio|venta-anonima|[bt]:[^\u0000-\u001f]+)$/.test(v))
    throw new FiltroPedidosError("Revisa el filtro «grupoBarrio».");
  return v;
}
function pagina(
  p: URLSearchParams,
  key: string,
  fallback: number,
  max: number,
) {
  const raw = p.get(key);
  if (!raw) return fallback;
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) < 1 ||
    Number(raw) > max
  )
    throw new FiltroPedidosError("La página solicitada no es válida.");
  return Number(raw);
}

/** Contrato de consulta compartido por la URL, los controles y el servidor. */
export function leerFiltrosConsulta(
  p: URLSearchParams,
  hoy = getTodayString(),
): FiltrosConsultaPedidos {
  const all = opcion(p, "all", ["true", "false"], "false") === "true";
  for (const k of ["desde", "hasta"]) {
    const value = p.get(k);
    if (value && !parseDateParam(value, ""))
      throw new FiltroPedidosError("La fecha no existe. Usa una fecha válida.");
  }
  const desdeHora = p.get("desdeHora") || "",
    hastaHora = p.get("hastaHora") || "";
  for (const hora of [desdeHora, hastaHora])
    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora))
      throw new FiltroPedidosError(
        "La hora no es válida. Usa horas y minutos.",
      );
  if (all && (desdeHora || hastaHora))
    throw new FiltroPedidosError(
      "Elige las fechas para consultar un horario. Para solo horas, usa Hoy.",
    );
  const desde = all ? "" : p.get("desde") || (p.get("hasta") ? "" : hoy);
  const hasta = all ? "" : p.get("hasta") || (p.get("desde") ? "" : hoy);
  if ((desdeHora && !desde) || (hastaHora && !hasta))
    throw new FiltroPedidosError(
      "Elige las fechas de inicio y final del horario.",
    );
  const estadoEntrega = lista(p, "estadoEntrega", [
    "PENDIENTE",
    "EN_RUTA",
    "NO_ENTREGADO",
    "ENTREGADO",
    "CANCELADO",
    "ANULADO",
  ]);
  let registro = opcion(
    p,
    "registro",
    ["activos", "todos", "anulados"],
    "activos",
  );
  if (
    !p.has("registro") &&
    estadoEntrega.some((s) => s === "CANCELADO" || s === "ANULADO")
  )
    registro = "todos";
  const search = p.get("search")?.trim() || "";
  if (search.length > 120)
    throw new FiltroPedidosError("La búsqueda admite hasta 120 caracteres.");
  const f: FiltrosConsultaPedidos = {
    desde,
    hasta,
    desdeHora,
    hastaHora,
    all,
    fechaBase: opcion(
      p,
      "fechaBase",
      ["pedido", "creacion", "entrega", "cobro"],
      "pedido",
    ),
    registro,
    canal: normalizeCanalFilter([
      ...lista(p, "canal", ["PUNTO", "DOMICILIO"]),
      ...lista(p, "tipo", ["PUNTO", "ENVIO"]),
    ]),
    origen: lista(p, "origen", [
      "PEDIDO",
      "VENTA_RAPIDA",
      "VENTA_LIBRE",
      "RECURRENTE",
    ]),
    estadoEntrega,
    estadoPago: lista(p, "estadoPago", [
      "PENDIENTE",
      "PARCIAL",
      "PAGADO",
      "ANTICIPADO",
      "VENCIDO",
      "ANULADO",
    ]),
    pago: opcion(
      p,
      "pago",
      ["todos", "sin_pago", "parcial", "registrado", "fiado"],
      "todos",
    ),
    repartidorId: lista(p, "repartidorId"),
    search,
    clienteId: p.get("clienteId") || "",
    foco: opcion(
      p,
      "foco",
      [
        "",
        "porPlanificar",
        "enRuta",
        "esperandoPago",
        "pendientesN2",
        "excepciones",
        "entregaParcial",
        "paraHoy",
        "programados",
      ],
      "",
    ),
    conRecurrencia: p.get("conRecurrencia") === "true",
    // #859: solo la entrada operativa sin filtros usa agrupación territorial inicial.
    // Una selección explícita de lista general (agrupar=) y las consultas
    // históricas/filtradas conservan su comportamiento anterior.
    agrupar: p.has("agrupar") && p.get("agrupar") === "" ? "" : opcion(
      p, "agrupar", ["", "barrio"],
      !all && !p.has("desde") && !p.has("hasta") &&
      !["fechaBase", "foco", "search", "estadoEntrega", "estadoPago", "registro", "canal", "origen", "clienteId", "pago", "repartidorId", "grupoBarrio"].some(k => p.has(k))
        ? "barrio" : "",
    ),
    grupoBarrio: leerGrupoBarrio(p),
    recorrido: lista(p, "recorrido").filter(v => /^(sin-barrio|[bt]:[^\u0000-\u001f]+)$/.test(v)),
    resumen: p.has("resumen")
      ? p.get("resumen") === "1"
      : [
          "desde",
          "hasta",
          "desdeHora",
          "hastaHora",
          "search",
          "canal",
          "repartidorId",
          "registro",
          "fechaBase",
          "pago",
          "estadoEntrega",
          "estadoPago",
          "origen",
          "clienteId",
          "all",
          "foco",
          "conRecurrencia",
          "agrupar",
          "grupoBarrio",
        ].some((k) => p.has(k)),
    page: pagina(p, "page", 1, 100000),
    pageSize: pagina(p, "pageSize", 25, 100),
  };
  rangoConsultaPedidos(f);
  return f;
}

/** Bogotá; intervalo continuo. El minuto final completo está incluido. */
export function rangoConsultaPedidos(
  f: Pick<
    FiltrosConsultaPedidos,
    "desde" | "hasta" | "desdeHora" | "hastaHora"
  >,
) {
  const desde = new Date(
    f.desde
      ? `${f.desde}T${f.desdeHora || "00:00"}:00-05:00`
      : "0001-01-01T00:00:00Z",
  );
  const hasta = f.hasta
    ? new Date(
        new Date(`${f.hasta}T${f.hastaHora || "23:59"}:00-05:00`).getTime() +
          60000,
      )
    : new Date("9999-12-31T23:59:59.999Z");
  if (!Number.isFinite(+desde) || !Number.isFinite(+hasta) || desde >= hasta)
    throw new FiltroPedidosError(
      "El final del rango debe ser posterior o igual al inicio.",
    );
  return { desde, hasta };
}

export function parametrosConsulta(f: FiltrosConsultaPedidos): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of [
    "desde",
    "hasta",
    "desdeHora",
    "hastaHora",
    "search",
    "clienteId",
    "foco",
  ] as const)
    if (f[k]) p.set(k, f[k]);
  for (const k of [
    "canal",
    "origen",
    "estadoEntrega",
    "estadoPago",
    "repartidorId",
  ] as const)
    f[k].forEach((v) => p.append(k, v));
  if (f.all) p.set("all", "true");
  p.set("fechaBase", f.fechaBase);
  p.set("registro", f.registro);
  p.set("pago", f.pago);
  if (f.conRecurrencia) p.set("conRecurrencia", "true");
  // Preserve explicit ungrouped selection; absence means operational barrio default.
  p.set("agrupar", f.agrupar);
  if (f.grupoBarrio) p.set("grupoBarrio", f.grupoBarrio);
  // #903: la prioridad manual de barrios (Recorrido) debe viajar al servidor.
  f.recorrido?.forEach((clave) => p.append("recorrido", clave));
  p.set("resumen", f.resumen ? "1" : "0");
  p.set("page", String(f.page));
  p.set("pageSize", String(f.pageSize));
  return p;
}

/**
 * #854: base temporal que realmente rige la consulta. «Entregado» como único estado de
 * entrega, con rango y sin gestión (foco), significa «entregado en ese período», es decir,
 * fecha efectiva de entrega, no «pedido hecho en ese período que hoy está entregado». Es el
 * mismo resultado de elegir «Entrega registrada» (mismos lectores). Con otros estados
 * mezclados, «Creación registrada» o «Cobro registrado», la base elegida se respeta. Es
 * derivada: no se guarda en la URL ni en el borrador, así quitar el chip devuelve la base.
 */
/** #854: «Entregado» es el único estado de entrega elegido. */
export function entregadoComoUnicoEstado(
  f: Pick<FiltrosConsultaPedidos, "estadoEntrega">,
): boolean {
  return f.estadoEntrega.length === 1 && f.estadoEntrega[0] === "ENTREGADO";
}

export function baseEfectiva(
  f: Pick<FiltrosConsultaPedidos, "fechaBase" | "estadoEntrega" | "foco" | "all" | "desde" | "hasta">,
): FechaConsulta {
  if (
    f.fechaBase === "pedido" &&
    !f.all &&
    (f.desde || f.hasta) &&
    f.foco === "" &&
    entregadoComoUnicoEstado(f)
  )
    return "entrega";
  return f.fechaBase;
}

/** #836 F1: focos que consultan por fecha prometida e ignoran el rango de fecha de pedido. */
export function esFocoCompromiso(foco: FiltrosConsultaPedidos["foco"]): foco is "paraHoy" | "programados" {
  return foco === "paraHoy" || foco === "programados";
}

/** #797: estados que cuentan como «pendiente de días anteriores». */
export const ESTADOS_ARRASTRADOS = [
  "PENDIENTE",
  "EN_RUTA",
  "NO_ENTREGADO",
] as const;
export const MAX_ARRASTRADOS = 5;

function diaAnterior(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * #797: filtros de la lectura de pendientes de días anteriores, o `null` si no
 * aplica. Solo con fecha de pedido, un rango que incluye hoy y registros
 * activos. Conserva búsqueda, canal, origen, cliente y pago; ignora horas, que
 * delimitan el día consultado, no los días previos.
 */
/**
 * #915: con la vista agrupada por barrio, los pendientes y parciales de días anteriores se leen en la MISMA
 * consulta que los de hoy (un solo universo, una sola agrupación y paginación) en vez de como sección aparte.
 * No aplica con filtros que se resuelven por ids ajenos al rango (repartidor, fiados, esperando pago).
 */
export function arrastreIntegrado(
  f: FiltrosConsultaPedidos,
  hoy = getTodayString(),
): boolean {
  return (
    f.agrupar === "barrio" &&
    !f.repartidorId.length &&
    f.pago !== "fiado" &&
    f.foco !== "esperandoPago" &&
    !!filtrosArrastrados(f, hoy)
  );
}

export function filtrosArrastrados(
  f: FiltrosConsultaPedidos,
  hoy = getTodayString(),
): FiltrosConsultaPedidos | null {
  if (f.fechaBase !== "pedido" || f.all || !f.desde) return null;
  if (esFocoCompromiso(f.foco)) return null; // #836: la vista por fecha prometida no mezcla arrastrados.
  if (f.registro === "anulados") return null;
  if (f.desde > hoy || (f.hasta && f.hasta < hoy)) return null;
  const estadoEntrega = f.estadoEntrega.length
    ? f.estadoEntrega.filter((e) =>
        (ESTADOS_ARRASTRADOS as readonly string[]).includes(e),
      )
    : [...ESTADOS_ARRASTRADOS];
  if (!estadoEntrega.length) return null;
  return {
    ...f,
    desde: "",
    desdeHora: "",
    hasta: diaAnterior(f.desde),
    hastaHora: "",
    all: false,
    registro: "activos",
    estadoEntrega,
    // #859: conservar el barrio elegido también en los pendientes arrastrados.
    // Eliminarlo mezclaba pedidos antiguos de otros barrios en la vista filtrada.
    agrupar: f.agrupar,
    grupoBarrio: f.grupoBarrio,
    resumen: false,
    page: 1,
    pageSize: MAX_ARRASTRADOS,
  };
}
