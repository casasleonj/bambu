import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  leerEntregasConsulta,
  requiereConciliacionEntrega,
  type EntregaConsulta,
} from "../entregas-consulta";

// #989: ventas que nacen entregadas y entregas completas anteriores a #516 dejan de aparecer
// «Por conciliar» cuando ya está todo clarificado; lo realmente incierto se conserva.

const FECHA = new Date("2026-11-23T14:10:00.123Z");
const RESPONSABLE = "trab-1";

type Item = {
  producto: string;
  cantPedido: number;
  cantEntrega: number;
  cantRegaloPedido?: number;
  cantRegaloEntrega?: number;
};
interface Fila {
  id: string;
  canal: string;
  origen: string;
  estadoEntrega: string;
  fecha: Date;
  entregadoAt: Date | null;
  entregadoPorId: string | null;
  items: Item[];
  _count?: { ajustesCantidad: number; reduccionesComerciales: number };
  cPacaAguaEnt: number;
  cPacaHieloEnt: number;
  cBotellonFabEnt: number;
  cBotellonDomEnt: number;
  cBolsaAguaEnt: number;
  cBolsaHieloEnt: number;
}
const pedido = (extra: Partial<Fila> = {}): Fila => ({
  id: "p1",
  canal: "DOMICILIO",
  origen: "VENTA_RAPIDA",
  estadoEntrega: "ENTREGADO",
  fecha: FECHA,
  entregadoAt: new Date(+FECHA + 1), // 1 ms de diferencia: el caso real que fallaba
  entregadoPorId: RESPONSABLE,
  items: [{ producto: "PACA_AGUA", cantPedido: 8, cantEntrega: 8 }],
  _count: { ajustesCantidad: 0, reduccionesComerciales: 0 },
  cPacaAguaEnt: 0,
  cPacaHieloEnt: 0,
  cBotellonFabEnt: 0,
  cBotellonDomEnt: 0,
  cBolsaAguaEnt: 0,
  cBolsaHieloEnt: 0,
  ...extra,
});
const auditoriaLegada = (
  accion: "ENTREGA_OFICINA" | "ENTREGA",
  parcial: boolean,
  fechaEntrega = "2026-10-28T15:00:00.000Z",
  n = 1,
) => ({
  id: `a${n}`,
  registroId: "p1",
  fecha: new Date(fechaEntrega),
  datos: JSON.stringify({
    accion,
    estadoEntrega: parcial ? "PENDIENTE" : "ENTREGADO",
    parcial,
    repartidorId: RESPONSABLE,
    fechaEntrega,
  }),
});
function tx(filas: Fila[], auditorias: ReturnType<typeof auditoriaLegada>[] = []) {
  return {
    historial: { findMany: vi.fn().mockResolvedValue(auditorias) },
    embarqueMovimiento: { findMany: vi.fn().mockResolvedValue([]) },
    pedido: { findMany: vi.fn().mockResolvedValue(filas) },
  } as unknown as Prisma.TransactionClient;
}
const leer = (filas: Fila[], auditorias: ReturnType<typeof auditoriaLegada>[] = []) =>
  leerEntregasConsulta(tx(filas, auditorias), { ids: ["p1"] });
const sinConciliar = (h: EntregaConsulta[]) => h.length > 0 && !h.some(requiereConciliacionEntrega);

