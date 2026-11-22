import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { todayStringBogota } from "@/lib/dates";

const dia = todayStringBogota();
const fecha = (diaLocal: string, hh: string) => new Date(`${diaLocal}T${hh}:00-05:00`);
const ayer = new Date(+fecha(dia, "12:00") - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const manana = new Date(+fecha(dia, "12:00") + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const PRODUCTO = "PACA_HIELO";
const filtros = (extra = "") => {
  const p = new URLSearchParams({ desde: dia, hasta: dia, resumen: "1" });
  for (const [k, v] of new URLSearchParams(extra)) p.set(k, v);
  return leerFiltrosConsulta(p, dia);
};
const balance = async (extra = "") => (await consultarPedidos(filtros(extra), "ADMIN", testPrisma)).resumen;

let adminId: string;

async function pedido(o: {
  demanda: number; entregado: number; fechaPedido: string;
  estadoEntrega?: "PENDIENTE" | "ENTREGADO" | "ANULADO"; fechaEntrega?: Date;
}) {
  const cliente = await testPrisma.cliente.create({ data: { nombre: `853b ${randomUUID()}`, telefono: randomUUID() } });
  return testPrisma.pedido.create({
    data: {
      clienteId: cliente.id,
      createdById: adminId,
      canal: "DOMICILIO",
      fecha: fecha(o.fechaPedido, "09:00"),
      createdAt: fecha(o.fechaPedido, "09:00"),
      estado: "PENDIENTE",
      estadoEntrega: o.estadoEntrega ?? (o.entregado >= o.demanda ? "ENTREGADO" : "PENDIENTE"),
      estadoPago: "PENDIENTE",
      ...(o.fechaEntrega ? { fechaEntrega: o.fechaEntrega } : {}),
      total: 1000 * o.demanda,
      totalPagado: 0,
      saldo: 1000 * o.demanda,
      items: {
        create: {
          producto: PRODUCTO, cantPedido: o.demanda, cantEntrega: o.entregado,
          precio: 1000, subtotal: 1000 * o.demanda,
        },
      },
    },
  });
}

async function evento(id: string, d: string, hh: string, cantidad: number) {
  await testPrisma.historial.create({
    data: {
      entidad: "Pedido", registroId: id, accion: "UPDATE", fecha: fecha(d, hh),
      datos: JSON.stringify({
        accion: "ENTREGA_OFICINA",
        consultaEntrega: {
          version: 1, fecha: fecha(d, hh).toISOString(), repartidorId: null, eventoEntregaId: null,
          cantidades: [{ producto: PRODUCTO, cantidad }],
        },
      }),
    },
  });
}

const fila = (r: Awaited<ReturnType<typeof balance>>) => r?.balanceOperativo?.productos.find((p) => p.producto === PRODUCTO);
const cero = { porGestionar: 0, entregadasHoy: 0, faltan: 0 };
const grupos = (r: Awaited<ReturnType<typeof balance>>) =>
  fila(r)?.grupos ?? { pedidosHoy: cero, pendientesAnteriores: cero, parcialesAnteriores: cero };
const dif = (a: typeof cero, b: typeof cero) => ({
  porGestionar: a.porGestionar - b.porGestionar,
  entregadasHoy: a.entregadasHoy - b.entregadasHoy,
  faltan: a.faltan - b.faltan,
});

describe("#853 Fase 1 · balance operativo de hoy en PostgreSQL", () => {
  beforeAll(async () => {
    await resetAndSeed();
    adminId = (await getAdminUser()).id;
  }, 60000);
  afterAll(disconnect);

  it("ejemplo del PO (A, B, C) más los casos adversariales sembrados", async () => {
    const antes = (await balance())!;
    expect(antes.balanceOperativo).toBeDefined();

    // A: ayer pidió 50 sin entrega; hoy recibe 50.
    const A = await pedido({ demanda: 50, entregado: 50, fechaPedido: ayer });
    await evento(A.id, dia, "10:00", 50);
    // B: ayer pidió 40, recibió 30 ayer y 10 hoy.
    const B = await pedido({ demanda: 40, entregado: 40, fechaPedido: ayer });
    await evento(B.id, ayer, "15:00", 30);
    await evento(B.id, dia, "11:00", 10);
    // C: hoy pide 100 y recibe 60.
    const C = await pedido({ demanda: 100, entregado: 60, fechaPedido: dia });
    await evento(C.id, dia, "12:00", 60);
    // Pendiente anterior sin gestionar hoy: sigue en la cola.
    await pedido({ demanda: 7, entregado: 0, fechaPedido: ayer });
    // Compromiso futuro no exigible: no es cola de hoy.
    await pedido({ demanda: 9, entregado: 0, fechaPedido: ayer, fechaEntrega: fecha(manana, "10:00") });
    // Anterior ya completo ayer: no es trabajo de hoy.
    const completo = await pedido({ demanda: 11, entregado: 11, fechaPedido: ayer });
    await evento(completo.id, ayer, "16:00", 11);
    // Anterior con entregas sin desglose por día fiable: por conciliar, sin atribuirlo.
    await pedido({ demanda: 20, entregado: 5, fechaPedido: ayer });
    // Anterior anulado hoy: se informa, no se inventan unidades.
    const anulado = await pedido({ demanda: 13, entregado: 0, fechaPedido: ayer, estadoEntrega: "ANULADO" });
    await testPrisma.historial.create({
      data: {
        entidad: "Pedido", registroId: anulado.id, accion: "UPDATE", fecha: fecha(dia, "09:30"),
        datos: JSON.stringify({ motivo: "prueba", estado: "ANULADO" }),
      },
    });

    const despues = (await balance())!;
    const g0 = grupos(antes), g1 = grupos(despues);
    expect(dif(g1.pendientesAnteriores, g0.pendientesAnteriores)).toEqual({ porGestionar: 57, entregadasHoy: 50, faltan: 7 });
    expect(dif(g1.parcialesAnteriores, g0.parcialesAnteriores)).toEqual({ porGestionar: 10, entregadasHoy: 10, faltan: 0 });
    expect(dif(g1.pedidosHoy, g0.pedidosHoy)).toEqual({ porGestionar: 100, entregadasHoy: 60, faltan: 40 });
    const t0 = fila(antes)?.total ?? cero;
    expect(dif(fila(despues)!.total, t0)).toEqual({ porGestionar: 167, entregadasHoy: 120, faltan: 47 });

    const u0 = antes.balanceOperativo!.pedidosUnicos, u1 = despues.balanceOperativo!.pedidosUnicos;
    expect(u1.total - u0.total).toBe(4); // A, B, C y el pendiente sin gestionar
    const c0 = antes.balanceOperativo!.porConciliar, c1 = despues.balanceOperativo!.porConciliar;
    expect(c1.pedidosSinDesglose - c0.pedidosSinDesglose).toBe(1);
    expect(c1.anuladosAnterioresHoy - c0.anuladosAnterioresHoy).toBe(1);

    // XMOD: las entregas físicas de hoy siguen saliendo de la misma fuente que Dashboard y Cierre.
    const fisico = (r: typeof despues) => r.operacionDia!.productos.find((p) => p.producto === PRODUCTO)?.entregadasHoy ?? 0;
    expect(fisico(despues) - fisico(antes)).toBe(120);
    expect(fila(despues)!.total.entregadasHoy - (fila(antes)?.total.entregadasHoy ?? 0)).toBe(fisico(despues) - fisico(antes));

    // Idempotencia: leer dos veces no cambia nada.
    expect((await balance())!.balanceOperativo).toEqual(despues.balanceOperativo);
  }, 90000);

  it("solo existe para HOY y sin filtros adicionales: nunca cambia de significado en silencio", async () => {
    expect((await balance("canal=PUNTO"))!.balanceOperativo).toBeUndefined();
    expect((await balance("fechaBase=entrega"))!.balanceOperativo).toBeUndefined();
    const historico = await consultarPedidos(
      leerFiltrosConsulta(new URLSearchParams({ desde: ayer, hasta: ayer, resumen: "1" }), dia),
      "ADMIN", testPrisma,
    );
    expect(historico.resumen!.balanceOperativo).toBeUndefined();
    expect(historico.resumen!.operacionDia).toBeDefined(); // lo ya entregado de #853 se conserva
  }, 60000);
});
