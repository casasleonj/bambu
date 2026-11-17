import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";

/**
 * #854 · Un pedido creado el 14-nov y entregado/cobrado el 17-nov NO debe aparecer
 * el 14 al consultar por «Entrega registrada» ni «Cobro registrado», y sí el 17.
 * La fecha del pedido conserva su significado comercial (aparece el 14).
 */
const D14 = "2026-11-14";
const D17 = "2026-11-17";
const en = (dia: string, h: string) => new Date(`${dia}T${h}-05:00`);
const filtros = (dia: string, s = "") =>
  leerFiltrosConsulta(new URLSearchParams(`desde=${dia}&hasta=${dia}&${s}`));

let adminId: string;
let pedidoId: string;
let clienteId: string;

async function crearCaso() {
  const c = await testPrisma.cliente.create({
    data: { nombre: `854 ${randomUUID()}`, telefono: randomUUID() },
  });
  const p = await testPrisma.pedido.create({
    data: {
      clienteId: c.id,
      createdById: adminId,
      canal: "PUNTO",
      fecha: en(D14, "10:00:00"),
      createdAt: en(D14, "10:00:00"),
      estado: "ENTREGADO",
      estadoEntrega: "ENTREGADO",
      estadoPago: "PAGADO",
      entregadoAt: en(D17, "09:30:00"),
      total: 20000,
      totalPagado: 20000,
      saldo: 0,
      items: {
        create: {
          producto: "PACA_HIELO",
          cantPedido: 4,
          cantEntrega: 4,
          precio: 5000,
          subtotal: 20000,
        },
      },
    },
  });
  await testPrisma.historial.create({
    data: {
      entidad: "Pedido",
      registroId: p.id,
      accion: "UPDATE",
      fecha: en(D17, "09:30:00"),
      datos: JSON.stringify({
        accion: "ENTREGA_OFICINA",
        consultaEntrega: {
          version: 1,
          fecha: en(D17, "09:30:00").toISOString(),
          repartidorId: null,
          eventoEntregaId: null,
          cantidades: [{ producto: "PACA_HIELO", cantidad: 4 }],
        },
      }),
    },
  });
  await testPrisma.pago.create({
    data: {
      pedidoId: p.id,
      monto: 20000,
      metodo: "EFECTIVO",
      createdAt: en(D17, "09:35:00"),
      confirmacion: "CONFIRMADO",
    },
  });
  return { p, c };
}

const ids = async (dia: string, s: string) =>
  (await consultarPedidos(filtros(dia, `clienteId=${clienteId}&${s}`), "ADMIN", testPrisma)).pedidos.map((x) => x.id);

