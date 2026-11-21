import { describe, expect, it } from "vitest";
import { resumirCargaCercania } from "../resumen-carga-cercania";
import type { Pedido } from "../types";

function pedido(id: string, overrides: Partial<Pedido> = {}): Pedido {
  return {
    id, canal: "DOMICILIO", estadoEntrega: "PENDIENTE",
    items: [], saldo: 0, exigible: 0,
    cPacaAguaPed: 0, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0,
    cBolsaAguaPed: 0, cBolsaHieloPed: 0,
    cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0,
    cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
    ...overrides,
  } as Pedido;
}
function linea(producto: string, cantPedido: number, cantEntrega: number,
  cantRegaloPedido = 0, cantRegaloEntrega = 0) {
  return { producto, cantPedido, cantEntrega, cantRegaloPedido, cantRegaloEntrega, precio: 0, subtotal: 0 };
}

describe("#930 resumen físico de pedidos seleccionados", () => {
  it("suma remanentes de todos los pedidos y separa productos, incluyendo regalos", () => {
    const r = resumirCargaCercania([
      pedido("p1", { items: [linea("PACA_AGUA", 10, 4, 1, 0)] }), // 7
      pedido("p2", { items: [linea("PACA_HIELO", 6, 2), linea("BOTELLON", 2, 0)] }), // 6
      pedido("p3", { estadoEntrega: "ENTREGADO", exigible: 5000,
        items: [linea("PACA_AGUA", 5, 5)] }), // solo cobro: 0
    ]);
    expect(r).toEqual({
      pedidos: 3, unidades: 13,
      porProducto: [
        { producto: "BOTELLON", unidades: 2 },
        { producto: "PACA_AGUA", unidades: 7 },
        { producto: "PACA_HIELO", unidades: 4 },
      ],
      pedidosSinDesglose: 0,
    });
  });

  it("no compensa regalos sin entregar con productos pagados sobreentregados", () => {
    const r = resumirCargaCercania([
      pedido("p1", { items: [linea("PACA_AGUA", 10, 11, 2, 0)] }),
    ]);
    expect(r.unidades).toBe(2); // coherencia con remanentesPorProducto y backend
  });

  it("no cuenta mercancía de cobros, pedidos en punto, cancelados o entregados", () => {
    const r = resumirCargaCercania([
      pedido("cobro", { estadoEntrega: "ENTREGADO", exigible: 9000, items: [linea("PACA_AGUA", 10, 8)] }),
      pedido("punto", { canal: "PUNTO", items: [linea("BOTELLON", 4, 0)] }),
      pedido("anulado", { estadoEntrega: "ANULADO", items: [linea("PACA_HIELO", 8, 0)] }),
    ]);
    expect(r.pedidos).toBe(3);
    expect(r.unidades).toBe(0);
    expect(r.porProducto).toEqual([]);
  });

  it("usa columnas legacy solo si no existen items, sin duplicar productos", () => {
    const r = resumirCargaCercania([
      pedido("anterior", {
        cPacaAguaPed: 9, cPacaAguaEnt: 4,
        cBotellonFabPed: 2, cBotellonDomPed: 1,
        cBotellonFabEnt: 1, cBotellonDomEnt: 0,
      }),
      pedido("moderno", {
        items: [linea("PACA_AGUA", 5, 3)],
        cPacaAguaPed: 100, cPacaAguaEnt: 0,
      }),
    ]);
    expect(r.unidades).toBe(9);
    expect(r.porProducto).toEqual([
      { producto: "BOTELLON", unidades: 2 },
      { producto: "PACA_AGUA", unidades: 7 },
    ]);
  });

  it("datos físicos faltantes o corruptos nunca se muestran como una carga exacta", () => {
    const r = resumirCargaCercania([
      pedido("sin-items"),
      pedido("datos-invalidos", { items: [linea("PACA_AGUA", -3, 0)] }),
      pedido("bien", { items: [linea("PACA_HIELO", 2, 0)] }),
    ]);
    expect(r).toMatchObject({ pedidos: 3, unidades: 2, pedidosSinDesglose: 2 });
  });

  it("la selección vacía no crea carga", () => {
    expect(resumirCargaCercania([])).toEqual({
      pedidos: 0, unidades: 0, porProducto: [], pedidosSinDesglose: 0,
    });
  });
});
