/**
 * #851 — rótulos de las vistas por fecha prometida («Entrega prevista hoy o atrasada» y
 * «Programados»). Estas vistas ignoran el período de fecha de pedido, así que sus textos no
 * deben hablar de «Pedidos de hoy», «Fecha del pedido» ni de un rango que no se aplica.
 */
import { esFocoCompromiso, type FiltrosConsultaPedidos } from "@/lib/pedidos-consulta";

export interface RotulosCompromiso {
  /** Título de la página y de la lista. */
  titulo: string;
  /** Línea del «Resumen del filtro» en lugar del rango de fechas. */
  rango: string;
  /** Estado vacío cuando la vista no tiene pedidos. */
  vacioTitulo: string;
  vacioDescripcion: string;
}

const PARA_HOY: RotulosCompromiso = {
  titulo: "Entregas previstas hoy o atrasadas",
  rango: "Fecha prometida: hasta hoy (incluye atrasadas)",
  vacioTitulo: "No hay entregas previstas para hoy ni atrasadas",
  vacioDescripcion: "Cuando un pedido abierto tenga fecha prometida de hoy o anterior, aparecerá aquí.",
};

const PROGRAMADOS: RotulosCompromiso = {
  titulo: "Entregas programadas",
  rango: "Fecha prometida: desde mañana",
  vacioTitulo: "No hay entregas programadas para días futuros",
  vacioDescripcion: "Cuando un pedido abierto tenga fecha prometida posterior a hoy, aparecerá aquí.",
};

/** null si el foco no es una vista por fecha prometida (o es un valor desconocido). */
export function rotulosCompromiso(foco: string | null | undefined): RotulosCompromiso | null {
  if (!foco || !esFocoCompromiso(foco as FiltrosConsultaPedidos["foco"])) return null;
  return foco === "paraHoy" ? PARA_HOY : PROGRAMADOS;
}
