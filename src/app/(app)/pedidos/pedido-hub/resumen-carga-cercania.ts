/**
 * #930: resumen físico de la selección de Cercanía.
 *
 * No es inventario, manifiesto ni comprobante de embarque: representa las
 * unidades TODAVÍA pendientes de llevar a las visitas elegidas.
 * La fuente moderna usa la misma regla física que el backend vial (#859):
 * remanentesPorProducto, que respeta regalos y entregas parciales.
 */
import { remanentesPorProducto } from "@/lib/barrios/remanentes-barrio";
import { itemsConsulta } from "./consulta-datos";
import type { Pedido } from "./types";

export interface ResumenCargaCercania {
  pedidos: number;
  unidades: number;
  porProducto: Array<{ producto: string; unidades: number }>;
  /** No presentar la cifra como definitiva si algún domicilio carece de desglose fiable. */
  pedidosSinDesglose: number;
}

function cantidadesPendientes(p: Pedido): Record<string, number> | null {
  // Solo se suma lo que físicamente debe llevarse. Un cobro de fiado no es carga.
  if (p.canal !== "DOMICILIO" || p.estadoEntrega === "ENTREGADO" ||
    ["CANCELADO", "ANULADO"].includes(p.estadoEntrega)) return {};

  try {
    if (p.items?.length) return remanentesPorProducto(p.items);

    // Pedidos anteriores sin líneas modernas usan las mismas columnas legacy
    // que ya presenta PedidoHub; nunca sumar las columnas legacy junto con items.
    const legacy = itemsConsulta(p);
    if (!legacy.length) return null;
    const resultado: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const item of legacy) {
      if (!Number.isSafeInteger(item.pedidas) || !Number.isSafeInteger(item.entregadas) ||
        item.pedidas < 0 || item.entregadas < 0) return null;
      const faltan = Math.max(0, item.pedidas - item.entregadas);
      if (faltan > 0) resultado[item.producto] = (resultado[item.producto] ?? 0) + faltan;
    }
    return resultado;
  } catch {
    // Datos físicos incompletos o inconciliables: nunca inventar carga.
    return null;
  }
}

export function resumirCargaCercania(seleccionados: readonly Pedido[]): ResumenCargaCercania {
  const totales: Record<string, number> = Object.create(null) as Record<string, number>;
  let pedidosSinDesglose = 0;
  for (const pedido of seleccionados) {
    const cantidades = cantidadesPendientes(pedido);
    if (cantidades === null) {
      pedidosSinDesglose += 1;
      continue;
    }
    for (const [producto, unidades] of Object.entries(cantidades)) {
      totales[producto] = (totales[producto] ?? 0) + unidades;
    }
  }
  const porProducto = Object.entries(totales)
    .map(([producto, unidades]) => ({ producto, unidades }))
    .sort((a, b) => a.producto.localeCompare(b.producto, "es"));
  return {
    pedidos: seleccionados.length,
    unidades: porProducto.reduce((sum, x) => sum + x.unidades, 0),
    porProducto,
    pedidosSinDesglose,
  };
}
