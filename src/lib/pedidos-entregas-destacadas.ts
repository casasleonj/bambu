import type { Prisma } from "@prisma/client";
import { leerEntregasConsulta } from "./entregas-consulta";
import {
  proyectarEntregaHistorial,
  esVentaRapidaCompletaDelDiaSinHitos,
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
  repartidores: string[] = [],
  clasificarParcialHistorica = false,
): Promise<{ destacadas: EntregaDestacada[]; destacadasTotal: number; rangoAmplio: boolean }> {
  if (+rango.hasta - +rango.desde > MAX_RANGO_MS) {
    return { destacadas: [], destacadasTotal: 0, rangoAmplio: true };
  }
  const hechosRango = await leerEntregasConsulta(tx, { rango });
  const eventosVisibles = hechosRango.filter((e) =>
    !repartidores.length || (!!e.repartidorId && repartidores.includes(e.repartidorId)));
  const idsVisibles = new Set(eventosVisibles.map((e) => e.id));
  const ids = [...new Set(eventosVisibles.map((e) => e.pedidoId))];
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
      origen: true,
      estadoEntrega: true,
      entregadoAt: true,
      cliente: { select: { nombre: true, apellido: true } },
      negocio: { select: { nombre: true } },
      items: { select: { producto: true, cantPedido: true, cantEntrega: true, cantRegaloPedido: true, cantRegaloEntrega: true } },
      cPacaAguaPed: true,
      cPacaAguaEnt: true,
      cPacaHieloPed: true,
      cPacaHieloEnt: true,
      cBotellonFabPed: true,
      cBotellonFabEnt: true,
      cBotellonDomPed: true,
      cBotellonDomEnt: true,
      cBolsaAguaPed: true,
      cBolsaAguaEnt: true,
      cBolsaHieloPed: true,
      cBolsaHieloEnt: true,
    },
  });
  if (!pedidos.length) return { destacadas: [], destacadasTotal: 0, rangoAmplio: false };
  const pedidosIds = pedidos.map((p) => p.id);
  const [historial, ajustes, reducciones] = await Promise.all([
    leerEntregasConsulta(tx, { ids: pedidosIds }),
    tx.pedidoCantidadAjuste.findMany({
      where: { pedidoId: { in: pedidosIds }, createdAt: { gte: rango.hasta } },
      select: { pedidoId: true },
    }),
    tx.pedidoReduccionComercial.findMany({
      where: { pedidoId: { in: pedidosIds }, estado: "APLICADA" },
      select: { pedidoId: true, resueltoAt: true },
    }),
  ]);
  const ajustesPosteriores = new Set(ajustes.map((a) => a.pedidoId));
  const reduccionesPorPedido = new Map<string, typeof reducciones>();
  for (const reduccion of reducciones) {
    const previas = reduccionesPorPedido.get(reduccion.pedidoId) ?? [];
    reduccionesPorPedido.set(reduccion.pedidoId, [...previas, reduccion]);
  }
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
      ? p.items.map((i) => ({ producto: i.producto, cantidad: i.cantPedido + (i.cantRegaloPedido ?? 0) }))
      : [
          { producto: "PACA_AGUA", cantidad: p.cPacaAguaPed },
          { producto: "PACA_HIELO", cantidad: p.cPacaHieloPed },
          { producto: "BOTELLON", cantidad: p.cBotellonFabPed + p.cBotellonDomPed },
          { producto: "BOLSA_AGUA", cantidad: p.cBolsaAguaPed },
          { producto: "BOLSA_HIELO", cantidad: p.cBolsaHieloPed },
        ].filter((l) => l.cantidad > 0);
    const entregadas: CantidadEntrega[] = p.items.length
      ? p.items.map((i) => ({ producto: i.producto, cantidad: i.cantEntrega + (i.cantRegaloEntrega ?? 0) }))
      : [
          { producto: "PACA_AGUA", cantidad: p.cPacaAguaEnt },
          { producto: "PACA_HIELO", cantidad: p.cPacaHieloEnt },
          { producto: "BOTELLON", cantidad: p.cBotellonFabEnt + p.cBotellonDomEnt },
          { producto: "BOLSA_AGUA", cantidad: p.cBolsaAguaEnt },
          { producto: "BOLSA_HIELO", cantidad: p.cBolsaHieloEnt },
        ].filter((l) => l.cantidad > 0);
    const hechosPedido = hechosPorPedido.get(p.id) ?? [];
    const primerHecho = hechosPedido.reduce<(typeof hechosPedido)[number] | null>(
      (primero, hecho) => !primero || hecho.fecha < primero.fecha ? hecho : primero,
      null,
    );
    // #911: una reducción ANTERIOR a la primera entrega física verificada
    // ya forma parte de la obligación final; no es un ajuste posterior.
    // Si ocurre después de una entrega (aun el mismo día), no tiene fecha
    // o solo hay evidencia imprecisa, conservar la advertencia: reducir la
    // obligación NO demuestra que se haya completado físicamente.
    const reduccionIncierta = (reduccionesPorPedido.get(p.id) ?? []).some((r) =>
      !r.resueltoAt ||
      !primerHecho ||
      primerHecho.fuente === "HISTORICO" ||
      !!primerHecho.precisionDia ||
      !!primerHecho.incompleto ||
      !primerHecho.cantidades?.length ||
      r.resueltoAt.getTime() >= primerHecho.fecha.getTime(),
    );
    const ajusteIncierto = ajustesPosteriores.has(p.id) || reduccionIncierta;
    const vista = proyectarEntregaHistorial(
      {
        id: p.id,
        numero: p.numero,
        nombre: p.negocio?.nombre ?? [p.cliente.nombre, p.cliente.apellido].filter(Boolean).join(" "),
        fecha: p.fecha,
        solicitadas: pedidas,
        ajustePosterior: ajusteIncierto,
      },
      hechosPedido,
      rango,
      repartidores.length ? idsVisibles : undefined,
    );
    // Las completas creadas y entregadas el mismo día siguen únicamente
    // en la lista normal. Las parciales y las de días anteriores se destacan.
    if (!vista || (!vista.pedidoAnterior && vista.estadoAlCorte === "COMPLETADO")) return [];
    // #786: no confundir ventas rápidas normales con parciales históricas.
    // Conserva los avisos cuando haya cantidades discordantes o hechos adicionales.
    if (esVentaRapidaCompletaDelDiaSinHitos({
      origen: p.origen,
      estadoEntrega: p.estadoEntrega,
      fecha: p.fecha,
      entregadoAt: p.entregadoAt,
      solicitadas: pedidas,
      entregadas,
      tieneAjuste: ajusteIncierto,
    }, hechosPedido, vista)) return [];
    if (clasificarParcialHistorica && vista.estadoAlCorte !== "PARCIAL") return [];
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