describe("#989 venta que nace entregada (venta rápida / venta en ruta)", () => {
  it("venta en ruta a Domicilio con responsable: entrega verificable aunque difiera 1 ms", async () => {
    const h = await leer([pedido()]);
    expect(h).toHaveLength(1);
    expect(sinConciliar(h)).toBe(true);
    expect(h[0]).toMatchObject({
      repartidorId: RESPONSABLE,
      cantidades: [{ producto: "PACA_AGUA", cantidad: 8 }],
      precisionDia: false,
    });
  });
  it("no depende de la igualdad exacta: milisegundos de diferencia dan lo mismo", async () => {
    const igual = await leer([pedido({ entregadoAt: FECHA })]);
    const casi = await leer([pedido({ entregadoAt: new Date(+FECHA + 900) })]);
    expect(sinConciliar(igual)).toBe(true);
    expect(sinConciliar(casi)).toBe(true);
  });
  it("entrega registrada minutos u horas después de la venta: es otra entrega, por conciliar", async () => {
    const minutos = await leer([pedido({ entregadoAt: new Date(+FECHA + 23 * 60000) })]);
    const justoFuera = await leer([pedido({ entregadoAt: new Date(+FECHA + 1001) })]);
    expect(sinConciliar(minutos)).toBe(false);
    expect(sinConciliar(justoFuera)).toBe(false);
  });
  it("cantidades pedidas distintas de las entregadas: se conserva por conciliar", async () => {
    const h = await leer([pedido({ items: [{ producto: "PACA_AGUA", cantPedido: 8, cantEntrega: 5 }] })]);
    expect(sinConciliar(h)).toBe(false);
  });
  it("con reducción comercial o ajuste de cantidad: se conserva por conciliar", async () => {
    expect(sinConciliar(await leer([pedido({ _count: { ajustesCantidad: 0, reduccionesComerciales: 1 } })]))).toBe(false);
    expect(sinConciliar(await leer([pedido({ _count: { ajustesCantidad: 1, reduccionesComerciales: 0 } })]))).toBe(false);
  });
  it("sin poder comprobar ajustes (lector parcial) no se infiere nada", async () => {
    expect(sinConciliar(await leer([pedido({ _count: undefined })]))).toBe(false);
  });
  it("entrega registrada otro día distinto al de la venta: por conciliar", async () => {
    const h = await leer([pedido({ entregadoAt: new Date(+FECHA + 2 * 86400000) })]);
    expect(sinConciliar(h)).toBe(false);
  });
  it("sin fecha de entrega no se inventa: no hay hecho", async () => {
    expect(await leer([pedido({ entregadoAt: null })])).toEqual([]);
  });
  it("pedido normal (origen PEDIDO) a Domicilio sin evidencia sigue por conciliar", async () => {
    const h = await leer([pedido({ origen: "PEDIDO" })]);
    expect(sinConciliar(h)).toBe(false);
  });
  it("no ENTREGADO por completo no se trata como entrega al vender", async () => {
    const h = await leer([pedido({ estadoEntrega: "PENDIENTE" })]);
    expect(sinConciliar(h)).toBe(false);
  });
  it("con regalos, las cantidades incluyen los regalos entregados", async () => {
    const h = await leer([
      pedido({ items: [{ producto: "PACA_AGUA", cantPedido: 4, cantEntrega: 4, cantRegaloPedido: 1, cantRegaloEntrega: 1 }] }),
    ]);
    expect(h[0].cantidades).toEqual([{ producto: "PACA_AGUA", cantidad: 5 }]);
  });
  it("venta libre en ruta: verificable pero con hora sin verificar", async () => {
    const h = await leer([pedido({ origen: "VENTA_LIBRE", entregadoPorId: null })]);
    expect(sinConciliar(h)).toBe(true);
    expect(h[0]).toMatchObject({ precisionDia: true, repartidorId: null });
  });
  it("regresión: venta de Punto con entregadoAt igual a fecha sigue verificable", async () => {
    const h = await leer([pedido({ canal: "PUNTO", origen: "PEDIDO", entregadoAt: FECHA, entregadoPorId: null, _count: undefined })]);
    expect(sinConciliar(h)).toBe(true);
    expect(h[0].precisionDia).toBe(false);
  });
});

describe("#989 entrega completa anterior a #516 con un único registro", () => {
  const legado = pedido({ origen: "PEDIDO", entregadoAt: new Date("2026-10-28T15:00:00.000Z"), fecha: new Date("2026-10-27T13:00:00.000Z") });
  it("un solo registro completo: cantidades = acumulado, fecha y responsable del registro", async () => {
    const h = await leer([legado], [auditoriaLegada("ENTREGA_OFICINA", false)]);
    expect(h).toHaveLength(1);
    expect(sinConciliar(h)).toBe(true);
    expect(h[0]).toMatchObject({
      repartidorId: RESPONSABLE,
      cantidades: [{ producto: "PACA_AGUA", cantidad: 8 }],
      precisionDia: true, // la oficina registra solo el día: «hora sin verificar»
    });
  });
  it("parcial + completo: no se reparte el acumulado, sigue por conciliar", async () => {
    const h = await leer(
      [legado],
      [auditoriaLegada("ENTREGA_OFICINA", true, "2026-10-27T15:00:00.000Z", 1), auditoriaLegada("ENTREGA_OFICINA", false, "2026-10-28T15:00:00.000Z", 2)],
    );
    expect(sinConciliar(h)).toBe(false);
  });
  it("registro que declara entrega parcial: sigue por conciliar", async () => {
    const h = await leer([pedido({ ...legado, estadoEntrega: "PENDIENTE" })], [auditoriaLegada("ENTREGA_OFICINA", true)]);
    expect(sinConciliar(h)).toBe(false);
  });
  it("acumulado incompleto respecto a lo pedido: sigue por conciliar", async () => {
    const h = await leer(
      [pedido({ ...legado, items: [{ producto: "PACA_AGUA", cantPedido: 8, cantEntrega: 6 }] })],
      [auditoriaLegada("ENTREGA_OFICINA", false)],
    );
    expect(sinConciliar(h)).toBe(false);
  });
  it("con ajuste posterior de cantidad o reducción: sigue por conciliar", async () => {
    const h = await leer(
      [pedido({ ...legado, _count: { ajustesCantidad: 1, reduccionesComerciales: 0 } })],
      [auditoriaLegada("ENTREGA_OFICINA", false)],
    );
    expect(sinConciliar(h)).toBe(false);
  });
  it("lector parcial sin conteos: no se infiere", async () => {
    const h = await leer([pedido({ ...legado, _count: undefined })], [auditoriaLegada("ENTREGA_OFICINA", false)]);
    expect(sinConciliar(h)).toBe(false);
  });
  it("auditoría legada de entrega no oficina completa: también verificable, con hora exacta del registro", async () => {
    const h = await leer([legado], [auditoriaLegada("ENTREGA", false)]);
    expect(sinConciliar(h)).toBe(true);
    expect(h[0].precisionDia).toBe(false);
  });
});
