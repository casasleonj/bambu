// #853 Fase 2: texto y filas de «Operación de hoy». Solo presentación: no recalcula nada.
// La regla del PO es que NUNCA se muestre un origen en cero («0 de pedidos anteriores»).
import type {
  BalanceOperativoHoy,
  CantidadesBalance,
  GrupoBalance,
  ProductoBalance,
} from "@/lib/pedidos-balance-operativo-hoy";
import { GRUPOS_BALANCE } from "@/lib/pedidos-balance-operativo-hoy";

/** Une solo las partes con cantidad mayor que cero: «568 de pedidos de hoy · 10 de pedidos anteriores». */
export function lineaOrigen(partes: ReadonlyArray<readonly [number, string]>): string {
  return partes
    .filter(([n]) => n > 0)
    .map(([n, texto]) => `${n} ${texto}`)
    .join(" · ");
}

export const ETIQUETA_GRUPO: Record<GrupoBalance, { corta: string; larga: string; entregadas: string }> = {
  pedidosHoy: { corta: "Hoy", larga: "Pedidos de hoy", entregadas: "de pedidos de hoy" },
  pendientesAnteriores: {
    corta: "Pendientes ant.",
    larga: "Pendientes de días anteriores",
    entregadas: "de pendientes anteriores",
  },
  parcialesAnteriores: {
    corta: "Parciales ant.",
    larga: "Parciales de días anteriores",
    entregadas: "de parciales anteriores",
  },
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export const textoEntregadas = (n: number) => `${n} ${plural(n, "entregada", "entregadas")}`;
export const textoPedidos = (n: number) => `${n} ${plural(n, "pedido", "pedidos")}`;

export interface FilaProductoHoy {
  producto: string;
  entregadas: number;
  /** Demanda del día = por gestionar al inicio + ajustes. */
  porGestionar: number;
  faltan: number;
  /** «2 cancelados o reducidos» / «3 añadidos»; vacío si no hubo ajustes. */
  ajusteTexto: string;
  /** Solo orígenes con entregas; «Aún sin entregas hoy» si no hay ninguna. */
  origen: string;
  hayAjustes: boolean;
  /** Grupos con algo que mostrar en el detalle (nunca una fila toda en ceros). */
  grupos: Array<{ grupo: GrupoBalance; cantidades: CantidadesBalance }>;
  total: CantidadesBalance;
}

const sinActividad = (c: CantidadesBalance) =>
  c.porGestionar === 0 && c.ajustes === 0 && c.entregadasHoy === 0 && c.faltan === 0;

export function filaProductoHoy(p: ProductoBalance): FilaProductoHoy {
  const t = p.total;
  const origen = lineaOrigen(GRUPOS_BALANCE.map((g) => [p.grupos[g].entregadasHoy, ETIQUETA_GRUPO[g].entregadas] as const));
  return {
    producto: p.producto,
    entregadas: t.entregadasHoy,
    porGestionar: t.porGestionar + t.ajustes,
    faltan: t.faltan,
    ajusteTexto:
      t.ajustes < 0 ? `${-t.ajustes} cancelados o reducidos` : t.ajustes > 0 ? `${t.ajustes} añadidos` : "",
    origen: origen || "Aún sin entregas hoy",
    hayAjustes: GRUPOS_BALANCE.some((g) => p.grupos[g].ajustes !== 0),
    grupos: GRUPOS_BALANCE.filter((g) => !sinActividad(p.grupos[g])).map((g) => ({
      grupo: g,
      cantidades: p.grupos[g],
    })),
    total: t,
  };
}

/** Pedidos que el balance no pudo ubicar con evidencia suficiente. */
export const pedidosPorConciliar = (b: BalanceOperativoHoy): number =>
  b.porConciliar.pedidosSinDesglose + b.porConciliar.pedidosInconsistentes + b.porConciliar.edicionesSinCantidades;
