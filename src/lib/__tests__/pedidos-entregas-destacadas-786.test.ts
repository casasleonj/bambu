import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leerEntregasConsulta, type EntregaConsulta } from "../entregas-consulta";
import { listarEntregasDestacadas } from "../pedidos-entregas-destacadas";

vi.mock("../entregas-consulta", () => ({
  leerEntregasConsulta: vi.fn(),
}));

const leerMock = vi.mocked(leerEntregasConsulta);
const dia = {
  desde: new Date("2026-11-12T05:00:00Z"),
  hasta: new Date("2026-11-13T05:00:00Z"),
};
const fechaPedido = new Date("2026-11-12T12:36:08Z");
const evidenciaSintetica: EntregaConsulta = {
  id: "historico:prueba-786",
  pedidoId: "prueba-786",
  fecha: fechaPedido,
  repartidorId: null,
  cantidades: null,
  fuente: "HISTORICO",
  precisionDia: true,
  incompleto: true,
};
const crearPedido = () => ({
  id: "prueba-786",
  numero: 987,
  fecha: fechaPedido,
  origen: "VENTA_RAPIDA" as "VENTA_RAPIDA" | "PEDIDO",
  estadoEntrega: "ENTREGADO" as const,
  entregadoAt: fechaPedido,
  cliente: { nombre: "Prueba", apellido: null },
  negocio: null,
  items: [{ producto: "PACA_AGUA", cantPedido: 4, cantEntrega: 4 }],
  cPacaAguaPed: 0,
  cPacaAguaEnt: 0,
  cPacaHieloPed: 0,
  cPacaHieloEnt: 0,
  cBotellonFabPed: 0,
  cBotellonFabEnt: 0,
  cBotellonDomPed: 0,
  cBotellonDomEnt: 0,
  cBolsaAguaPed: 0,
  cBolsaAguaEnt: 0,
  cBolsaHieloPed: 0,
  cBolsaHieloEnt: 0,
});
type Fila = ReturnType<typeof crearPedido>;
function transaccion(filas: Fila[], conAjuste = false): Prisma.TransactionClient {
  return {
    pedido: { findMany: vi.fn().mockResolvedValue(filas) },
    pedidoCantidadAjuste: { findMany: vi.fn().mockResolvedValue(conAjuste ? [{ pedidoId: "prueba-786" }] : []) },
    pedidoReduccionComercial: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as Prisma.TransactionClient;
}

describe("#786 — vista complementaria de pedidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leerMock.mockResolvedValue([evidenciaSintetica]);
  });

  it("no muestra ni cuenta la venta rápida normal entregada el mismo día", async () => {
    const r = await listarEntregasDestacadas(transaccion([crearPedido()]), {}, dia);
    expect(r).toEqual({ destacadas: [], destacadasTotal: 0, rangoAmplio: false });
    expect(leerMock).toHaveBeenCalledTimes(2);
  });

  it("conserva por conciliar un pedido no inmediato con historial incompleto", async () => {
    const p = crearPedido();
    const r = await listarEntregasDestacadas(
      transaccion([{ ...p, origen: "PEDIDO" }]),
      {}, dia,
    );
    expect(r.destacadasTotal).toBe(1);
    expect(r.destacadas[0].estadoAlCorte).toBe("POR_CONCILIAR");
  });

  it("conserva venta rápida creada el día anterior y entregada hoy", async () => {
    const p = crearPedido();
    const r = await listarEntregasDestacadas(
      transaccion([{ ...p, fecha: new Date("2026-11-11T16:00:00Z") }]),
      {}, dia,
    );
    expect(r.destacadasTotal).toBe(1);
    expect(r.destacadas[0].pedidoAnterior).toBe(true);
  });

  it("conserva cantidades discrepantes o un ajuste de cantidad", async () => {
    const p = crearPedido();
    const incompleta = await listarEntregasDestacadas(
      transaccion([{ ...p, items: [{ producto: "PACA_AGUA", cantPedido: 4, cantEntrega: 3 }] }]),
      {}, dia,
    );
    expect(incompleta.destacadasTotal).toBe(1);
    const ajustada = await listarEntregasDestacadas(transaccion([p], true), {}, dia);
    expect(ajustada.destacadasTotal).toBe(1);
    expect(ajustada.destacadas[0].estadoAlCorte).toBe("POR_CONCILIAR");
  });

  it("conserva el aviso si hay una auditoría de entrega adicional sin desglose", async () => {
    leerMock.mockResolvedValue([
      evidenciaSintetica,
      {
        ...evidenciaSintetica, id: "auditoria-incompleta", fuente: "HISTORICO",
        fecha: new Date("2026-11-12T13:00:00Z"),
      },
    ]);
    const r = await listarEntregasDestacadas(transaccion([crearPedido()]), {}, dia);
    expect(r.destacadasTotal).toBe(1);
    expect(r.destacadas[0].estadoAlCorte).toBe("POR_CONCILIAR");
  });
});
