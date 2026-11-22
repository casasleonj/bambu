import { describe, expect, it } from "vitest";
import { esVisitaPendienteCercania, resumirCargaCercania } from "../resumen-carga-cercania";
import { clasificarGestionVial } from "@/lib/geo/seleccion-recorrido-vial";
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

  it("botellones antiguos: no compensa el subtipo sobreentregado con otro pendiente (#930 XMOD)", () => {
    const c = pedido("legacy-subtipos", {
      cBotellonFabPed: 2, cBotellonFabEnt: 3,
      cBotellonDomPed: 3, cBotellonDomEnt: 0,
    });
    const resumen = resumirCargaCercania([c]);
    const backend = clasificarGestionVial({
      estadoEntrega: c.estadoEntrega,
      canal: c.canal,
      exigible: 0,
      items: [],
      legacyPendientes: [
        { pedidas: c.cBotellonFabPed, entregadas: c.cBotellonFabEnt },
        { pedidas: c.cBotellonDomPed, entregadas: c.cBotellonDomEnt },
      ],
    });
    expect(resumen.unidades).toBe(3);
    expect(resumen.porProducto).toEqual([{ producto: "BOTELLON", unidades: 3 }]);
    expect(resumen.unidades).toBe(backend?.unidadesPendientes);
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


describe("#959 Cercanía requiere demanda física pendiente", () => {
  it("excluye entrega completa incluso con fiado; no confunde deuda con mercancía", () => {
    expect(esVisitaPendienteCercania(pedido("entregado-fiado", {
      estadoEntrega: "ENTREGADO", exigible: 50000,
      items: [linea("PACA_AGUA", 30, 30)],
    }))).toBe(false);
    expect(esVisitaPendienteCercania(pedido("completo-pero-estado-antiguo", {
      estadoEntrega: "PENDIENTE", exigible: 7000,
      items: [linea("PACA_AGUA", 3, 3)],
    }))).toBe(false);
  });

  it("conserva parciales pagados y regalos pendientes, incluidas columnas legacy", () => {
    expect(esVisitaPendienteCercania(pedido("pagado-parcial", {
      estadoPago: "PAGADO", items: [linea("PACA_AGUA", 10, 7)],
    }))).toBe(true);
    expect(esVisitaPendienteCercania(pedido("regalo", {
      items: [linea("PACA_AGUA", 10, 10, 2, 1)],
    }))).toBe(true);
    expect(esVisitaPendienteCercania(pedido("legacy", {
      cBotellonDomPed: 4, cBotellonDomEnt: 2,
    }))).toBe(true);
  });

  it("descarta punto, anulados y cancelados aunque tengan cantidades o saldo", () => {
    const activo = { items: [linea("PACA_AGUA", 5, 0)], exigible: 3000 };
    expect(esVisitaPendienteCercania(pedido("punto", {
      ...activo, canal: "PUNTO",
    }))).toBe(false);
    expect(esVisitaPendienteCercania(pedido("anulado", {
      ...activo, estadoEntrega: "ANULADO",
    }))).toBe(false);
    expect(esVisitaPendienteCercania(pedido("cancelado", {
      ...activo, estadoEntrega: "CANCELADO",
    }))).toBe(false);
  });

  it("un pendiente con desglose desconocido no se inventa como completado", () => {
    expect(esVisitaPendienteCercania(pedido("sin-detalle"))).toBe(true);
  });

  it("excluye salida de mañana y embarque asignado; permite entrega pasada pendiente", () => {
    const pendiente = { items: [linea("PACA_AGUA", 5, 1)] };
    expect(esVisitaPendienteCercania(pedido("manana", {
      ...pendiente, fechaEntrega: "2026-11-22T16:00:00.000Z",
    }), "2026-11-21")).toBe(false);
    expect(esVisitaPendienteCercania(pedido("embarcado", {
      ...pendiente, embarqueId: "embarque-sintetico",
    }), "2026-11-21")).toBe(false);
    expect(esVisitaPendienteCercania(pedido("ayer", {
      ...pendiente, fechaEntrega: "2026-11-20T16:00:00.000Z",
    }), "2026-11-21")).toBe(true);
    expect(esVisitaPendienteCercania(pedido("hoy", {
      ...pendiente, fechaEntrega: "2026-11-21T16:00:00.000Z",
    }), "2026-11-21")).toBe(true);
  });

});
