import { describe, expect, it } from "vitest";
import { remanentesPorProducto } from "./remanentes-barrio";
describe("remanentes físicos por barrio #859", () => {
  it("descuenta entregas parciales sin descontar pagos", () => {
    expect({ ...remanentesPorProducto([
      { producto: "PACA_AGUA", cantPedido: 10, cantEntrega: 6 },
      { producto: "PACA_HIELO", cantPedido: 10, cantEntrega: 0 },
      { producto: "BOTELLON", cantPedido: 10, cantEntrega: 0 },
    ]) }).toEqual({ PACA_AGUA: 4, PACA_HIELO: 10, BOTELLON: 10 });
  });
  it("omite completados y mantiene productos nuevos", () => {
    expect({ ...remanentesPorProducto([
      { producto: "PACA_AGUA", cantPedido: 4, cantEntrega: 4 },
      { producto: "OTRO", cantPedido: 3, cantEntrega: 1 },
    ]) }).toEqual({ OTRO: 2 });
  });
  it("rechaza cantidades inválidas", () => {
    expect(() => remanentesPorProducto([{ producto: "PACA_AGUA", cantPedido: -1, cantEntrega: 0 }])).toThrow();
  });
});
