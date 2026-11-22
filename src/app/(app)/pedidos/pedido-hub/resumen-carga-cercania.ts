/**
 * #930: resumen físico de la selección de Cercanía.
 *
 * No es inventario, manifiesto ni comprobante de embarque: representa las
 * unidades TODAVÍA pendientes de llevar a las visitas elegidas.
 * La fuente moderna usa la misma regla física que el backend vial (#859):
 * remanentesPorProducto, que respeta regalos y entregas parciales.
 */
import { remanentesPorProducto } from "@/lib/barrios/remanentes-barrio";
import { diaEntregaBogota } from "@/lib/pedidos-entregas-historial";
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

    // Compatibilidad física con clasificarGestionVial() del backend #930:
    // restar CADA subproducto legacy antes de agregar por tipo. En especial,
    // no compensar un botellón FAB sobreentregado con otro DOM pendiente.
    const legacy = [
      { producto: "PACA_AGUA", cantPedido: p.cPacaAguaPed, cantEntrega: p.cPacaAguaEnt },
      { producto: "PACA_HIELO", cantPedido: p.cPacaHieloPed, cantEntrega: p.cPacaHieloEnt },
      { producto: "BOTELLON", cantPedido: p.cBotellonFabPed, cantEntrega: p.cBotellonFabEnt },
      { producto: "BOTELLON", cantPedido: p.cBotellonDomPed, cantEntrega: p.cBotellonDomEnt },
      { producto: "BOLSA_AGUA", cantPedido: p.cBolsaAguaPed, cantEntrega: p.cBolsaAguaEnt },
      { producto: "BOLSA_HIELO", cantPedido: p.cBolsaHieloPed, cantEntrega: p.cBolsaHieloEnt },
    ];
    if (legacy.some(i => !Number.isSafeInteger(i.cantPedido) ||
      !Number.isSafeInteger(i.cantEntrega) || i.cantPedido < 0 || i.cantEntrega < 0)) return null;
    if (!legacy.some(i => i.cantPedido > 0 || i.cantEntrega > 0)) return null;
    return remanentesPorProducto(legacy);
  } catch {
    // Datos físicos incompletos o inconciliables: nunca inventar carga.
    return null;
  }
}

/** Cercanía organiza reparto físico, NO pedidos entregados que solo deben dinero.
 * Si el desglose es desconocido, conservar la fila para revisión en vez de
 * inventar una entrega completa. El servidor valida de nuevo al calcular. */
export function esVisitaPendienteCercania(p: Pedido, hoyBogota?: string): boolean {
  if (p.canal !== "DOMICILIO" || p.embarqueId ||
      ["ENTREGADO", "CANCELADO", "ANULADO"].includes(p.estadoEntrega)) return false;
  // #930: la visita ya asignada y la promesa de mañana no pertenecen a la
  // salida actual. El backend mantiene el filtro definitivo al calcular.
  if (hoyBogota && p.fechaEntrega) {
    const fecha = new Date(p.fechaEntrega);
    if (Number.isFinite(fecha.getTime()) && diaEntregaBogota(fecha) > hoyBogota)
      return false;
  }
  const pendientes = cantidadesPendientes(p);
  return pendientes === null || Object.values(pendientes).some(cantidad => cantidad > 0);
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
