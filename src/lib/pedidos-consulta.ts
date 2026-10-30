import { getTodayString, parseDateParam } from "./dates";
import { normalizeCanalFilter } from "./pedido-canal";
import type { CobrosPeriodo } from "./cobros-periodo";
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
  cobros: Omit<CobrosPeriodo, "movimientos"> | null;
}
export interface ResultadoConsultaPedidos {
  consultaKey: string;
  pedidos: Pedido[];
  total: number;
  page: number;
  pageSize: number;
  leidoAt: string;
  resumen: ResumenConsultaPedidos | null;
  repartidores: Array<{ id: string; nombre: string; activo: boolean }>;
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
    | "entregaParcial";
  conRecurrencia: boolean;
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
      ],
      "",
    ),
    conRecurrencia: p.get("conRecurrencia") === "true",
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
  p.set("resumen", f.resumen ? "1" : "0");
  p.set("page", String(f.page));
  p.set("pageSize", String(f.pageSize));
  return p;
}
