import { describe, it, expect } from "vitest";
import { proyectarEntregaHistorial, type PedidoParaHistorial, type HechoEntregaHistorico } from "../pedidos-entregas-historial";

const pedido: PedidoParaHistorial = {
  id: "p-escenario", numero: 901, nombre: "Cliente de prueba",
  fecha: new Date("2026-11-09T14:00:00Z"),
  solicitadas: [{ producto: "PACA_AGUA", cantidad: 6 }],
};
const evento = (id: string, fecha: string, agua: number): HechoEntregaHistorico => ({
  id, fecha: new Date(fecha), cantidades: [{ producto: "PACA_AGUA", cantidad: agua }],
});
const lunes = { desde: new Date("2026-11-09T05:00:00Z"), hasta: new Date("2026-11-10T05:00:00Z") };
const martes = { desde: new Date("2026-11-10T05:00:00Z"), hasta: new Date("2026-11-11T05:00:00Z") };
const miercoles = { desde: new Date("2026-11-11T05:00:00Z"), hasta: new Date("2026-11-12T05:00:00Z") };
const eLunes = evento("1", "2026-11-09T17:00:00Z", 3);
const eMiercoles = evento("2", "2026-11-11T17:00:00Z", 3);

describe("#763 — clasificación histórica de entregas", () => {
  it("E17: el lunes permanece parcial aunque se complete el miércoles; muestra ambas fechas", () => {
    const r = proyectarEntregaHistorial(pedido, [eLunes, eMiercoles], lunes);
    expect(r?.estadoAlCorte).toBe("PARCIAL");
    expect(r?.cantidadesDelRango).toEqual([{ producto: "PACA_AGUA", cantidad: 3 }]);
    expect(r?.cantidadesAlCorte).toEqual([{ producto: "PACA_AGUA", cantidad: 3 }]);
    expect(r?.fechaCompletado).toBe("2026-11-11");
    expect(r?.hitos.map((h) => [h.fecha, h.completado])).toEqual([
      ["2026-11-09", false], ["2026-11-11", true],
    ]);
  });
  it("E18: el miércoles se ve solo lo entregado ese día y el badge de completado tras parcial", () => {
    const r = proyectarEntregaHistorial(pedido, [eLunes, eMiercoles], miercoles);
    expect(r?.estadoAlCorte).toBe("COMPLETADO_TRAS_PARCIAL");
    expect(r?.cantidadesDelRango[0].cantidad).toBe(3);
    expect(r?.cantidadesAlCorte[0].cantidad).toBe(6);
    expect(r?.pedidoAnterior).toBe(true);
  });
  it("E12: pedido anterior sin entregas previas y entregado de una vez hoy", () => {
    const r = proyectarEntregaHistorial(pedido, [evento("primero", "2026-11-10T18:00:00Z", 6)], martes);
    expect(r?.estadoAlCorte).toBe("PRIMERA_ENTREGA");
    expect(r?.fechaCompletado).toBe("2026-11-10");
  });
  it("E13: pedido anterior con primera entrega parcial hoy sigue parcial", () => {
    const r = proyectarEntregaHistorial(pedido, [evento("primero", "2026-11-10T18:00:00Z", 2)], martes);
    expect(r?.estadoAlCorte).toBe("PARCIAL");
    expect(r?.fechaCompletado).toBeNull();
  });
  it("E03: pedido creado y totalmente entregado hoy no se clasifica como anterior ni parcial", () => {
    const r = proyectarEntregaHistorial(pedido, [evento("1", "2026-11-09T18:00:00Z", 6)], lunes);
    expect(r?.estadoAlCorte).toBe("COMPLETADO");
    expect(r?.pedidoAnterior).toBe(false);
  });
  it("E15: deduplica un mismo evento y agrupa las entregas del mismo día", () => {
    const e2 = evento("2", "2026-11-09T20:00:00Z", 3);
    const r = proyectarEntregaHistorial(pedido, [eLunes, eLunes, e2], lunes);
    expect(r?.estadoAlCorte).toBe("COMPLETADO_TRAS_PARCIAL");
    expect(r?.cantidadesDelRango[0].cantidad).toBe(6);
    expect(r?.hitos).toHaveLength(1);
    expect(r?.hitos[0].cantidades[0].cantidad).toBe(6);
  });
  it("E19: tres fechas, la completitud se reconoce solo en el último hecho", () => {
    const r = proyectarEntregaHistorial(pedido, [
      evento("1", "2026-11-09T14:00:00Z", 1),
      evento("2", "2026-11-10T15:00:00Z", 2),
      evento("3", "2026-11-11T15:00:00Z", 3),
    ], martes);
    expect(r?.estadoAlCorte).toBe("PARCIAL");
    expect(r?.fechaCompletado).toBe("2026-11-11");
    expect(r?.cantidadesDelRango[0].cantidad).toBe(2);
    expect(r?.cantidadesAlCorte[0].cantidad).toBe(3);
    expect(r?.hitos).toHaveLength(3);
  });
  it("E09: filtrar un repartidor no suma las cantidades de otro, pero conserva el estado global del pedido", () => {
    const primero = evento("de-a", "2026-11-10T15:00:00Z", 3);
    const segundo = evento("de-b", "2026-11-10T17:00:00Z", 3);
    const r = proyectarEntregaHistorial(pedido, [primero, segundo], martes, new Set(["de-a"]));
    expect(r?.cantidadesDelRango).toEqual([{ producto: "PACA_AGUA", cantidad: 3 }]);
    expect(r?.cantidadesAlCorte).toEqual([{ producto: "PACA_AGUA", cantidad: 6 }]);
    expect(r?.estadoAlCorte).toBe("COMPLETADO_TRAS_PARCIAL");
    expect(proyectarEntregaHistorial(pedido, [primero, segundo], martes, new Set(["no-matches"]))).toBeNull();
  });
  it("E20/E21: historial sin cantidades verificables no inventa completitud", () => {
    const r = proyectarEntregaHistorial(pedido, [
      { id: "inc", fecha: new Date("2026-11-09T15:00:00Z"), cantidades: null, incompleto: true },
      eMiercoles,
    ], lunes);
    expect(r?.estadoAlCorte).toBe("POR_CONCILIAR");
    expect(r?.fechaCompletado).toBeNull();
    expect(r?.hitos[0].porConciliar).toBe(true);
  });
  it("E22: un ajuste de cantidad posterior al corte impide inventar el estado histórico", () => {
    const r = proyectarEntregaHistorial({ ...pedido, ajustePosterior: true }, [eLunes, eMiercoles], lunes);
    expect(r?.estadoAlCorte).toBe("POR_CONCILIAR");
  });
  it("E07: usa el momento efectivo de entrega, aunque el evento llegue al servidor después", () => {
    const r = proyectarEntregaHistorial(pedido, [
      evento("offline", "2026-11-10T04:59:59.999Z", 3),
      eMiercoles,
    ], lunes);
    expect(r?.cantidadesDelRango[0].cantidad).toBe(3);
    expect(r?.estadoAlCorte).toBe("PARCIAL");
  });
  it("no mezcla otras fechas y detecta duplicados de producto o un total excedido", () => {
    expect(proyectarEntregaHistorial(pedido, [eMiercoles], lunes)).toBeNull();
    const r = proyectarEntregaHistorial(pedido, [evento("x", "2026-11-09T14:00:00Z", 7)], lunes);
    expect(r?.estadoAlCorte).toBe("POR_CONCILIAR");
  });
});
