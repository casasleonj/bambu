import { describe, expect, it } from "vitest";
import {
  calcularEconomiaOperativaHoy,
  exigibleParaEconomia,
  type PedidoEconomiaEntrada,
} from "../pedidos-economia-operativa-hoy";

const c = (pesos: number) => Math.round(pesos * 100);
const p = (id: string, valor: number, pagado: number, exigible: number | null, extra: Partial<PedidoEconomiaEntrada> = {}): PedidoEconomiaEntrada => ({
  id, valorHoyCentavos: c(valor), sinPrecio: false, totalPagadoCentavos: c(pagado), exigibleCentavos: exigible === null ? null : c(exigible), ...extra,
});
const calc = (...xs: PedidoEconomiaEntrada[]) => calcularEconomiaOperativaHoy(xs);
const identidad = (r: ReturnType<typeof calc>) =>
  Math.round((r.pagadoDeEso + r.porCobrarDeEso + r.porConciliar.valor) * 100) === Math.round(r.entregadoHoy * 100);

describe("#853 Fase 3 · economía de lo entregado hoy", () => {
  it("entregado y pagado completo hoy: todo pagado, nada por cobrar", () => {
    const r = calc(p("A", 50_000, 50_000, 0));
    expect(r).toEqual({ entregadoHoy: 50_000, pagadoDeEso: 50_000, porCobrarDeEso: 0, porConciliar: { pedidos: 0, valor: 0 } });
  });

  it("fiado del mismo día: entregado sin pago, todo por cobrar", () => {
    const r = calc(p("A", 50_000, 0, 50_000));
    expect(r).toMatchObject({ entregadoHoy: 50_000, pagadoDeEso: 0, porCobrarDeEso: 50_000 });
  });

  it("anticipo: pagado antes de entregar, hoy no hay deuda", () => {
    const r = calc(p("A", 30_000, 30_000, 0));
    expect(r).toMatchObject({ pagadoDeEso: 30_000, porCobrarDeEso: 0 });
  });

  it("pago parcial: lo sin pagar de un pedido es lo más reciente (FIFO), por eso min(exigible, valor de hoy)", () => {
    // B: pedido de 40.000; ayer entregó 30.000 y hoy 10.000; pagó 20.000 → saldo 20.000.
    // Los 20.000 pagados cubren primero lo de ayer; lo de hoy (10.000) queda sin pagar.
    const r = calc(p("B", 10_000, 20_000, 20_000));
    expect(r).toMatchObject({ entregadoHoy: 10_000, pagadoDeEso: 0, porCobrarDeEso: 10_000 });
  });

  it("pedido anterior casi pagado: la parte de hoy queda cubierta si el saldo es menor", () => {
    // Pedido de 40.000, pagó 35.000 → saldo 5.000; hoy entregó 10.000 → 5.000 pagados, 5.000 por cobrar.
    const r = calc(p("B", 10_000, 35_000, 5_000));
    expect(r).toMatchObject({ pagadoDeEso: 5_000, porCobrarDeEso: 5_000 });
  });

  it("varios pedidos suman y la identidad se cumple", () => {
    const r = calc(p("A", 50_000, 50_000, 0), p("B", 10_000, 20_000, 20_000), p("C", 60_000, 20_000, 40_000));
    expect(r.entregadoHoy).toBe(120_000);
    expect(r.pagadoDeEso).toBe(50_000 + 0 + 20_000);
    expect(r.porCobrarDeEso).toBe(0 + 10_000 + 40_000);
    expect(identidad(r)).toBe(true);
  });

  it("un parcial sin evidencia exigible queda por conciliar, con su valor identificado", () => {
    const r = calc(p("A", 50_000, 50_000, 0), p("P", 12_000, 0, null));
    expect(r.entregadoHoy).toBe(62_000);
    expect(r.porConciliar).toEqual({ pedidos: 1, valor: 12_000 });
    expect(r.porCobrarDeEso).toBe(0);
    expect(identidad(r)).toBe(true);
  });

  it("unidades sin precio verificable: el reparto no se afirma", () => {
    const r = calc(p("S", 8_000, 0, 8_000, { sinPrecio: true }));
    expect(r).toMatchObject({ pagadoDeEso: 0, porCobrarDeEso: 0, porConciliar: { pedidos: 1, valor: 8_000 } });
  });

  it("pedido antiguo «aproximado» (sin desglose por día): cuenta como entregado pero su reparto queda por conciliar", () => {
    const r = calc(p("L", 20_000, 20_000, 0, { aproximado: true }), p("A", 10_000, 10_000, 0));
    expect(r.entregadoHoy).toBe(30_000);
    expect(r.porConciliar).toEqual({ pedidos: 1, valor: 20_000 });
    expect(r.pagadoDeEso).toBe(10_000);
    expect(identidad(r)).toBe(true);
  });

  it("precio corregido al alza después de entregar: lo 'pagado' no puede exceder lo que el pedido tiene pagado", () => {
    // Hoy vale 100.000 pero el pedido solo tiene 10.000 pagados y 0 exigible (saldo 0 por la corrección).
    const r = calc(p("X", 100_000, 10_000, 0));
    expect(r.porConciliar).toEqual({ pedidos: 1, valor: 100_000 });
    expect(r.pagadoDeEso).toBe(0);
    expect(identidad(r)).toBe(true);
  });

  it("saldo a favor o sobrepago: el exigible no es negativo y no inventa pagado", () => {
    const r = calc(p("O", 20_000, 25_000, 0));
    expect(r).toMatchObject({ pagadoDeEso: 20_000, porCobrarDeEso: 0 });
  });

  it("importes con centavos (precios decimales) no pierden precisión", () => {
    const r = calc(p("D", 12_345.67, 5_000.5, 7_345.17));
    expect(r.entregadoHoy).toBe(12_345.67);
    expect(r.porCobrarDeEso).toBe(7_345.17);
    expect(r.pagadoDeEso).toBe(5_000.5);
    expect(identidad(r)).toBe(true);
  });

  it("un pedido repetido cuenta una sola vez (sin doble conteo por joins o reintentos)", () => {
    const r = calc(p("A", 50_000, 0, 50_000), p("A", 50_000, 0, 50_000));
    expect(r.entregadoHoy).toBe(50_000);
  });

  it("pedido sin valor hoy no aporta; el total es independiente del orden", () => {
    const a = calc(p("Z", 0, 0, 0), p("A", 10_000, 0, 10_000), p("B", 5_000, 5_000, 0));
    const b = calc(p("B", 5_000, 5_000, 0), p("A", 10_000, 0, 10_000), p("Z", 0, 0, 0));
    expect(a).toEqual(b);
    expect(a.entregadoHoy).toBe(15_000);
  });

  it("importes no verificables lanzan error en vez de mostrar un dato falso", () => {
    expect(() => calc(p("N", -1, 0, 0))).toThrow();
    expect(() => calc({ id: "F", valorHoyCentavos: 1.5, sinPrecio: false, totalPagadoCentavos: 0, exigibleCentavos: 0 })).toThrow();
    expect(() => calc({ id: "F", valorHoyCentavos: 100, sinPrecio: false, totalPagadoCentavos: Number.NaN, exigibleCentavos: 0 })).toThrow();
  });

  it("un exigible inválido no se usa: queda por conciliar", () => {
    const r = calc(p("E", 10_000, 0, -5));
    expect(r.porConciliar.pedidos).toBe(1);
  });
});

