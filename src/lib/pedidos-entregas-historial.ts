/** #763: vista temporal de hechos físicos, sin alterar Pedido ni asignar pagos. */
export interface CantidadEntrega {
  producto: string;
  cantidad: number;
}
export interface PedidoParaHistorial {
  id: string;
  numero: number;
  nombre: string;
  fecha: Date;
  solicitadas: CantidadEntrega[];
  /** Cambios de cantidad posteriores al corte impiden afirmar el estado histórico. */
  ajustePosterior?: boolean;
}
export interface HechoEntregaHistorico {
  id: string;
  fecha: Date;
  cantidades: CantidadEntrega[] | null;
  incompleto?: boolean;
  precisionDia?: boolean;
}
export type EstadoEntregaAlCorte =
  | "PARCIAL"
  | "COMPLETADO_TRAS_PARCIAL"
  | "PRIMERA_ENTREGA"
  | "COMPLETADO"
  | "POR_CONCILIAR";
export interface HitoEntrega {
  fecha: string;
  cantidades: CantidadEntrega[];
  completado: boolean;
  porConciliar: boolean;
}
export interface EntregaDestacada {
  pedidoId: string;
  numero: number;
  nombre: string;
  fechaPedido: string;
  estadoAlCorte: EstadoEntregaAlCorte;
  cantidadesDelRango: CantidadEntrega[];
  cantidadesAlCorte: CantidadEntrega[];
  fechaCompletado: string | null;
  hitos: HitoEntrega[];
  pedidoAnterior: boolean;
}

const zona = "America/Bogota";
export function diaEntregaBogota(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return [valor("year"), valor("month"), valor("day")].join("-");
}
function agregar(destino: Map<string, number>, lineas: CantidadEntrega[]) {
  for (const l of lineas) {
    destino.set(l.producto, (destino.get(l.producto) ?? 0) + l.cantidad);
  }
}
function lineas(destino: Map<string, number>): CantidadEntrega[] {
  return [...destino].filter(([, cantidad]) => cantidad > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([producto, cantidad]) => ({ producto, cantidad }));
}
function comparar(a: Map<string, number>, b: Map<string, number>) {
  return [...b].every(([producto, cantidad]) => cantidad > 0 && (a.get(producto) ?? 0) >= cantidad);
}
/**
 * Estado AL FIN del rango solicitado, distinto del estado actual del pedido.
 * Incluye hitos posteriores como contexto sin incorporarlos en las cantidades
 * del rango. Fechas = hecho físico, no fecha de sincronización o cobro.
 */
export function proyectarEntregaHistorial(
  pedido: PedidoParaHistorial,
  hechos: HechoEntregaHistorico[],
  rango: { desde: Date; hasta: Date },
  idsEventosVisibles?: ReadonlySet<string>,
): EntregaDestacada | null {
  const vistos = new Set<string>();
  const eventos = hechos
    .filter((e) => {
      if (vistos.has(e.id)) return false;
      vistos.add(e.id);
      return Number.isFinite(e.fecha.getTime());
    })
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.id.localeCompare(b.id));
  const enRango = eventos.filter((e) =>
    e.fecha >= rango.desde && e.fecha < rango.hasta &&
    (!idsEventosVisibles || idsEventosVisibles.has(e.id)),
  );
  if (!enRango.length) return null;
  const pedidas = new Map<string, number>();
  agregar(pedidas, pedido.solicitadas);
  const imposible = !pedidas.size || [...pedidas.values()].some((v) => !Number.isSafeInteger(v) || v <= 0);
  const desconocido = eventos.some((e) =>
    e.incompleto || e.cantidades === null ||
    (e.cantidades ?? []).some((c) =>
      !Number.isSafeInteger(c.cantidad) || c.cantidad < 0 || !c.producto,
    ),
  );
  const cantidadDelRango = new Map<string, number>();
  const cantidadAlCorte = new Map<string, number>();
  const acumulado = new Map<string, number>();
  const agrupados = new Map<string, HitoEntrega>();
  let fechaCompletado: string | null = null;
  let eventoPrevioACompletar = false;
  let eventosPrevios = 0;
  for (const e of eventos) {
    const dia = diaEntregaBogota(e.fecha);
    const cantidad = e.cantidades ?? [];
    if (e.fecha >= rango.desde && e.fecha < rango.hasta &&
        (!idsEventosVisibles || idsEventosVisibles.has(e.id))) {
      agregar(cantidadDelRango, cantidad);
    }
    if (e.fecha < rango.hasta) agregar(cantidadAlCorte, cantidad);
    const hito = agrupados.get(dia) ?? {
      fecha: dia, cantidades: [], completado: false, porConciliar: false,
    };
    const porDia = new Map(hito.cantidades.map((l) => [l.producto, l.cantidad]));
    agregar(porDia, cantidad);
    hito.cantidades = lineas(porDia);
    hito.porConciliar ||= !!e.incompleto || !e.cantidades;
    agrupados.set(dia, hito);
    agregar(acumulado, cantidad);
    if (!fechaCompletado && !imposible && !desconocido && comparar(acumulado, pedidas)) {
      fechaCompletado = dia;
      eventoPrevioACompletar = eventosPrevios > 0;
      hito.completado = true;
    }
    eventosPrevios += 1;
  }
  const exceso = [...acumulado].some(([producto, n]) => n > (pedidas.get(producto) ?? 0));
  const dudoso = imposible || desconocido || exceso || !!pedido.ajustePosterior;
  if (dudoso) {
    fechaCompletado = null;
    for (const h of agrupados.values()) h.completado = false;
  }
  const completoAlCorte = !dudoso && comparar(cantidadAlCorte, pedidas);
  const anterior = diaEntregaBogota(pedido.fecha) < diaEntregaBogota(rango.desde);
  let estadoAlCorte: EstadoEntregaAlCorte;
  if (dudoso) estadoAlCorte = "POR_CONCILIAR";
  else if (!completoAlCorte) estadoAlCorte = "PARCIAL";
  else if (eventoPrevioACompletar) estadoAlCorte = "COMPLETADO_TRAS_PARCIAL";
  else if (anterior) estadoAlCorte = "PRIMERA_ENTREGA";
  else estadoAlCorte = "COMPLETADO";
  return {
    pedidoId: pedido.id,
    numero: pedido.numero,
    nombre: pedido.nombre,
    fechaPedido: diaEntregaBogota(pedido.fecha),
    estadoAlCorte,
    cantidadesDelRango: lineas(cantidadDelRango),
    cantidadesAlCorte: lineas(cantidadAlCorte),
    fechaCompletado,
    hitos: [...agrupados.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    pedidoAnterior: anterior,
  };
}