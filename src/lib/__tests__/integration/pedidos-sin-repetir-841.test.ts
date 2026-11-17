// #841: un pedido que ya se ve en «Pendientes de días anteriores» no se repite en
// «Entregas parciales y de pedidos anteriores»; lo que no está arriba se conserva.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";

const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const antes = (n: number) => {
  const [a, m, d] = HOY.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
};
const en = (dia: string, h: string) => new Date(`${dia}T${h}-05:00`);

async function pedido(
  nombre: string,
  opts: { entregadas: number; estado: "PENDIENTE" | "ENTREGADO"; dia?: string; hora?: string },
) {
  const admin = await getAdminUser();
  const dia = opts.dia ?? antes(1);
  const hora = opts.hora ?? "17:40:00";
  const c = await testPrisma.cliente.create({ data: { nombre, telefono: randomUUID() } });
  const p = await testPrisma.pedido.create({
    data: {
      clienteId: c.id, createdById: admin.id, canal: "DOMICILIO",
      fecha: en(dia, hora), createdAt: en(dia, hora),
      estado: opts.estado, estadoEntrega: opts.estado, estadoPago: "PENDIENTE",
      entregadoAt: opts.estado === "ENTREGADO" ? en(HOY, "00:30:00") : null,
      total: 6900, totalPagado: 0, saldo: 6900,
      items: { create: { producto: "PACA_AGUA", cantPedido: 3, cantEntrega: opts.entregadas, precio: 2300, subtotal: 6900 } },
    },
  });
  if (opts.entregadas > 0)
    await testPrisma.historial.create({
      data: {
        entidad: "Pedido", registroId: p.id, accion: "UPDATE", fecha: en(HOY, "00:30:00"),
        datos: JSON.stringify({
          accion: "ENTREGA_OFICINA",
          consultaEntrega: {
            version: 1, precisionFecha: "INSTANTE", fecha: en(HOY, "00:30:00").toISOString(),
            repartidorId: null, cantidades: [{ producto: "PACA_AGUA", cantidad: opts.entregadas }],
          },
        }),
      },
    });
  return p;
}
const hoy = () => consultarPedidos(leerFiltrosConsulta(new URLSearchParams()), "ADMIN");

describe("#841 — no repetir el pedido pendiente en las entregas", () => {
  beforeEach(async () => { await resetAndSeed(); }, 60000);
  afterAll(disconnect);

  it("el parcial pendiente sale solo en pendientes; el completado hoy, solo en entregas", async () => {
    const parcial = await pedido("Sin repetir parcial", { entregadas: 1, estado: "PENDIENTE" });
    const completo = await pedido("Sin repetir completo", { entregadas: 3, estado: "ENTREGADO" });
    const nada = await pedido("Sin repetir sin entrega", { entregadas: 0, estado: "PENDIENTE" });
    const r = await hoy();
    const pend = (r.arrastrados ?? []).map((p) => p.id);
    const ent = (r.destacadas ?? []).map((d) => d.pedidoId);
    expect(pend).toEqual(expect.arrayContaining([parcial.id, nada.id]));
    expect(pend).not.toContain(completo.id);
    expect(ent).toEqual([completo.id]);
    expect(ent).not.toContain(parcial.id);
    expect(r.destacadasTotal).toBe(1);
  });

  it("si todas las entregas son de pedidos ya visibles arriba, las entregas quedan vacías", async () => {
    await pedido("Solo parcial", { entregadas: 1, estado: "PENDIENTE" });
    const r = await hoy();
    expect(r.destacadas).toEqual([]);
    expect(r.destacadasTotal).toBe(0);
    expect(r.arrastradosTotal).toBe(1);
  });

  it("un parcial pendiente fuera de los 5 mostrados se queda en las entregas", async () => {
    for (let i = 0; i < 5; i++)
      await pedido("Antiguo " + i, { entregadas: 0, estado: "PENDIENTE", dia: antes(3), hora: `0${i + 1}:00:00` });
    const parcial = await pedido("Parcial reciente", { entregadas: 1, estado: "PENDIENTE", dia: antes(1) });
    const r = await hoy();
    expect(r.arrastradosTotal).toBe(6);
    expect((r.arrastrados ?? []).map((p) => p.id)).not.toContain(parcial.id);
    expect((r.destacadas ?? []).map((d) => d.pedidoId)).toContain(parcial.id);
    expect(r.destacadasTotal).toBe(1);
  });

  it("sin pendientes de días anteriores no se quita nada de las entregas", async () => {
    const completo = await pedido("Solo completo", { entregadas: 3, estado: "ENTREGADO" });
    const r = await hoy();
    expect(r.arrastradosTotal).toBe(0);
    expect((r.destacadas ?? []).map((d) => d.pedidoId)).toEqual([completo.id]);
    expect(r.destacadasTotal).toBe(1);
  });

  it("un rango que empieza ayer no trata el pedido de ayer como arrastrado", async () => {
    await pedido("Fuera parcial", { entregadas: 1, estado: "PENDIENTE" });
    const r = await consultarPedidos(
      leerFiltrosConsulta(new URLSearchParams(`desde=${antes(1)}&hasta=${HOY}`)),
      "ADMIN",
    );
    // El rango incluye ayer: el pedido ya está en la lista principal del período, no es
    // «arrastrado» y por eso las entregas no pierden nada por esta regla.
    expect(r.arrastradosTotal ?? 0).toBe(0);
  });
});
