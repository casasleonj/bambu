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
  it("fecha del pedido + estado actual entregado/pagado: aparece el 14 (estado actual, no evento)", async () => {
    expect(
      await ids(D14, "fechaBase=pedido&estadoEntrega=ENTREGADO&pago=registrado"),
    ).toEqual([pedidoId]);
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
});
