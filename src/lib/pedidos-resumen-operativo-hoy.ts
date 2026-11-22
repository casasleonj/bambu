import type { FiltrosConsultaPedidos } from "./pedidos-consulta";
import type { RangoDia, UnidadEntregadaDetalle } from "./unidades-entregadas-dia";

export interface ProductoOperativoHoy {
  producto: string;
  entregadasHoy: number;
  dePedidosFecha: number;
  dePedidosAnteriores: number;
  porConciliarOrigen: number;
}

export interface ResumenOperativoDia {
  total: number;
  productos: ProductoOperativoHoy[];
}

/**
 * Solo un día completo consultado (actual o histórico) se compara con Dashboard/Cierre.
 * Una búsqueda, selección de barrio, horario o filtro cambia el universo:
 * no se debe presentar el total global como si respetara esos filtros.
 */
export function mostrarResumenOperativoDelDia(f: FiltrosConsultaPedidos, hoy: string): boolean {
  return f.resumen && !f.all && !!f.desde && f.desde === f.hasta && f.desde <= hoy &&
    !f.desdeHora && !f.hastaHora && f.fechaBase === "pedido" &&
    f.registro === "activos" && f.pago === "todos" &&
    !f.search && !f.clienteId && !f.grupoBarrio && !f.foco && !f.conRecurrencia &&
    f.canal.length === 0 && f.origen.length === 0 &&
    f.estadoEntrega.length === 0 && f.estadoPago.length === 0 &&
    f.repartidorId.length === 0;
}

/**
 * Resume los DELTAS físicos del día, no el acumulado actual de cada pedido.
 * Los datos provienen del mismo lector canónico usado por Dashboard y Cierre.
 * Los pedidos anteriores se reconocen por fecha original, sin reescribirla.
 * Las fechas futuras o ausentes no se atribuyen a la fecha consultada.
 */
export function resumirEntregasOperativasDelDia(
  detalles: readonly Pick<UnidadEntregadaDetalle, "pedidoId" | "producto" | "cantidad">[],
  fechaOriginalPorPedido: ReadonlyMap<string, Date>,
  rango: RangoDia,
): ResumenOperativoDia {
  const porProducto = new Map<string, ProductoOperativoHoy>();
  for (const d of detalles) {
    if (!Number.isSafeInteger(d.cantidad) || d.cantidad < 0) {
      throw new Error("Cantidad física de entrega no verificable");
    }
    if (d.cantidad === 0) continue;
    const actual = porProducto.get(d.producto) ?? {
      producto: d.producto,
      entregadasHoy: 0,
      dePedidosFecha: 0,
      dePedidosAnteriores: 0,
      porConciliarOrigen: 0,
    };
    const fecha = fechaOriginalPorPedido.get(d.pedidoId);
    actual.entregadasHoy += d.cantidad;
    if (!fecha || !Number.isFinite(+fecha) || fecha >= rango.hasta) {
      actual.porConciliarOrigen += d.cantidad;
    } else if (fecha < rango.desde) {
      actual.dePedidosAnteriores += d.cantidad;
    } else {
      actual.dePedidosFecha += d.cantidad;
    }
    porProducto.set(d.producto, actual);
  }
  const productos = [...porProducto.values()].sort((a, b) =>
    a.producto.localeCompare(b.producto),
  );
  return {
    total: productos.reduce((n, p) => n + p.entregadasHoy, 0),
    productos,
  };
}
