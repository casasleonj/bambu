// Datos de presentación de UN pedido, compartidos por la fila de la consulta (escritorio) y la hoja de
// detalle (móvil/peek) para que digan exactamente lo mismo (#538). Funciones puras, sin React.
import { getItemsFromPedido } from "../pedido-items";
import type { Pedido, OperacionDerivada } from "./types";
import { fechaConsulta } from "./fecha-consulta";

export interface ItemConsulta {
  producto: string;
  pedidas: number;
  entregadas: number;
}

export type TonoConsulta = "green" | "amber" | "gray" | "red";

/** Clases de color de cada tono (mismas etiquetas en la fila y en la hoja de detalle). */
export const TONOS_CLASE: Record<TonoConsulta, string> = {
  green: "bg-emerald-50 text-emerald-800",
  amber: "bg-amber-100 text-amber-900",
  gray: "bg-stone-100 text-stone-700",
  red: "bg-red-50 text-red-800",
};

export function esTerminal(p: Pedido): boolean {
  return ["CANCELADO", "ANULADO"].includes(p.estadoEntrega);
}

/** Entrega a medias: algo ya salió pero el pedido no está ENTREGADO. */
export function esParcial(p: Pedido): boolean {
  return (
    p.estadoEntrega !== "ENTREGADO" &&
    (p.items.some((i) => i.cantEntrega > 0) ||
      [
        p.cPacaAguaEnt,
        p.cPacaHieloEnt,
        p.cBotellonFabEnt,
        p.cBotellonDomEnt,
        p.cBolsaAguaEnt,
        p.cBolsaHieloEnt,
      ].some((n) => n > 0))
  );
}

export function itemsConsulta(p: Pedido): ItemConsulta[] {
  const lista = p.items.length
    ? p.items.map((i) => ({
        producto: i.producto,
        pedidas: i.cantPedido,
        entregadas: i.cantEntrega,
      }))
    : getItemsFromPedido(p).map((i) => ({
        producto: i.producto,
        pedidas: i.cantPedido,
        entregadas:
          (
            {
              PACA_AGUA: p.cPacaAguaEnt,
              PACA_HIELO: p.cPacaHieloEnt,
              BOTELLON: (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0),
              BOLSA_AGUA: p.cBolsaAguaEnt,
              BOLSA_HIELO: p.cBolsaHieloEnt,
            } as Record<string, number>
          )[i.producto] ?? 0,
      }));
  return lista.filter((i) => i.pedidas > 0 || i.entregadas > 0);
}

/** «10 pedidas · por entregar», «6 pedidas · 4 entregadas · 2 por entregar», «pedido anulado»… */
export function lineaProducto(i: ItemConsulta, p: Pedido): string {
  const terminal = esTerminal(p);
  return `${i.pedidas} pedidas${
    terminal
      ? ` · pedido ${p.estadoEntrega === "ANULADO" ? "anulado" : "cancelado"}`
      : i.entregadas > i.pedidas
        ? ` · ${i.entregadas} entregadas · cantidades por conciliar`
        : i.entregadas === i.pedidas
          ? " y entregadas"
          : i.entregadas > 0
            ? ` · ${i.entregadas} entregadas · ${Math.max(0, i.pedidas - i.entregadas)} por entregar`
            : " · por entregar"
  }`;
}

export function pagoLabel(p: Pedido): string {
  return Number(p.saldo) === 0
    ? "Pago registrado"
    : Number(p.totalPagado) > 0
      ? "Pago parcial"
      : "Sin pago registrado";
}

export interface PillConsulta {
  key: string;
  label: string;
  tono: TonoConsulta;
}

/** Etiquetas de estado y pago, con el mismo texto y tono que la fila de la consulta. */
export function pillsEstado(p: Pedido, derivada: OperacionDerivada): PillConsulta[] {
  const terminal = esTerminal(p);
  const saldo = Number(p.saldo);
  const entrega: PillConsulta = {
    key: "entrega",
    tono: terminal ? "gray" : p.estadoEntrega === "ENTREGADO" ? "green" : "amber",
    label: terminal
      ? derivada.estadoLegible
      : p.estadoEntrega === "ENTREGADO"
        ? "✓ Entregado"
        : esParcial(p)
          ? "◐ Entrega parcial"
          : p.estadoEntrega === "EN_RUTA"
            ? "🚚 En ruta"
            : p.embarqueId
              ? "◷ Asignado · por entregar"
              : "◷ Por entregar",
  };
  const pago: PillConsulta = {
    key: "pago",
    tono: terminal ? "gray" : saldo === 0 ? "green" : "amber",
    label: terminal ? "Anulado" : pagoLabel(p),
  };
  const pills = [entrega, pago];
  if (!terminal && p.estadoEntrega === "ENTREGADO" && saldo > 0)
    pills.push({ key: "fiado", label: "Fiado", tono: "amber" });
  if (!terminal && p.pagoDiscrepante)
    pills.push({ key: "discrepante", label: "Pago discrepante", tono: "red" });
  if (!terminal && p.pagoReportadoPendiente)
    pills.push({ key: "por-confirmar", label: "Pago por confirmar", tono: "amber" });
  return pills;
}

export interface ResponsablesConsulta {
  creacion: { titulo: string; meta: string };
  entrega: { titulo: string; meta: string };
}

/** «✍️ Creado por …» y «🚚 Entregó …» con sus horas (Bogotá). */
export function responsablesConsulta(p: Pedido, hoyBogota: string): ResponsablesConsulta {
  const repartidores = p.responsablesEntrega ?? [];
  const entregaMeta = p.entregadoAt
    ? p.entregaHoraVerificable === false
      ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short" }).format(
          new Date(p.entregadoAt),
        ) + " · hora sin verificar"
      : fechaConsulta(p.entregadoAt, hoyBogota)
    : p.entregasSinDetalle
      ? "Fecha y responsable sin registrar."
      : "El responsable se registra al entregar.";
  return {
    creacion: {
      titulo: p.creadoPor ? `✍️ Creado por ${p.creadoPor}` : "✍️ Creador sin registrar",
      meta: p.createdAt ? fechaConsulta(p.createdAt, hoyBogota) : "Hora de creación no disponible",
    },
    entrega: {
      titulo: repartidores.length
        ? `🚚 ${esParcial(p) ? "Responsable" : "Entregó"} ${repartidores.map((r) => r.nombre).join(" y ")}`
        : p.entregadoAt
          ? "📦 Entrega registrada"
          : "🕓 Sin entrega registrada",
      meta: entregaMeta,
    },
  };
}
