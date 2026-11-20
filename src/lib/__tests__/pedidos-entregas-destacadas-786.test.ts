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
function transaccion(
  filas: Fila[],
  conAjuste = false,
  reducciones: Array<{ pedidoId: string; resueltoAt: Date | null }> = [],
): Prisma.TransactionClient {
  return {
    pedido: { findMany: vi.fn().mockResolvedValue(filas) },
    pedidoCantidadAjuste: { findMany: vi.fn().mockResolvedValue(conAjuste ? [{ pedidoId: "prueba-786" }] : []) },
    pedidoReduccionComercial: { findMany: vi.fn().mockResolvedValue(reducciones) },
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

describe("#911 — reducción comercial y verificación de la entrega física", () => {
  const rango = {
    desde: new Date("2026-11-19T05:00:00Z"),
    hasta: new Date("2026-11-20T05:00:00Z"),
  };
  const fechaEntrega = new Date("2026-11-19T15:55:50.077Z");
  const entregaVerificada: EntregaConsulta = {
    id: "auditoria-911",
    pedidoId: "prueba-786",
    fecha: fechaEntrega,
    repartidorId: null,
    cantidades: [{ producto: "PACA_AGUA", cantidad: 13 }],
    fuente: "AUDITORIA",
    precisionDia: false,
  };
  const p = {
    ...crearPedido(),
    origen: "PEDIDO" as const,
    fecha: new Date("2026-11-19T14:24:38.753Z"),
    entregadoAt: fechaEntrega,
    items: [{ producto: "PACA_AGUA", cantPedido: 13, cantEntrega: 13 }],
  };
  const reduccion = (resueltoAt: Date | null) => [
    { pedidoId: p.id, resueltoAt },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    leerMock.mockResolvedValue([entregaVerificada]);
  });

  it("regresión: reducción anterior a la primera entrega verificada no duplica una entrega completa del día", async () => {
    // Secuencia real reproducida con datos sintéticos: 10 → 15 → 12 → 13; se entregan 13.
    const tx = transaccion([p], false, reduccion(new Date("2026-11-19T15:54:20.445Z")));
    const result = await listarEntregasDestacadas(tx, {}, rango);

    expect(result).toEqual({ destacadas: [], destacadasTotal: 0, rangoAmplio: false });
    expect(tx.pedidoReduccionComercial.findMany).toHaveBeenCalledWith({
      where: { pedidoId: { in: [p.id] }, estado: "APLICADA" },
      select: { pedidoId: true, resueltoAt: true },
    });
  });

  it("reducción previa + pedido de ayer entregado completo hoy conserva su registro y fecha", async () => {
    const anterior = { ...p, fecha: new Date("2026-11-18T15:00:00Z") };
    const result = await listarEntregasDestacadas(
      transaccion([anterior], false, reduccion(new Date("2026-11-19T14:00:00Z"))),
      {}, rango,
    );
    expect(result.destacadasTotal).toBe(1);
    expect(result.destacadas[0].estadoAlCorte).toBe("PRIMERA_ENTREGA");
    expect(result.destacadas[0].fechaCompletado).toBe("2026-11-19");
    expect(result.destacadas[0].cantidadesDelRango).toEqual([{ producto: "PACA_AGUA", cantidad: 13 }]);
  });

  it.each([
    ["posterior a entrega del mismo día", new Date("2026-11-19T16:00:00Z")],
    ["posterior al corte", new Date("2026-11-20T12:00:00Z")],
    ["sin fecha verificable", null],
    ["exactamente simultánea a la entrega", fechaEntrega],
  ])("mantiene Por conciliar cuando la reducción es %s", async (_caso, fechaReduccion) => {
    const result = await listarEntregasDestacadas(
      transaccion([p], false, reduccion(fechaReduccion)), {}, rango,
    );
    expect(result.destacadasTotal).toBe(1);
    expect(result.destacadas[0].estadoAlCorte).toBe("POR_CONCILIAR");
    expect(result.destacadas[0].fechaCompletado).toBeNull();
  });

  it("una reducción entre la primera entrega parcial y la segunda no inventa una finalización", async () => {
    leerMock.mockResolvedValue([
      { ...entregaVerificada, id: "parte-1", fecha: new Date("2026-11-19T15:50:00Z"), cantidades: [{ producto: "PACA_AGUA", cantidad: 4 }] },
      { ...entregaVerificada, id: "parte-2", cantidades: [{ producto: "PACA_AGUA", cantidad: 9 }] },
    ]);
    const result = await listarEntregasDestacadas(
      transaccion([p], false, reduccion(new Date("2026-11-19T15:54:00Z"))),
      {}, rango,
    );
    expect(result.destacadas[0].estadoAlCorte).toBe("POR_CONCILIAR");
  });

  it.each([
    ["legado sin desglose", { ...entregaVerificada, fuente: "HISTORICO" as const, cantidades: null, incompleto: true }],
    ["precisión de día", { ...entregaVerificada, precisionDia: true }],
    ["evidencia marcada incompleta", { ...entregaVerificada, incompleto: true }],
  ])("no oculta la alerta con %s aunque la reducción fuera anterior", async (_caso, hecho) => {
    leerMock.mockResolvedValue([hecho]);
    const result = await listarEntregasDestacadas(
      transaccion([p], false, reduccion(new Date("2026-11-19T14:00:00Z"))),
      {}, rango,
    );
    expect(result.destacadas[0].estadoAlCorte).toBe("POR_CONCILIAR");
  });

  it("una reducción anterior no tapa discrepancia de producto/cantidad ni ajuste posterior", async () => {
    leerMock.mockResolvedValue([{ ...entregaVerificada, cantidades: [{ producto: "PACA_AGUA", cantidad: 12 }] }]);
    const tx = transaccion([p], false, reduccion(new Date("2026-11-19T14:00:00Z")));
    const parcial = await listarEntregasDestacadas(tx, {}, rango);
    expect(parcial.destacadasTotal).toBe(1);
    expect(parcial.destacadas[0].estadoAlCorte).toBe("PARCIAL");

    leerMock.mockResolvedValue([entregaVerificada]);
    const posterior = await listarEntregasDestacadas(
      transaccion([p], true, reduccion(new Date("2026-11-19T14:00:00Z"))),
      {}, rango,
    );
    expect(posterior.destacadas[0].estadoAlCorte).toBe("POR_CONCILIAR");
  });
});
