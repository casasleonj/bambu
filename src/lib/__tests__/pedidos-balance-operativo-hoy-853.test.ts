import { describe, expect, it } from "vitest";
import {
  calcularBalanceOperativoHoy,
  type EntregaDelDia,
  type PedidoBalanceEntrada,
} from "../pedidos-balance-operativo-hoy";

const rango = { desde: new Date("2026-11-22T05:00:00Z"), hasta: new Date("2026-11-23T05:00:00Z") };
const ayer = new Date("2026-11-21T15:00:00Z");
const hoy = new Date("2026-11-22T15:00:00Z");
const manana = new Date("2026-11-23T15:00:00Z");

const pedido = (
  id: string,
  fecha: Date,
  demanda: number,
  entregado: number,
  extra: Partial<PedidoBalanceEntrada> = {},
): PedidoBalanceEntrada => ({
  id, fecha, demanda: { PACA_AGUA: demanda }, entregado: { PACA_AGUA: entregado }, desgloseConfiable: true, ...extra,
});
const entrega = (pedidoId: string, cantidad: number, producto = "PACA_AGUA"): EntregaDelDia => ({ pedidoId, producto, cantidad });
const agua = (r: ReturnType<typeof calcularBalanceOperativoHoy>) => r.productos.find((p) => p.producto === "PACA_AGUA")!;

