// #853 Fase 1: lectura del balance operativo de HOY. Solo lectura: no escribe ni recalcula
// nómina, caja ni inventario. Reutiliza las fuentes canónicas de entregas del día.
import type { Prisma } from "@prisma/client";
import { leerEntregasConsulta } from "./entregas-consulta";
import {
  calcularBalanceOperativoHoy,
  type BalanceOperativoHoy,
  type PedidoBalanceEntrada,
} from "./pedidos-balance-operativo-hoy";
import {
  detalleUnidadesEntregadasDelDia,
  entregasConDesgloseConfiable,
  type RangoDia,
} from "./unidades-entregadas-dia";

type Tx = Prisma.TransactionClient;

const PRODUCTOS_LEGACY: Array<{ producto: string; ped: string[]; ent: string[] }> = [
  { producto: "PACA_AGUA", ped: ["cPacaAguaPed"], ent: ["cPacaAguaEnt"] },
  { producto: "PACA_HIELO", ped: ["cPacaHieloPed"], ent: ["cPacaHieloEnt"] },
  { producto: "BOTELLON", ped: ["cBotellonFabPed", "cBotellonDomPed"], ent: ["cBotellonFabEnt", "cBotellonDomEnt"] },
  { producto: "BOLSA_AGUA", ped: ["cBolsaAguaPed"], ent: ["cBolsaAguaEnt"] },
  { producto: "BOLSA_HIELO", ped: ["cBolsaHieloPed"], ent: ["cBolsaHieloEnt"] },
];
const suma = (p: Record<string, unknown>, claves: string[]) =>
  claves.reduce((n, k) => n + Number(p[k] ?? 0), 0);

/** Estados con demanda abierta que forman la cola operativa (igual que los pendientes arrastrados de Pedidos). */
const ESTADOS_COLA = ["PENDIENTE", "EN_RUTA", "NO_ENTREGADO"] as const;

export async function leerBalanceOperativoHoy(tx: Tx, rango: RangoDia): Promise<BalanceOperativoHoy> {
  const { detalle } = await detalleUnidadesEntregadasDelDia(tx, rango);
  const idsEntregadosHoy = [...new Set(detalle.map((d) => d.pedidoId))];

  const pedidos = await tx.pedido.findMany({
    where: {
      estadoEntrega: { notIn: ["ANULADO", "CANCELADO"] },
      OR: [
        { fecha: { gte: rango.desde, lt: rango.hasta } },
        {
          fecha: { lt: rango.desde },
          OR: [
            {
              estadoEntrega: { in: [...ESTADOS_COLA] },
              // Un compromiso futuro no exigible no es cola de hoy (#927/#836); si se entregó hoy, entra por los hechos.
              AND: [{ OR: [{ fechaEntrega: null }, { fechaEntrega: { lt: rango.hasta } }] }],
            },
            { id: { in: idsEntregadosHoy } },
          ],
        },
      ],
    },
    select: {
      id: true,
      fecha: true,
      items: { select: { producto: true, cantPedido: true, cantRegaloPedido: true, cantEntrega: true, cantRegaloEntrega: true } },
      cPacaAguaPed: true, cPacaAguaEnt: true,
      cPacaHieloPed: true, cPacaHieloEnt: true,
      cBotellonFabPed: true, cBotellonFabEnt: true, cBotellonDomPed: true, cBotellonDomEnt: true,
      cBolsaAguaPed: true, cBolsaAguaEnt: true,
      cBolsaHieloPed: true, cBolsaHieloEnt: true,
    },
  });

  // Desglose por día fiable, solo para anteriores con entregas acumuladas.
  const entradas: PedidoBalanceEntrada[] = [];
  const anterioresConEntrega: string[] = [];
  for (const p of pedidos) {
    const demanda: Record<string, number> = {};
    const entregado: Record<string, number> = {};
    if (p.items.length) {
      for (const i of p.items) {
        demanda[i.producto] = (demanda[i.producto] ?? 0) + i.cantPedido + (i.cantRegaloPedido ?? 0);
        entregado[i.producto] = (entregado[i.producto] ?? 0) + i.cantEntrega + (i.cantRegaloEntrega ?? 0);
      }
    } else {
      for (const l of PRODUCTOS_LEGACY) {
        demanda[l.producto] = suma(p, l.ped);
        entregado[l.producto] = suma(p, l.ent);
      }
    }
    if (p.fecha < rango.desde && Object.values(entregado).some((n) => n > 0)) anterioresConEntrega.push(p.id);
    entradas.push({ id: p.id, fecha: p.fecha, demanda, entregado, desgloseConfiable: true });
  }
  if (anterioresConEntrega.length) {
    const hechos = await leerEntregasConsulta(tx, { ids: anterioresConEntrega });
    const porPedido = new Map<string, typeof hechos>();
    for (const e of hechos) porPedido.set(e.pedidoId, [...(porPedido.get(e.pedidoId) ?? []), e]);
    const conEntrega = new Set(anterioresConEntrega);
    for (const e of entradas) {
      // Con entregas acumuladas pero sin hechos auditables, el helper devuelve false: no hay desglose.
      if (conEntrega.has(e.id)) e.desgloseConfiable = entregasConDesgloseConfiable(porPedido.get(e.id) ?? []);
    }
  }

  // Pedidos anteriores anulados/cancelados hoy: pudieron estar pendientes al inicio del día.
  // Se informan para conciliar; no se reconstruyen sus unidades desde el estado actual.
  const auditoriaHoy = await tx.historial.findMany({
    where: {
      entidad: "Pedido",
      accion: { in: ["UPDATE", "DELETE"] },
      fecha: { gte: rango.desde, lt: rango.hasta },
      OR: [
        { datos: { contains: '"estado":"ANULADO"' } },
        { datos: { contains: '"estado":"CANCELADO"' } },
      ],
    },
    select: { registroId: true },
  });
  const idsAuditados = [...new Set(auditoriaHoy.map((h) => h.registroId))];
  const anuladosAnteriores = idsAuditados.length
    ? await tx.pedido.count({
        where: {
          id: { in: idsAuditados },
          fecha: { lt: rango.desde },
          estadoEntrega: { in: ["ANULADO", "CANCELADO"] },
        },
      })
    : 0;

  return calcularBalanceOperativoHoy(entradas, detalle, rango, anuladosAnteriores);
}
