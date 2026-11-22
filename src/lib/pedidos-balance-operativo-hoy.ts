// #853 Fase 1: balance operativo de HOY por producto y por origen. Solo cálculo, sin UI.
//
// Se distinguen stocks y flujos:
//   Por gestionar = pendiente al INICIO del día (pedidos de hoy: su demanda completa).
//   Entregadas hoy = delta físico del día (misma fuente canónica que Dashboard y Cierre).
//   Faltan = Por gestionar − Entregadas hoy.
// El grupo de un pedido anterior se fija al corte inicial y no cambia aunque hoy se complete.
// Lo que no se puede reconstruir con evidencia queda «por conciliar»; nunca se infiere desde
// el estado actual como si fuera histórico.
import type { RangoDia } from "./unidades-entregadas-dia";

export const GRUPOS_BALANCE = ["pedidosHoy", "pendientesAnteriores", "parcialesAnteriores"] as const;
export type GrupoBalance = (typeof GRUPOS_BALANCE)[number];

export interface CantidadesBalance {
  porGestionar: number;
  entregadasHoy: number;
  faltan: number;
}
export interface ProductoBalance {
  producto: string;
  grupos: Record<GrupoBalance, CantidadesBalance>;
  total: CantidadesBalance;
}
export interface BalanceOperativoHoy {
  productos: ProductoBalance[];
  /** Pedidos distintos por grupo (una identidad por pedido, sin importar cuántos productos o entregas tenga). */
  pedidosUnicos: Record<GrupoBalance, number> & { total: number };
  porConciliar: {
    /** Pedidos anteriores con entregas sin desglose por día fiable: no se puede fijar su pendiente inicial. */
    pedidosSinDesglose: number;
    /** Pedidos cuyas cantidades no cuadran (entregado mayor que pedido, o negativo tras devolución). */
    pedidosInconsistentes: number;
    /** Pedidos anteriores anulados o cancelados hoy: pudieron estar pendientes al inicio; sus unidades no se reconstruyen. */
    anuladosAnterioresHoy: number;
  };
}

export interface PedidoBalanceEntrada {
  id: string;
  fecha: Date;
  /** Demanda física actual por producto (pedida + regalo). */
  demanda: Readonly<Record<string, number>>;
  /** Entregado físico acumulado actual por producto (incluye regalo). */
  entregado: Readonly<Record<string, number>>;
  /** Las entregas del pedido tienen desglose por día confiable (o el pedido no tiene entregas). */
  desgloseConfiable: boolean;
}
export interface EntregaDelDia {
  pedidoId: string;
  producto: string;
  cantidad: number;
}

const vacias = (): CantidadesBalance => ({ porGestionar: 0, entregadasHoy: 0, faltan: 0 });
const entero = (n: number) => Number.isSafeInteger(n) && n >= 0;

export function calcularBalanceOperativoHoy(
  pedidos: readonly PedidoBalanceEntrada[],
  entregasHoy: readonly EntregaDelDia[],
  rango: RangoDia,
  anuladosAnterioresHoy = 0,
): BalanceOperativoHoy {
  const hoyPorPedido = new Map<string, Map<string, number>>();
  for (const e of entregasHoy) {
    if (!entero(e.cantidad)) throw new Error("Cantidad física de entrega no verificable");
    if (e.cantidad === 0) continue;
    const porProducto = hoyPorPedido.get(e.pedidoId) ?? new Map<string, number>();
    porProducto.set(e.producto, (porProducto.get(e.producto) ?? 0) + e.cantidad);
    hoyPorPedido.set(e.pedidoId, porProducto);
  }

  const productos = new Map<string, ProductoBalance>();
  const celda = (producto: string, grupo: GrupoBalance) => {
    const p = productos.get(producto) ?? {
      producto,
      grupos: {
        pedidosHoy: vacias(),
        pendientesAnteriores: vacias(),
        parcialesAnteriores: vacias(),
      },
      total: vacias(),
    };
    productos.set(producto, p);
    return p.grupos[grupo];
  };
  const unicos = { pedidosHoy: 0, pendientesAnteriores: 0, parcialesAnteriores: 0 };
  let sinDesglose = 0;
  let inconsistentes = 0;
  const ya = new Set<string>();

  for (const pedido of pedidos) {
    if (ya.has(pedido.id)) continue; // una sola identidad por pedido
    ya.add(pedido.id);
    if (!Number.isFinite(+pedido.fecha) || pedido.fecha >= rango.hasta) continue; // futuro o sin fecha
    const nuevos = pedido.fecha >= rango.desde;
    const hoy = hoyPorPedido.get(pedido.id) ?? new Map<string, number>();
    const claves = new Set([...Object.keys(pedido.demanda), ...Object.keys(pedido.entregado), ...hoy.keys()]);
    const filas: Array<{ producto: string; inicial: number; hoy: number; previo: number }> = [];
    let valido = true;
    let previoTotal = 0;
    let inicialTotal = 0;
    let hayEntregaAcumulada = false;
    for (const producto of claves) {
      const demanda = pedido.demanda[producto] ?? 0;
      const entregado = pedido.entregado[producto] ?? 0;
      const delDia = hoy.get(producto) ?? 0;
      if (![demanda, entregado, delDia].every(entero)) { valido = false; break; }
      if (entregado > 0) hayEntregaAcumulada = true;
      // Un pedido de hoy empieza el día con toda su demanda y sin entregas previas.
      const previo = nuevos ? 0 : entregado - delDia;
      const inicial = demanda - previo;
      // Entregado mayor que lo pedido, o delta mayor que lo acumulado: no cuadra.
      if (previo < 0 || inicial < 0 || entregado > demanda || (nuevos && delDia !== entregado)) {
        valido = false;
        break;
      }
      previoTotal += previo;
      inicialTotal += inicial;
      filas.push({ producto, inicial, hoy: delDia, previo });
    }
    if (!nuevos && hayEntregaAcumulada && !pedido.desgloseConfiable) {
      sinDesglose += 1;
      continue;
    }
    if (!valido) {
      inconsistentes += 1;
      continue;
    }
    if (inicialTotal <= 0) continue; // ya estaba completo al inicio del día: no es trabajo de hoy
    const grupo: GrupoBalance = nuevos ? "pedidosHoy" : previoTotal === 0 ? "pendientesAnteriores" : "parcialesAnteriores";
    unicos[grupo] += 1;
    for (const f of filas) {
      if (f.inicial === 0 && f.hoy === 0) continue;
      const c = celda(f.producto, grupo);
      c.porGestionar += f.inicial;
      c.entregadasHoy += f.hoy;
      c.faltan += f.inicial - f.hoy;
    }
  }

  const lista = [...productos.values()].sort((a, b) => a.producto.localeCompare(b.producto));
  for (const p of lista) {
    for (const g of GRUPOS_BALANCE) {
      p.total.porGestionar += p.grupos[g].porGestionar;
      p.total.entregadasHoy += p.grupos[g].entregadasHoy;
      p.total.faltan += p.grupos[g].faltan;
    }
  }
  return {
    productos: lista,
    pedidosUnicos: { ...unicos, total: unicos.pedidosHoy + unicos.pendientesAnteriores + unicos.parcialesAnteriores },
    porConciliar: { pedidosSinDesglose: sinDesglose, pedidosInconsistentes: inconsistentes, anuladosAnterioresHoy },
  };
}
