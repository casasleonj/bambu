import type { Prisma } from "@prisma/client";
import { leerEntregasConsulta } from "./entregas-consulta";
import {
  proyectarEntregaHistorial,
  type CantidadEntrega,
  type EntregaDestacada,
} from "./pedidos-entregas-historial";

const MAX_EN_LISTA = 12;
const MAX_RANGO_MS = 32 * 86400000;

/**
 * #763 · Vista complementaria de actividad física por fecha, sin alterar
 * la consulta de pedidos por creación ni sus totales comerciales.
 * Usa exactamente los lectores de eventos existentes, en una única transacción.
 */
export async function listarEntregasDestacadas(
  tx: Prisma.TransactionClient,
  whereSinFechaPedido: Prisma.PedidoWhereInput,
  rango: { desde: Date; hasta: Date },
): Promise<{ destacadas: EntregaDestacada[]; destacadasTotal: number; rangoAmplio: boolean }> {
  if (+rango.hasta - +rango.desde > MAX_RANGO_MS) {
    return { destacadas: [], destacadasTotal: 0, rangoAmplio: true };
  }
  const hechosRango = await leerEntregasConsulta(tx, { rango });
  const ids = [...new Set(hechosRango.map((e) => e.pedidoId))];
  if (!ids.length) return { destacadas: [], destacadasTotal: 0, rangoAmplio: false };
  const pedidos = await tx.pedido.findMany({
    where: {
      AND: [
        whereSinFechaPedido,
        { id: { in: ids }, estadoEntrega: { notIn: ["ANULADO", "CANCELADO"] } },
      ],
    },
    select: {
      id: true,
      numero: true,
      fecha: true,
      cliente: { select: { nombre: true, apellido: true } },
      negocio: { select: { nombre: true } },
      items: { select: { producto: true, cantPedido: true } },
      cPacaAguaPed: true,
      cPacaHieloPed: true,
      cBotellonFabPed: true,
      cBotellonDomPed: true,
      cBolsaAguaPed: true,
      cBolsaHieloPed: true,
    },
  });
  if (!pedidos.length) return { destacadas: [], destacadasTotal: 0, rangoAmplio: false };
  const pedidosIds = pedidos.map((p) => p.id);
  const [historial, ajustes] = await Promise.all([
    leerEntregasConsulta(tx, { ids: pedidosIds }),
    tx.pedidoCantidadAjuste.findMany({
      where: { pedidoId: { in: pedidosIds }, createdAt: { gte: rango.hasta } },
      select: { pedidoId: true },
    }),
  ]);
  const ajustados = new Set(ajustes.map((a) => a.pedidoId));
  const hechosPorPedido = new Map<string, typeof historial>();
  const ultimoEnRango = new Map<string, number>();
  for (const e of historial) {
    hechosPorPedido.set(e.pedidoId, [...(hechosPorPedido.get(e.pedidoId) ?? []), e]);
    if (e.fecha >= rango.desde && e.fecha < rango.hasta) {
      ultimoEnRango.set(e.pedidoId, Math.max(ultimoEnRango.get(e.pedidoId) ?? 0, +e.fecha));
    }
  }
  const vistas = pedidos.flatMap((p) => {
    const pedidas: CantidadEntrega[] = p.items.length
      ? p.items.map((i) => ({ producto: i.producto, cantidad: i.cantPedido }))
      : [
          { producto: "PACA_AGUA", cantidad: p.cPacaAguaPed },
          { producto: "PACA_HIELO", cantidad: p.cPacaHieloPed },
          { producto: "BOTELLON", cantidad: p.cBotellonFabPed + p.cBotellonDomPed },
          { producto: "BOLSA_AGUA", cantidad: p.cBolsaAguaPed },
          { producto: "BOLSA_HIELO", cantidad: p.cBolsaHieloPed },
        ].filter((l) => l.cantidad > 0);
    const vista = proyectarEntregaHistorial(
      {
        id: p.id,
        numero: p.numero,
        nombre: p.negocio?.nombre ?? [p.cliente.nombre, p.cliente.apellido].filter(Boolean).join(" "),
        fecha: p.fecha,
        solicitadas: pedidas,
        ajustePosterior: ajustados.has(p.id),
      },
      hechosPorPedido.get(p.id) ?? [],
      rango,
    );
    // Las completas creadas y entregadas el mismo día siguen únicamente
    // en la lista normal. Las parciales y las de días anteriores se destacan.
    if (!vista || (!vista.pedidoAnterior && vista.estadoAlCorte === "COMPLETADO")) return [];
    return [vista];
  });
  vistas.sort((a, b) =>
    (ultimoEnRango.get(b.pedidoId) ?? 0) - (ultimoEnRango.get(a.pedidoId) ?? 0)
    || b.numero - a.numero,
  );
  return {
    destacadas: vistas.slice(0, MAX_EN_LISTA),
    destacadasTotal: vistas.length,
    rangoAmplio: false,
  };
}