describe("#854 — consulta por evento vs creación vs estado actual", () => {
  beforeAll(async () => {
    await resetAndSeed();
    adminId = (await getAdminUser()).id;
    const { p, c } = await crearCaso();
    pedidoId = p.id;
    clienteId = c.id;
  }, 60000);
  afterAll(disconnect);

  it("creación: aparece el 14 y no el 17", async () => {
    expect(await ids(D14, "fechaBase=creacion")).toEqual([pedidoId]);
    expect(await ids(D17, "fechaBase=creacion")).toEqual([]);
  });
  it("fecha del pedido: aparece el 14 y no el 17", async () => {
    expect(await ids(D14, "fechaBase=pedido")).toEqual([pedidoId]);
    expect(await ids(D17, "fechaBase=pedido")).toEqual([]);
  });
  it("entrega registrada: no aparece el 14; sí el 17", async () => {
    expect(await ids(D14, "fechaBase=entrega")).toEqual([]);
    expect(await ids(D17, "fechaBase=entrega")).toEqual([pedidoId]);
  });
  it("cobro registrado: no aparece el 14; sí el 17", async () => {
    expect(await ids(D14, "fechaBase=cobro")).toEqual([]);
    expect(await ids(D17, "fechaBase=cobro")).toEqual([pedidoId]);
  });
  it("evento + canal Punto + estado/pago actual: sigue rigiéndose por el evento", async () => {
    const extra = "canal=PUNTO&estadoEntrega=ENTREGADO&pago=registrado";
    expect(await ids(D14, `fechaBase=entrega&${extra}`)).toEqual([]);
    expect(await ids(D14, `fechaBase=cobro&${extra}`)).toEqual([]);
    expect(await ids(D17, `fechaBase=entrega&${extra}`)).toEqual([pedidoId]);
    expect(await ids(D17, `fechaBase=cobro&${extra}`)).toEqual([pedidoId]);
  });
  it("Punto + Entregadas con la base por defecto rige por la fecha de entrega: fuera el 14, dentro el 17", async () => {
    const e = "canal=PUNTO&estadoEntrega=ENTREGADO";
    expect(await ids(D14, e)).toEqual([]);
    expect(await ids(D17, e)).toEqual([pedidoId]);
    const r = await consultarPedidos(filtros(D14, `clienteId=${clienteId}&${e}`), "ADMIN", testPrisma);
    expect(r.destacadas).toBeUndefined();
  });
  it("Punto + Entregadas + pago registrado también se rige por la entrega, no por la fecha del pedido", async () => {
    const e = "fechaBase=pedido&estadoEntrega=ENTREGADO&pago=registrado";
    expect(await ids(D14, e)).toEqual([]);
    expect(await ids(D17, e)).toEqual([pedidoId]);
  });
  it("«Entregado» mezclado con otros estados, o con Creación, conserva la base elegida (no cambia otros filtros)", async () => {
    expect(await ids(D14, "estadoEntrega=ENTREGADO&estadoEntrega=PENDIENTE")).toEqual([pedidoId]);
    expect(await ids(D17, "estadoEntrega=ENTREGADO&estadoEntrega=PENDIENTE")).toEqual([]);
    expect(await ids(D14, "fechaBase=creacion&estadoEntrega=ENTREGADO")).toEqual([pedidoId]);
    expect(await ids(D17, "fechaBase=creacion&estadoEntrega=ENTREGADO")).toEqual([]);
  });
  it("sin Entregado la base por defecto sigue siendo la fecha del pedido", async () => {
    expect(await ids(D14, "canal=PUNTO")).toEqual([pedidoId]);
    expect(await ids(D17, "canal=PUNTO")).toEqual([]);
  });
  it("el resumen y las secciones respetan el alcance del 14", async () => {
    const r = await consultarPedidos(
      filtros(D14, `clienteId=${clienteId}&fechaBase=entrega&resumen=1`),
      "ADMIN",
      testPrisma,
    );
    expect(r.total).toBe(0);
    expect(r.resumen?.productos).toEqual([]);
    expect(r.destacadas).toBeUndefined();
    const c = await consultarPedidos(
      filtros(D14, `clienteId=${clienteId}&fechaBase=cobro&resumen=1`),
      "ADMIN",
      testPrisma,
    );
    expect(c.total).toBe(0);
    expect(c.resumen?.cobros?.subtotalRegistrado).toBe(0);
  });
  it("caso sintético: 60 creadas el 14, 20 entregadas el 15, 40 el 16, cobro el 17; sin atribuir nada al 14 ni duplicar", async () => {
    const c = await testPrisma.cliente.create({ data: { nombre: `854s ${randomUUID()}`, telefono: randomUUID() } });
    const p = await testPrisma.pedido.create({
      data: {
        clienteId: c.id, createdById: adminId, canal: "PUNTO",
        fecha: en(D14, "10:00:00"), createdAt: en(D14, "10:00:00"),
        estado: "ENTREGADO", estadoEntrega: "ENTREGADO", estadoPago: "PAGADO",
        entregadoAt: en("2026-11-16", "10:00:00"),
        total: 138000, totalPagado: 138000, saldo: 0,
        items: { create: { producto: "PACA_HIELO", cantPedido: 60, cantEntrega: 60, precio: 2300, subtotal: 138000 } },
      },
    });
    for (const [dia, n] of [["2026-11-15", 20], ["2026-11-16", 40]] as const)
      await testPrisma.historial.create({
        data: {
          entidad: "Pedido", registroId: p.id, accion: "UPDATE", fecha: en(dia, "10:00:00"),
          datos: JSON.stringify({ accion: "ENTREGA_OFICINA", consultaEntrega: { version: 1, fecha: en(dia, "10:00:00").toISOString(), repartidorId: null, eventoEntregaId: null, cantidades: [{ producto: "PACA_HIELO", cantidad: n }] } }),
        },
      });
    await testPrisma.pago.create({ data: { pedidoId: p.id, monto: 138000, metodo: "EFECTIVO", createdAt: en(D17, "09:00:00"), confirmacion: "CONFIRMADO" } });
    const q = async (dia: string, extra: string) =>
      consultarPedidos(filtros(dia, `clienteId=${c.id}&resumen=1&${extra}`), "ADMIN", testPrisma);
    const entregadas = async (dia: string) => {
      const r = await q(dia, "canal=PUNTO&estadoEntrega=ENTREGADO");
      return { n: r.pedidos.length, unidades: r.resumen?.productos.map((x) => x.entregadas) ?? [] };
    };
    expect(await entregadas(D14)).toEqual({ n: 0, unidades: [] });
    expect(await entregadas("2026-11-15")).toEqual({ n: 1, unidades: [20] });
    expect(await entregadas("2026-11-16")).toEqual({ n: 1, unidades: [40] });
    expect(await entregadas(D17)).toEqual({ n: 0, unidades: [] });
    // Mismo resultado que elegir «Entrega registrada» (equivalencia con el modo explícito).
    for (const d of [D14, "2026-11-15", "2026-11-16", D17]) {
      const a = await q(d, "canal=PUNTO&estadoEntrega=ENTREGADO");
      const b = await q(d, "canal=PUNTO&estadoEntrega=ENTREGADO&fechaBase=entrega");
      expect(a.pedidos.map((x) => x.id)).toEqual(b.pedidos.map((x) => x.id));
      expect(a.resumen?.productos).toEqual(b.resumen?.productos);
    }
    // El cobro sigue atribuido al 17 y solo al 17.
    for (const d of [D14, "2026-11-15", "2026-11-16"])
      expect((await q(d, "fechaBase=cobro")).total).toBe(0);
    const c17 = await q(D17, "fechaBase=cobro");
    expect(c17.total).toBe(1);
    expect(c17.resumen?.cobros?.subtotalRegistrado).toBe(138000);
  });
});