describe("#853 Fase 3 · exigible que se usa para repartir lo de hoy", () => {
  const base = { saldoCentavos: c(20_000), exigibleVigenteCentavos: c(7_000) };
  it("ENTREGADO: el saldo íntegro, con o sin la proyección de fiados", () => {
    expect(exigibleParaEconomia({ ...base, estadoEntrega: "ENTREGADO", proyeccionActiva: false, hechosDeHoy: 0 })).toBe(c(20_000));
    expect(exigibleParaEconomia({ ...base, estadoEntrega: "ENTREGADO", proyeccionActiva: true, hechosDeHoy: 1 })).toBe(c(20_000));
  });
  it("ENTREGADO con saldo negativo (crédito): cero", () => {
    expect(exigibleParaEconomia({ estadoEntrega: "ENTREGADO", saldoCentavos: -500, exigibleVigenteCentavos: 0, proyeccionActiva: true, hechosDeHoy: 1 })).toBe(0);
  });
  it("parcial con proyección activa y un hecho de hoy: el exigible vigente", () => {
    expect(exigibleParaEconomia({ ...base, estadoEntrega: "PENDIENTE", proyeccionActiva: true, hechosDeHoy: 1 })).toBe(c(7_000));
  });
  it("parcial con la proyección APAGADA: no se inventa exigible", () => {
    expect(exigibleParaEconomia({ ...base, estadoEntrega: "PENDIENTE", proyeccionActiva: false, hechosDeHoy: 1 })).toBeNull();
  });
  it("parcial activa pero sin hecho de entrega de hoy: no se afirma", () => {
    expect(exigibleParaEconomia({ ...base, estadoEntrega: "EN_RUTA", proyeccionActiva: true, hechosDeHoy: 0 })).toBeNull();
  });
});
