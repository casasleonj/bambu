import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { todayStringBogota } from "@/lib/dates";

const dia = todayStringBogota();
const fecha = (diaLocal: string, hh: string) => new Date(`${diaLocal}T${hh}:00-05:00`);
const ayer = new Date(+fecha(dia, "12:00") - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const filtros = (extra = "") => {
  const p = new URLSearchParams({ desde: dia, hasta: dia, resumen: "1" });
  for (const [k, v] of new URLSearchParams(extra)) p.set(k, v);
  return leerFiltrosConsulta(p, dia);
};

let adminId: string;

async function pedido(cantidad: number, fechaPedido: string) {
  const cliente = await testPrisma.cliente.create({
    data: { nombre: `853 ${randomUUID()}`, telefono: randomUUID() },
  });
  return testPrisma.pedido.create({
    data: {
      clienteId: cliente.id,
      createdById: adminId,
      canal: "DOMICILIO",
      fecha: fecha(fechaPedido, "09:00"),
      createdAt: fecha(fechaPedido, "09:00"),
      estado: "ENTREGADO",
      estadoEntrega: "ENTREGADO",
      estadoPago: "PAGADO",
      entregadoAt: fecha(dia, "12:00"),
      total: 2500 * cantidad,
      totalPagado: 2500 * cantidad,
      saldo: 0,
      items: {
        create: {
          producto: "PACA_AGUA",
          cantPedido: cantidad,
          cantEntrega: cantidad,
          precio: 2500,
          subtotal: 2500 * cantidad,
        },
      },
    },
  });
}

async function evento(id: string, d: string, hh: string, cantidad: number) {
  return testPrisma.historial.create({
    data: {
      entidad: "Pedido",
      registroId: id,
      accion: "UPDATE",
      fecha: fecha(d, hh),
      datos: JSON.stringify({
        accion: "ENTREGA_OFICINA",
        consultaEntrega: {
          version: 1,
          fecha: fecha(d, hh).toISOString(),
          repartidorId: null,
          eventoEntregaId: null,
          cantidades: [{ producto: "PACA_AGUA", cantidad }],
        },
      }),
    },
  });
}

describe("#853 · totales físicos de Hoy en PostgreSQL", () => {
  beforeAll(async () => {
    await resetAndSeed();
    adminId = (await getAdminUser()).id;
  }, 60000);
  afterAll(disconnect);

  it("suma las 10 unidades previas entregadas hoy sin sumarlas a la cohorte de pedidos de hoy", async () => {
    const antes = (await consultarPedidos(filtros(), "ADMIN", testPrisma)).resumen!;
    const filtroAyer = leerFiltrosConsulta(new URLSearchParams({
      desde: ayer, hasta: ayer, resumen: "1",
    }), dia);
    const antesAyer = (await consultarPedidos(filtroAyer, "ADMIN", testPrisma)).resumen!;
    const hoy = await pedido(5, dia);
    const anterior = await pedido(12, ayer);
    await evento(hoy.id, dia, "10:00", 5);
    await evento(anterior.id, ayer, "15:00", 2);
    await evento(anterior.id, dia, "12:00", 10);

    const despues = (await consultarPedidos(filtros(), "ADMIN", testPrisma)).resumen!;
    const despuesAyer = (await consultarPedidos(filtroAyer, "ADMIN", testPrisma)).resumen!;
    expect(despuesAyer.operacionDia!.total - antesAyer.operacionDia!.total).toBe(2);
    expect(despuesAyer.operacionDia!.productos.find(p => p.producto === "PACA_AGUA")?.dePedidosFecha).toBeGreaterThanOrEqual(2);
    expect(despuesAyer.productos.find(p => p.producto === "PACA_AGUA")?.entregadas).toBeGreaterThanOrEqual(12);
    const agua = (r: typeof despues) => r.operacionDia?.productos.find(p => p.producto === "PACA_AGUA");
    expect(despues.operacionDia!.total - antes.operacionDia!.total).toBe(15);
    expect((agua(despues)?.dePedidosFecha ?? 0) - (agua(antes)?.dePedidosFecha ?? 0)).toBe(5);
    expect((agua(despues)?.dePedidosAnteriores ?? 0) - (agua(antes)?.dePedidosAnteriores ?? 0)).toBe(10);
    expect((despues.productos.find(p => p.producto === "PACA_AGUA")?.entregadas ?? 0) -
      (antes.productos.find(p => p.producto === "PACA_AGUA")?.entregadas ?? 0)).toBe(5);

    const filtrado = await consultarPedidos(filtros("canal=PUNTO"), "ADMIN", testPrisma);
    expect(filtrado.resumen?.operacionDia).toBeUndefined();
    const historico = await consultarPedidos(filtros("fechaBase=entrega"), "ADMIN", testPrisma);
    expect(historico.resumen?.operacionDia).toBeUndefined();
  }, 60000);
});
