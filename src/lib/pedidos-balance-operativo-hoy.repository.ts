// #853 Fase 1: lectura del balance operativo de HOY. Solo lectura: no escribe ni recalcula
// nómina, caja ni inventario. Reutiliza las fuentes canónicas de entregas del día.
import type { Prisma } from "@prisma/client";
import { leerEntregasConsulta } from "./entregas-consulta";
import { interpretarEvidenciaDemanda } from "./pedidos-cambios-demanda";
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

export interface CambiosDemandaPedido {
  /** Variación neta de la demanda hoy por producto, sin contar la cancelación (se deriva aparte). */
  ajustes: Record<string, number>;
  canceladoHoy: boolean;
  /** Cantidades que retiró la cancelación según la evidencia v1; null si es evidencia anterior al contrato. */
  cancelacionNeto: Record<string, number> | null;
  /** Edición con evidencia anterior al contrato: se sabe que cambió, no cuánto. */
  edicionSinCantidades: boolean;
}

/**
 * Cambios de demanda de HOY por pedido, desde las únicas fuentes que los registran:
 *   - `PedidoCantidadAjuste` (tabla tipada; los demás escritores guardan delta 0 como marca).
 *   - `PedidoReduccionComercial` APLICADA (tabla tipada).
 *   - Audit del pedido con `consultaDemanda` v1 (edición, cancelación, anulación), interpretado
 *     solo por `interpretarEvidenciaDemanda`.
 * Nada se infiere buscando texto dentro del JSON.
 */
export async function leerCambiosDemandaDelDia(tx: Tx, rango: RangoDia): Promise<Map<string, CambiosDemandaPedido>> {
  const cambios = new Map<string, CambiosDemandaPedido>();
  const de = (pedidoId: string) => {
    const c = cambios.get(pedidoId) ?? { ajustes: {}, canceladoHoy: false, cancelacionNeto: null, edicionSinCantidades: false };
    cambios.set(pedidoId, c);
    return c;
  };
  const sumar = (c: CambiosDemandaPedido, producto: string, delta: number) => {
    if (delta !== 0) c.ajustes[producto] = (c.ajustes[producto] ?? 0) + delta;
  };
  const ventana = { gte: rango.desde, lt: rango.hasta };

  const [ajustes, reducciones, auditoria] = await Promise.all([
    tx.pedidoCantidadAjuste.findMany({
      where: { createdAt: ventana, delta: { not: 0 } },
      select: { pedidoId: true, producto: true, delta: true },
    }),
    tx.pedidoReduccionComercial.findMany({
      where: { estado: "APLICADA", resueltoAt: ventana },
      select: { pedidoId: true, producto: true, cantPedidoAntes: true, cantPedidoDespues: true },
    }),
    tx.historial.findMany({
      where: { entidad: "Pedido", accion: { in: ["UPDATE", "DELETE"] }, fecha: ventana },
      select: { registroId: true, datos: true, fecha: true },
    }),
  ]);
  for (const a of ajustes) sumar(de(a.pedidoId), a.producto, a.delta);
  for (const r of reducciones) sumar(de(r.pedidoId), r.producto, r.cantPedidoDespues - r.cantPedidoAntes);

  for (const h of auditoria) {
    let datos: unknown;
    try {
      datos = JSON.parse(h.datos);
    } catch {
      continue; // no es un evento de pedido con forma JSON: no es evidencia de demanda
    }
    const e = interpretarEvidenciaDemanda(datos, h.fecha);
    if (!e) continue;
    const c = de(h.registroId);
    if (e.tipo === "EDICION") {
      if (e.sinCantidades) c.edicionSinCantidades = true;
      else for (const [producto, delta] of Object.entries(e.neto)) sumar(c, producto, delta);
    } else if (e.tipo === "CANCELACION") {
      c.canceladoHoy = true;
      if (!e.sinCantidades && Object.keys(e.neto).length) c.cancelacionNeto = e.neto;
    }
    // ANULACION: el pedido ya estaba entregado, no retira demanda pendiente.
  }
  return cambios;
}

export async function leerBalanceOperativoHoy(
  tx: Tx,
  rango: RangoDia,
  /** Entregas del día ya leídas en la misma transacción (evita repetir la consulta más pesada). */
  base?: Awaited<ReturnType<typeof detalleUnidadesEntregadasDelDia>>,
): Promise<BalanceOperativoHoy> {
  const { detalle } = base ?? await detalleUnidadesEntregadasDelDia(tx, rango);
  const idsEntregadosHoy = [...new Set(detalle.map((d) => d.pedidoId))];
  const cambios = await leerCambiosDemandaDelDia(tx, rango);
  const idsCanceladosHoy = [...cambios].filter(([, c]) => c.canceladoHoy).map(([id]) => id);

  const pedidos = await tx.pedido.findMany({
    where: {
      OR: [
        {
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
        // Cancelados HOY: su demanda pendiente se retiró durante el día y debe verse como ajuste.
        { id: { in: idsCanceladosHoy }, estadoEntrega: "CANCELADO", fecha: { lt: rango.hasta } },
      ],
    },
    select: {
      id: true,
      fecha: true,
      estadoEntrega: true,
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
    const c = cambios.get(p.id);
    const ajustesHoy: Record<string, number> = { ...(c?.ajustes ?? {}) };
    const cancelado = p.estadoEntrega === "CANCELADO";
    const hayEntrega = Object.values(entregado).some((n) => n > 0);
    if (cancelado) {
      // Los ítems conservan la demanda al cancelar; lo retirado es lo que aún no se había entregado.
      // Con evidencia v1 se usa lo que ella declara; si no, se deriva de los ítems del propio pedido.
      for (const producto of new Set([...Object.keys(demanda), ...Object.keys(c?.cancelacionNeto ?? {})])) {
        const retirado = c?.cancelacionNeto?.[producto] ?? -Math.max(0, (demanda[producto] ?? 0) - (entregado[producto] ?? 0));
        if (retirado !== 0) {
          ajustesHoy[producto] = (ajustesHoy[producto] ?? 0) + retirado;
          demanda[producto] = (demanda[producto] ?? 0) + retirado; // demanda efectiva tras cancelar = lo entregado
        }
      }
    }
    if (p.fecha < rango.desde && hayEntrega) anterioresConEntrega.push(p.id);
    entradas.push({
      id: p.id, fecha: p.fecha, demanda, entregado, ajustesHoy,
      // Un cancelado con entregas no tiene deltas del día en la fuente canónica (excluye cancelados): por conciliar.
      desgloseConfiable: !(cancelado && hayEntrega),
      ...(c?.edicionSinCantidades ? { ajusteDesconocido: true } : {}),
    });
  }
  if (anterioresConEntrega.length) {
    const hechos = await leerEntregasConsulta(tx, { ids: anterioresConEntrega });
    const porPedido = new Map<string, typeof hechos>();
    for (const e of hechos) porPedido.set(e.pedidoId, [...(porPedido.get(e.pedidoId) ?? []), e]);
    const conEntrega = new Set(anterioresConEntrega);
    for (const e of entradas) {
      // Con entregas acumuladas pero sin hechos auditables, el helper devuelve false: no hay desglose.
      if (conEntrega.has(e.id) && e.desgloseConfiable) {
        e.desgloseConfiable = entregasConDesgloseConfiable(porPedido.get(e.id) ?? []);
      }
    }
  }

  return calcularBalanceOperativoHoy(entradas, detalle, rango);
}
