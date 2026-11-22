import { describe, expect, it } from "vitest";
import { leerFiltrosConsulta } from "../pedidos-consulta";
import {
  mostrarResumenOperativoHoy,
  resumirEntregasOperativasHoy,
} from "../pedidos-resumen-operativo-hoy";

const D = "2026-11-21";
const rango = {
  desde: new Date("2026-11-21T00:00:00-05:00"),
  hasta: new Date("2026-11-22T00:00:00-05:00"),
};
const fecha = (d: string) => new Date(`${d}T12:00:00-05:00`);
const filtros = (q = "") =>
  leerFiltrosConsulta(new URLSearchParams(`desde=${D}&hasta=${D}&resumen=1&${q}`), D);

describe("#853: productos entregados hoy frente a productos de pedidos fechados hoy", () => {
  it("reconcilia 571 + 10 = 581 sin modificar la cohorte de pedidos del día", () => {
    const detalle = [
      { pedidoId: "nuevo", producto: "PACA_AGUA", cantidad: 571 },
      { pedidoId: "1349", producto: "PACA_AGUA", cantidad: 10 },
    ];
    const r = resumirEntregasOperativasHoy(
      detalle,
      new Map([["nuevo", fecha(D)], ["1349", fecha("2026-11-20")]]),
      rango,
    );
    expect(r.total).toBe(581);
    expect(r.productos).toEqual([{
      producto: "PACA_AGUA", entregadasHoy: 581,
      dePedidosHoy: 571, dePedidosAnteriores: 10, porConciliarOrigen: 0,
    }]);
  });

  it("solo cuenta los deltas entregados hoy, no el acumulado de entregas parciales anteriores", () => {
    const r = resumirEntregasOperativasHoy(
      [
        { pedidoId: "parcial", producto: "PACA_AGUA", cantidad: 6 },
        { pedidoId: "parcial", producto: "PACA_AGUA", cantidad: 4 },
      ],
      new Map([["parcial", fecha("2026-11-19")]]),
      rango,
    );
    expect(r.total).toBe(10);
    expect(r.productos[0].dePedidosAnteriores).toBe(10);
  });

  it("separa productos, conserva regalos físicos y no confunde cohorte futura con hoy", () => {
    const r = resumirEntregasOperativasHoy(
      [
        { pedidoId: "hoy", producto: "BOTELLON", cantidad: 3 },
        { pedidoId: "anterior", producto: "PACA_HIELO", cantidad: 2 },
        { pedidoId: "anterior", producto: "PACA_AGUA", cantidad: 1 },
        { pedidoId: "desconocido", producto: "PACA_AGUA", cantidad: 2 },
        { pedidoId: "futuro", producto: "PACA_AGUA", cantidad: 1 },
      ],
      new Map([
        ["hoy", fecha(D)],
        ["anterior", fecha("2026-11-20")],
        ["futuro", fecha("2026-11-22")],
      ]),
      rango,
    );
    expect(r.total).toBe(9);
    expect(r.productos.find(p => p.producto === "PACA_AGUA")).toEqual({
      producto: "PACA_AGUA", entregadasHoy: 4,
      dePedidosHoy: 0, dePedidosAnteriores: 1, porConciliarOrigen: 3,
    });
  });

  it("rechaza cantidades inválidas en vez de presentarlas como hechos físicos", () => {
    expect(() => resumirEntregasOperativasHoy(
      [{ pedidoId: "x", producto: "PACA_AGUA", cantidad: 1.5 }],
      new Map([["x", fecha(D)]]), rango,
    )).toThrow("no verificable");
  });

  it("solo habilita el agregado global en Hoy sin filtros, con o sin agrupación territorial", () => {
    expect(mostrarResumenOperativoHoy(filtros(), D)).toBe(true);
    expect(mostrarResumenOperativoHoy(filtros("agrupar=barrio"), D)).toBe(true);
    for (const q of [
      "desdeHora=09:00", "canal=PUNTO", "search=cliente", "clienteId=c",
      "repartidorId=r", "grupoBarrio=b:centro", "estadoEntrega=ENTREGADO",
      "registro=anulados", "fechaBase=entrega", "fechaBase=cobro",
      "origen=VENTA_RAPIDA", "pago=fiado", "foco=paraHoy", "conRecurrencia=true",
      "hasta=2026-11-22", "all=true", "resumen=0",
    ]) {
      expect(mostrarResumenOperativoHoy(filtros(q), D), q).toBe(false);
    }
  });
});
