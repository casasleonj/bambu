import { describe, expect, it } from "vitest";
import type { EntregaConsulta } from "../entregas-consulta";
import { componerActoresFiado, RESPONSABLE_HISTORICO } from "../fiados-actores";

// #614 F1: creador, entregador y receptor de pago se mantienen como personas distintas.
const nombres = new Map([["t-pedro", "Pedro Gómez"], ["t-ana", "Ana Soto"]]);
const hecho = (extra: Partial<EntregaConsulta>): EntregaConsulta => ({
  id: "e1", pedidoId: "p1", fecha: new Date("2026-11-03T15:40:00Z"), repartidorId: "t-pedro",
  cantidades: [{ producto: "AGUA", cantidad: 10 }], fuente: "AUDITORIA", ...extra,
});
const base = { creadoPor: "Lilia Ruiz", createdAt: new Date("2026-11-03T13:05:00Z") };

describe("componerActoresFiado (#614)", () => {
  it("separa creador, entregador y quien recibió el pago", () => {
    const r = componerActoresFiado(base, [hecho({})], [
      { id: "g1", fecha: new Date("2026-11-05T20:12:00Z"), metodo: "EFECTIVO", monto: 20000, recibidoPorId: "t-ana" },
    ], nombres);
    expect(r.creadoPor).toBe("Lilia Ruiz");
    expect(r.responsablesEntrega).toEqual([{ id: "t-pedro", nombre: "Pedro Gómez" }]);
    expect(r.pagos[0].recibidoPor).toEqual({ id: "t-ana", nombre: "Ana Soto" });
    expect(r.entregasSinDetalle).toBe(false);
  });
  it("no inventa autor: sin repartidor => responsable null y sin detalle", () => {
    const r = componerActoresFiado(base, [hecho({ repartidorId: null })], [], nombres);
    expect(r.entregas[0].responsable).toBeNull();
    expect(r.responsablesEntrega).toEqual([]);
    expect(r.entregasSinDetalle).toBe(true);
  });
  it("registro legado sin cantidades o incompleto no inventa cantidades", () => {
    const a = componerActoresFiado(base, [hecho({ cantidades: null, fuente: "HISTORICO" })], [], nombres);
    const b = componerActoresFiado(base, [hecho({ incompleto: true })], [], nombres);
    expect(a.entregas[0].cantidades).toBeNull();
    expect(b.entregas[0].cantidades).toBeNull();
    expect(a.entregasSinDetalle && b.entregasSinDetalle).toBe(true);
  });
  it("persona inactiva/ausente del mapa conserva el ID con nombre histórico", () => {
    const r = componerActoresFiado(base, [hecho({ repartidorId: "t-retirado" })], [], nombres);
    expect(r.entregas[0].responsable).toEqual({ id: "t-retirado", nombre: RESPONSABLE_HISTORICO });
  });
  it("entrega compartida: ambos responsables una sola vez, en orden cronológico", () => {
    const r = componerActoresFiado(base, [
      hecho({ id: "e2", repartidorId: "t-ana", fecha: new Date("2026-11-04T15:00:00Z") }),
      hecho({ id: "e1" }),
      hecho({ id: "e3", repartidorId: "t-ana", fecha: new Date("2026-11-05T15:00:00Z") }),
    ], [], nombres);
    expect(r.entregas.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(r.responsablesEntrega.map((x) => x.id)).toEqual(["t-pedro", "t-ana"]);
  });
  it("pago sin receptor registrado queda null (oficina o histórico) y sin creador queda null", () => {
    const r = componerActoresFiado({ creadoPor: null, createdAt: base.createdAt }, [], [
      { id: "g1", fecha: new Date("2026-11-05T20:12:00Z"), metodo: "EFECTIVO", monto: 5000, recibidoPorId: null },
    ], nombres);
    expect(r.creadoPor).toBeNull();
    expect(r.pagos[0].recibidoPor).toBeNull();
  });
});
