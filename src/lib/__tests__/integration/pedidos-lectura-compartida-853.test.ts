// #853 Fase 3 · rendimiento: la consulta de «hoy» lee las entregas del día UNA sola vez y la comparte entre las
// entregas del día, el balance y el dinero. Antes se repetía tres veces dentro de la misma transacción.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("@/lib/unidades-entregadas-dia", async (original) => {
  const real = await original<typeof import("@/lib/unidades-entregadas-dia")>();
  return { ...real, detalleUnidadesEntregadasDelDia: vi.fn(real.detalleUnidadesEntregadasDelDia) };
});

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { detalleUnidadesEntregadasDelDia } from "@/lib/unidades-entregadas-dia";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { leerBalanceOperativoHoy } from "@/lib/pedidos-balance-operativo-hoy.repository";
import { leerEconomiaOperativaHoy } from "@/lib/pedidos-economia-operativa-hoy.repository";
import { todayStringBogota } from "@/lib/dates";

const dia = todayStringBogota();
const fecha = (hh: string) => new Date(`${dia}T${hh}:00-05:00`);
const rango = { desde: fecha("00:00"), hasta: new Date(+fecha("00:00") + 86_400_000) };

describe("#853 · una sola lectura de entregas por consulta", () => {
  beforeAll(async () => {
    await resetAndSeed();
    const admin = await getAdminUser();
    const cliente = await testPrisma.cliente.create({ data: { nombre: `853 compartida ${randomUUID()}`, telefono: randomUUID() } });
    const p = await testPrisma.pedido.create({
      data: {
        clienteId: cliente.id, createdById: admin.id, canal: "DOMICILIO", origen: "PEDIDO", fecha: fecha("09:00"), createdAt: fecha("09:00"),
        estado: "ENTREGADO", estadoEntrega: "ENTREGADO", estadoPago: "PENDIENTE", entregadoAt: fecha("11:00"),
        total: 5000, totalPagado: 0, saldo: 5000,
        items: { create: { producto: "PACA_AGUA", cantPedido: 5, cantEntrega: 5, precio: 1000, subtotal: 5000 } },
      },
    });
    await testPrisma.historial.create({
      data: {
        entidad: "Pedido", registroId: p.id, accion: "UPDATE", fecha: fecha("11:00"),
        datos: JSON.stringify({ accion: "ENTREGA_OFICINA", consultaEntrega: { version: 1, fecha: fecha("11:00").toISOString(), repartidorId: null, eventoEntregaId: null, cantidades: [{ producto: "PACA_AGUA", cantidad: 5 }] } }),
      },
    });
  }, 120000);
  afterAll(disconnect);

  it("una consulta de hoy ejecuta la lectura pesada exactamente una vez", async () => {
    const f = leerFiltrosConsulta(new URLSearchParams({ desde: dia, hasta: dia, resumen: "1" }), dia);
    vi.mocked(detalleUnidadesEntregadasDelDia).mockClear();
    const r = (await consultarPedidos(f, "ADMIN", testPrisma)).resumen!;
    expect(r.balanceOperativo).toBeDefined();
    expect(r.economiaHoy).toBeDefined();
    expect(r.operacionDia).toBeDefined();
    expect(vi.mocked(detalleUnidadesEntregadasDelDia)).toHaveBeenCalledTimes(1);
  }, 60000);

  it("compartir la lectura no cambia ningún resultado respecto de leer cada vez por separado", async () => {
    const f = leerFiltrosConsulta(new URLSearchParams({ desde: dia, hasta: dia, resumen: "1" }), dia);
    const compartida = (await consultarPedidos(f, "ADMIN", testPrisma)).resumen!;
    const aparte = await testPrisma.$transaction(async (tx) => ({
      balance: await leerBalanceOperativoHoy(tx, rango),
      economia: await leerEconomiaOperativaHoy(tx, rango),
    }));
    expect(compartida.balanceOperativo).toEqual(aparte.balance);
    expect(compartida.economiaHoy).toEqual(aparte.economia);
    expect(compartida.economiaHoy!.entregadoHoy).toBe(5000);
    expect(compartida.economiaHoy!.porCobrarDeEso).toBe(5000);
  }, 60000);
});
