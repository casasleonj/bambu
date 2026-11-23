import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { todayStringBogota } from "@/lib/dates";
import { evidenciaDemanda } from "@/lib/pedidos-cambios-demanda";

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
  estadoEntrega?: "PENDIENTE" | "ENTREGADO" | "ANULADO" | "CANCELADO"; fechaEntrega?: Date;
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
      // Igual que el dominio al cancelar o anular: montos en cero y pago ANULADO (los ítems conservan la demanda).
      estadoPago: o.estadoEntrega === "CANCELADO" || o.estadoEntrega === "ANULADO" ? "ANULADO" : "PENDIENTE",
      ...(o.fechaEntrega ? { fechaEntrega: o.fechaEntrega } : {}),
      total: o.estadoEntrega === "CANCELADO" || o.estadoEntrega === "ANULADO" ? 0 : 1000 * o.demanda,
      totalPagado: 0,
      saldo: o.estadoEntrega === "CANCELADO" || o.estadoEntrega === "ANULADO" ? 0 : 1000 * o.demanda,
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

async function audit(pedidoId: string, hh: string, datos: Record<string, unknown>) {
  await testPrisma.historial.create({
    data: { entidad: "Pedido", registroId: pedidoId, accion: "UPDATE", fecha: fecha(dia, hh), datos: JSON.stringify(datos) },
  });
}

const fila = (r: Awaited<ReturnType<typeof balance>>) => r?.balanceOperativo?.productos.find((p) => p.producto === PRODUCTO);
const cero = { porGestionar: 0, ajustes: 0, entregadasHoy: 0, faltan: 0 };
const grupos = (r: Awaited<ReturnType<typeof balance>>) =>
  fila(r)?.grupos ?? { pedidosHoy: cero, pendientesAnteriores: cero, parcialesAnteriores: cero };
const dif = (a: typeof cero, b: typeof cero) => ({
  porGestionar: a.porGestionar - b.porGestionar,
  ajustes: a.ajustes - b.ajustes,
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
    // Cancelado HOY con evidencia anterior al contrato (solo `estado`): demanda retirada visible como ajuste.
    const cancelLegacy = await pedido({ demanda: 13, entregado: 0, fechaPedido: ayer, estadoEntrega: "CANCELADO" });
    await audit(cancelLegacy.id, "09:30", { motivo: "prueba", estado: "CANCELADO", notaCredito: false });
    // Cancelado HOY con evidencia v1 (`consultaDemanda`).
    const cancelV1 = await pedido({ demanda: 8, entregado: 0, fechaPedido: ayer, estadoEntrega: "CANCELADO" });
    await audit(cancelV1.id, "09:40", {
      motivo: "prueba", modo: "CANCELAR",
      ...evidenciaDemanda("CANCELACION", {
        antes: [{ producto: PRODUCTO, cantidad: 8 }], despues: [{ producto: PRODUCTO, cantidad: 0 }],
      }),
    });
    // Anulación de un pedido ya entregado: no retira demanda pendiente ni cambia el balance.
    const anuladoEntregado = await pedido({ demanda: 4, entregado: 4, fechaPedido: ayer, estadoEntrega: "ANULADO" });
    await audit(anuladoEntregado.id, "09:50", { motivo: "prueba", modo: "ANULAR", ...evidenciaDemanda("ANULACION") });
    // Reducción comercial APLICADA hoy (tabla tipada): 20 → 15.
    const reducido = await pedido({ demanda: 15, entregado: 0, fechaPedido: ayer });
    await testPrisma.pedidoReduccionComercial.create({
      data: {
        pedidoId: reducido.id, producto: PRODUCTO, cantidadReducida: 5, cantPedidoAntes: 20, cantPedidoDespues: 15,
        precio: 1000, monto: 5000, motivo: "prueba", aceptadoPor: "cliente", medio: "TELEFONO",
        estado: "APLICADA", solicitadoPorId: adminId, resueltoAt: fecha(dia, "10:15"),
      },
    });
    // Edición de hoy con evidencia v1: 9 → 6.
    const editado = await pedido({ demanda: 6, entregado: 0, fechaPedido: ayer });
    await audit(editado.id, "10:20", {
      numero: 1, estado: "PENDIENTE", campos: ["items"], antes: {}, despues: {},
      ...evidenciaDemanda("EDICION", {
        antes: [{ producto: PRODUCTO, cantidad: 9 }], despues: [{ producto: PRODUCTO, cantidad: 6 }],
      }),
    });
    // Edición de hoy con evidencia anterior al contrato: se sabe que cambió, no cuánto → por conciliar.
    const editadoLegacy = await pedido({ demanda: 5, entregado: 0, fechaPedido: ayer });
    await audit(editadoLegacy.id, "10:25", { numero: 2, estado: "PENDIENTE", campos: ["items", "total"], antes: {}, despues: {} });
    // Ajuste de cantidad de hoy sobre un pedido de hoy (tabla tipada): 10 → 12.
    const ajustado = await pedido({ demanda: 12, entregado: 0, fechaPedido: dia });
    await testPrisma.pedidoCantidadAjuste.create({
      data: {
        pedidoId: ajustado.id, producto: PRODUCTO, cantidadOriginal: 10, cantidadNueva: 12, delta: 2,
        motivo: "prueba", autorizadoPorId: adminId, createdAt: fecha(dia, "11:30"),
      },
    });

    const despues = (await balance())!;
    const g0 = grupos(antes), g1 = grupos(despues);
    // 107 = A 50 + sin gestionar 7 + cancelados 13 y 8 + reducido 20 + editado 9; ajustes −13 −8 −5 −3.
    expect(dif(g1.pendientesAnteriores, g0.pendientesAnteriores)).toEqual({ porGestionar: 107, ajustes: -29, entregadasHoy: 50, faltan: 28 });
    expect(dif(g1.parcialesAnteriores, g0.parcialesAnteriores)).toEqual({ porGestionar: 10, ajustes: 0, entregadasHoy: 10, faltan: 0 });
    expect(dif(g1.pedidosHoy, g0.pedidosHoy)).toEqual({ porGestionar: 110, ajustes: 2, entregadasHoy: 60, faltan: 52 });
    const t0 = fila(antes)?.total ?? { ...cero };
    expect(dif(fila(despues)!.total, t0)).toEqual({ porGestionar: 227, ajustes: -27, entregadasHoy: 120, faltan: 80 });
    // Identidad por gestionar + ajustes − entregadas = faltan, también en lo que ya había.
    for (const g of Object.values(fila(despues)!.grupos)) expect(g.porGestionar + g.ajustes - g.entregadasHoy).toBe(g.faltan);

    const u0 = antes.balanceOperativo!.pedidosUnicos, u1 = despues.balanceOperativo!.pedidosUnicos;
    expect(u1.total - u0.total).toBe(9); // A, sin gestionar, 2 cancelados, reducido, editado, B, C y ajustado
    const c0 = antes.balanceOperativo!.porConciliar, c1 = despues.balanceOperativo!.porConciliar;
    expect(c1.pedidosSinDesglose - c0.pedidosSinDesglose).toBe(1);
    expect(c1.edicionesSinCantidades - c0.edicionesSinCantidades).toBe(1);

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