describe("#853 balance operativo de hoy", () => {
  it("ejemplo de aceptación del PO: A, B y C = 3 pedidos, 160 por gestionar, 120 entregadas, 40 faltan", () => {
    const r = calcularBalanceOperativoHoy(
      [pedido("A", ayer, 50, 50), pedido("B", ayer, 40, 40), pedido("C", hoy, 100, 60)],
      [entrega("A", 50), entrega("B", 10), entrega("C", 60)],
      rango,
    );
    const p = agua(r);
    expect(p.grupos.pendientesAnteriores).toEqual({ porGestionar: 50, ajustes: 0, entregadasHoy: 50, faltan: 0 });
    expect(p.grupos.parcialesAnteriores).toEqual({ porGestionar: 10, ajustes: 0, entregadasHoy: 10, faltan: 0 });
    expect(p.grupos.pedidosHoy).toEqual({ porGestionar: 100, ajustes: 0, entregadasHoy: 60, faltan: 40 });
    expect(p.total).toEqual({ porGestionar: 160, ajustes: 0, entregadasHoy: 120, faltan: 40 });
    expect(r.pedidosUnicos).toEqual({ pedidosHoy: 1, pendientesAnteriores: 1, parcialesAnteriores: 1, total: 3 });
  });

  it("un parcial anterior cuenta solo su remanente al inicio, nunca el total original", () => {
    const r = calcularBalanceOperativoHoy([pedido("B", ayer, 40, 35)], [entrega("B", 5)], rango);
    expect(agua(r).grupos.parcialesAnteriores).toEqual({ porGestionar: 10, ajustes: 0, entregadasHoy: 5, faltan: 5 });
  });

  it("un pedido anterior no gestionado hoy sigue en su grupo con todo por entregar", () => {
    const r = calcularBalanceOperativoHoy([pedido("A", ayer, 30, 0)], [], rango);
    expect(agua(r).grupos.pendientesAnteriores).toEqual({ porGestionar: 30, ajustes: 0, entregadasHoy: 0, faltan: 30 });
  });

  it("un anterior ya completo antes de hoy no entra", () => {
    const r = calcularBalanceOperativoHoy([pedido("X", ayer, 20, 20)], [], rango);
    expect(r.productos).toEqual([]);
    expect(r.pedidosUnicos.total).toBe(0);
  });

  it("dos entregas del mismo pedido anterior hoy se suman y el pedido cuenta una sola vez", () => {
    const r = calcularBalanceOperativoHoy(
      [pedido("B", ayer, 40, 40), pedido("B", ayer, 40, 40)],
      [entrega("B", 4), entrega("B", 6)],
      rango,
    );
    // previo = 40 − 10 = 30 → parcial; pendiente inicial 10, entregadas 10.
    expect(agua(r).grupos.parcialesAnteriores).toEqual({ porGestionar: 10, ajustes: 0, entregadasHoy: 10, faltan: 0 });
    expect(r.pedidosUnicos.parcialesAnteriores).toBe(1);
  });

  it("fixture del issue: D-1 pedido 20 entrega 10; D entrega 6 y nuevo pedido 30 → inicial 10, nuevo 30, entregado 6, faltan 34", () => {
    const r = calcularBalanceOperativoHoy(
      [pedido("P1", ayer, 20, 16), pedido("N", hoy, 30, 0)],
      [entrega("P1", 6)],
      rango,
    );
    expect(agua(r).total).toEqual({ porGestionar: 40, ajustes: 0, entregadasHoy: 6, faltan: 34 });
  });

  it("pedido de hoy con entrega 0 cuenta como por gestionar", () => {
    const r = calcularBalanceOperativoHoy([pedido("N", hoy, 30, 0)], [], rango);
    expect(agua(r).grupos.pedidosHoy).toEqual({ porGestionar: 30, ajustes: 0, entregadasHoy: 0, faltan: 30 });
  });

  it("pedidos futuros no entran a la cola de hoy", () => {
    const r = calcularBalanceOperativoHoy([pedido("F", manana, 30, 0)], [], rango);
    expect(r.pedidosUnicos.total).toBe(0);
  });

  it("anterior con entregas sin desglose por día: por conciliar, no se atribuye al día", () => {
    const r = calcularBalanceOperativoHoy(
      [pedido("V", ayer, 40, 25, { desgloseConfiable: false })],
      [],
      rango,
    );
    expect(r.productos).toEqual([]);
    expect(r.porConciliar.pedidosSinDesglose).toBe(1);
  });

  it("anterior sin entregas y sin desglose se mantiene pendiente: no hay nada que atribuir", () => {
    const r = calcularBalanceOperativoHoy(
      [pedido("V", ayer, 40, 0, { desgloseConfiable: false })],
      [],
      rango,
    );
    expect(agua(r).grupos.pendientesAnteriores.porGestionar).toBe(40);
  });

  it("entregado mayor que lo pedido: por conciliar, sin faltante negativo", () => {
    const r = calcularBalanceOperativoHoy([pedido("S", hoy, 10, 12)], [entrega("S", 12)], rango);
    expect(r.productos).toEqual([]);
    expect(r.porConciliar.pedidosInconsistentes).toBe(1);
  });

  it("delta del día mayor que el acumulado de un anterior: por conciliar", () => {
    const r = calcularBalanceOperativoHoy([pedido("S", ayer, 10, 4)], [entrega("S", 6)], rango);
    expect(r.porConciliar.pedidosInconsistentes).toBe(1);
  });

  it("cantidad física no verificable lanza error en vez de mostrar un dato falso", () => {
    expect(() => calcularBalanceOperativoHoy([], [entrega("A", -1)], rango)).toThrow();
    expect(() => calcularBalanceOperativoHoy([], [entrega("A", 1.5)], rango)).toThrow();
  });

  it("un pedido con varios productos se cuenta una vez y cada producto va aparte; el total es independiente del orden", () => {
    const multi: PedidoBalanceEntrada = {
      id: "M", fecha: ayer, demanda: { PACA_AGUA: 10, PACA_HIELO: 4 }, entregado: { PACA_AGUA: 10, PACA_HIELO: 1 },
      desgloseConfiable: true,
    };
    const entregas = [entrega("M", 10), entrega("M", 1, "PACA_HIELO")];
    const a = calcularBalanceOperativoHoy([multi, pedido("A", ayer, 50, 50)], [...entregas, entrega("A", 50)], rango);
    const b = calcularBalanceOperativoHoy([pedido("A", ayer, 50, 50), multi], [entrega("A", 50), ...entregas.reverse()], rango);
    expect(a).toEqual(b);
    expect(a.pedidosUnicos.total).toBe(2);
    expect(a.productos.find((p) => p.producto === "PACA_HIELO")!.total).toEqual({ porGestionar: 4, ajustes: 0, entregadasHoy: 1, faltan: 3 });
  });

  it("fixture del issue con cancelación: D-1 pedido 20 entrega 10, D entrega 6, nuevo 30; cancelan 4 → ajuste −4 y faltan 30 (no 34 ni 0)", () => {
    const r = calcularBalanceOperativoHoy(
      // P1 ya sin las 4 canceladas: demanda efectiva 16 = entregado 16; el ajuste de hoy es −4.
      [pedido("P1", ayer, 16, 16, { ajustesHoy: { PACA_AGUA: -4 } }), pedido("N", hoy, 30, 0)],
      [entrega("P1", 6)],
      rango,
    );
    const p = agua(r);
    expect(p.grupos.parcialesAnteriores).toEqual({ porGestionar: 10, ajustes: -4, entregadasHoy: 6, faltan: 0 });
    expect(p.total).toEqual({ porGestionar: 40, ajustes: -4, entregadasHoy: 6, faltan: 30 });
  });

  it("identidad: por gestionar + ajustes − entregadas = faltan en cada fila", () => {
    const r = calcularBalanceOperativoHoy(
      [
        pedido("A", ayer, 20, 0, { ajustesHoy: { PACA_AGUA: -20 } }), // cancelado hoy sin gestionar
        pedido("B", ayer, 30, 15, { ajustesHoy: { PACA_AGUA: -5 } }), // 5 entregadas antes, 10 hoy y reducción hoy
        pedido("C", hoy, 12, 0, { ajustesHoy: { PACA_AGUA: 3 } }), // aumento hoy
      ].map((p) => (p.id === "A" ? { ...p, demanda: { PACA_AGUA: 0 } } : p)),
      [entrega("B", 10)],
      rango,
    );
    for (const g of Object.values(agua(r).grupos)) {
      expect(g.porGestionar + g.ajustes - g.entregadasHoy).toBe(g.faltan);
    }
    expect(agua(r).grupos.pendientesAnteriores).toEqual({ porGestionar: 20, ajustes: -20, entregadasHoy: 0, faltan: 0 });
    expect(agua(r).grupos.parcialesAnteriores).toEqual({ porGestionar: 30, ajustes: -5, entregadasHoy: 10, faltan: 15 });
    expect(agua(r).grupos.pedidosHoy).toEqual({ porGestionar: 9, ajustes: 3, entregadasHoy: 0, faltan: 12 });
  });

  it("pedido de hoy cancelado hoy: su demanda original queda y el ajuste la retira, sin faltante", () => {
    const r = calcularBalanceOperativoHoy(
      [pedido("N", hoy, 0, 0, { ajustesHoy: { PACA_AGUA: -15 } })],
      [],
      rango,
    );
    expect(agua(r).grupos.pedidosHoy).toEqual({ porGestionar: 15, ajustes: -15, entregadasHoy: 0, faltan: 0 });
  });

  it("un ajuste que deja la demanda inicial negativa no cuadra: por conciliar", () => {
    const r = calcularBalanceOperativoHoy([pedido("X", ayer, 5, 0, { ajustesHoy: { PACA_AGUA: 9 } })], [], rango);
    expect(r.productos).toEqual([]);
    expect(r.porConciliar.pedidosInconsistentes).toBe(1);
  });

  it("edición de hoy con evidencia sin cantidades: por conciliar, no se adivina", () => {
    const r = calcularBalanceOperativoHoy([pedido("E", ayer, 12, 0, { ajusteDesconocido: true })], [], rango);
    expect(r.productos).toEqual([]);
    expect(r.porConciliar.edicionesSinCantidades).toBe(1);
  });
});
