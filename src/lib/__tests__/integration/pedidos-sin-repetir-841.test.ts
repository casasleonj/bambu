// #841 + #927: pedidos anteriores pendientes, parciales y completados hoy
// comparten UNA lista con una fila por pedido, sin paneles ni tope de cinco.
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
// #927: la vista general Hoy integra todos los pedidos operativos en la misma consulta.
const hoy = () => consultarPedidos(leerFiltrosConsulta(new URLSearchParams("agrupar=&pageSize=100")), "ADMIN");

describe("#841 — no repetir el pedido pendiente en las entregas", () => {
  beforeEach(async () => { await resetAndSeed(); }, 60000);
  afterAll(disconnect);

  it("un parcial, un pendiente y uno completado hoy aparecen una sola vez en la lista", async () => {
    const parcial = await pedido("Sin repetir parcial", { entregadas: 1, estado: "PENDIENTE" });
    const completo = await pedido("Sin repetir completo", { entregadas: 3, estado: "ENTREGADO" });
    const nada = await pedido("Sin repetir sin entrega", { entregadas: 0, estado: "PENDIENTE" });
    const r = await hoy();
    const visibles = r.pedidos.map((p) => p.id);
    expect(r.actividadIntegrada).toBe(true);
    expect(r.arrastrados).toBeUndefined();
    expect(r.destacadas).toBeUndefined();
    expect(r.total).toBe(3);
    expect(new Set(visibles)).toEqual(new Set([parcial.id, completo.id, nada.id]));
    expect(visibles).toHaveLength(3);
    expect(r.pedidos.find((p) => p.id === parcial.id)?.entregaEnPeriodo?.unidades).toBe(1);
    expect(r.pedidos.find((p) => p.id === completo.id)?.entregaEnPeriodo?.unidades).toBe(3);
    expect(r.pedidos.find((p) => p.id === nada.id)?.entregaEnPeriodo).toBeUndefined();
  });

  it("una entrega parcial pendiente solo aparece como fila operativa", async () => {
    const parcial = await pedido("Solo parcial", { entregadas: 1, estado: "PENDIENTE" });
    const r = await hoy();
    expect(r.pedidos.map((p) => p.id)).toEqual([parcial.id]);
    expect(r.total).toBe(1);
    expect(r.arrastrados).toBeUndefined();
    expect(r.destacadas).toBeUndefined();
    expect(r.pedidos[0].entregaEnPeriodo?.unidades).toBe(1);
  });

  it("los seis pedidos anteriores permanecen en el mismo universo sin tope de cinco", async () => {
    const antiguos: string[] = [];
    for (let i = 0; i < 5; i++) {
      const p = await pedido("Antiguo " + i, { entregadas: 0, estado: "PENDIENTE", dia: antes(3), hora: "0" + (i + 1) + ":00:00" });
      antiguos.push(p.id);
    }
    const parcial = await pedido("Parcial reciente", { entregadas: 1, estado: "PENDIENTE", dia: antes(1) });
    const r = await hoy();
    expect(r.total).toBe(6);
    expect(r.pedidos.map((p) => p.id)).toHaveLength(6);
    expect(new Set(r.pedidos.map((p) => p.id))).toEqual(new Set([...antiguos, parcial.id]));
    expect(r.pedidos.find((p) => p.id === parcial.id)?.entregaEnPeriodo?.unidades).toBe(1);
    expect(r.arrastrados).toBeUndefined();
    expect(r.destacadas).toBeUndefined();
  });

  it("un pedido anterior completado hoy también entra en una única fila", async () => {
    const completo = await pedido("Solo completo", { entregadas: 3, estado: "ENTREGADO" });
    const r = await hoy();
    expect(r.total).toBe(1);
    expect(r.pedidos.map((p) => p.id)).toEqual([completo.id]);
    expect(r.pedidos[0].entregaEnPeriodo?.unidades).toBe(3);
    expect(r.arrastrados).toBeUndefined();
    expect(r.destacadas).toBeUndefined();
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
