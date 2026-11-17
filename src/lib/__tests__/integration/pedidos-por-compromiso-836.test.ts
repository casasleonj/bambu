// #836 F1 — vistas por FECHA PROMETIDA («paraHoy» / «programados») de la consulta de Pedidos.
// A01/A02/A03/A15/A23/A28: nada se pierde, nada futuro es atraso, anulados no son demanda.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { clasificarCompromiso } from "@/lib/pedidos-compromiso";

const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const dia = (n: number) => {
  const [a, m, d] = HOY.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
const en = (d: string, h = "10:00:00") => new Date(`${d}T${h}-05:00`);

const ids: Record<string, string> = {};
async function crear(clave: string, o: { prometido: Date | null; estado?: "PENDIENTE" | "ENTREGADO" | "CANCELADO" | "ANULADO"; creado?: Date }) {
  const admin = await getAdminUser();
  const c = await testPrisma.cliente.create({ data: { nombre: `C-${clave}`, telefono: randomUUID() } });
  const creado = o.creado ?? en(dia(-3));
  const estado = o.estado ?? "PENDIENTE";
  const p = await testPrisma.pedido.create({
    data: {
      clienteId: c.id, createdById: admin.id, canal: "DOMICILIO", fecha: creado, createdAt: creado,
      estado, estadoEntrega: estado,
      // chk_pedido_estadopago_proyectado: cancelado/anulado ⇒ estadoPago ANULADO.
      estadoPago: estado === "CANCELADO" || estado === "ANULADO" ? "ANULADO" : "PENDIENTE",
      fechaEntrega: o.prometido,
      total: 5000, totalPagado: 0, saldo: 5000,
    },
  });
  ids[clave] = p.id;
}
const vista = async (foco: "paraHoy" | "programados", extra = "") =>
  consultarPedidos(leerFiltrosConsulta(new URLSearchParams(`foco=${foco}${extra}`)), "ADMIN");

describe("#836 F1 — consulta por fecha prometida (Postgres real)", () => {
  beforeAll(async () => {
    await resetAndSeed();
    await crear("hoyCreadoAntes", { prometido: en(dia(0), "16:00:00") }); // A02: creado hace 3 días, para hoy
    await crear("hoyNoche", { prometido: en(dia(0), "22:30:00") }); // A27: noche de Bogotá = mismo día
    await crear("ayerAbierto", { prometido: en(dia(-1)) }); // A03: arrastrado
    await crear("manana", { prometido: en(dia(1)) }); // A01: programado
    await crear("enTresDias", { prometido: en(dia(3)) });
    await crear("sinFecha", { prometido: null });
    await crear("ayerEntregado", { prometido: en(dia(-1)), estado: "ENTREGADO" });
    await crear("hoyAnulado", { prometido: en(dia(0)), estado: "ANULADO" }); // A23
    await crear("futuroCancelado", { prometido: en(dia(2)), estado: "CANCELADO" }); // A23
  });
  afterAll(async () => { await disconnect(); });

  const mios = (r: { pedidos: Array<{ id: string }> }) =>
    new Set(r.pedidos.map((p) => p.id).filter((id) => Object.values(ids).includes(id)));

  it("«paraHoy»: prevista hoy + atrasada abierta; sin futuros, cerrados ni anulados; el creado antes aparece normal", async () => {
    const r = await vista("paraHoy", "&pageSize=100");
    expect(mios(r)).toEqual(new Set([ids.hoyCreadoAntes, ids.hoyNoche, ids.ayerAbierto]));
  });

  it("«programados»: solo futuros abiertos; cancelados y sin fecha no son demanda programada", async () => {
    const r = await vista("programados", "&pageSize=100");
    expect(mios(r)).toEqual(new Set([ids.manana, ids.enTresDias]));
  });

  it("XMOD: el filtro del servidor y clasificarCompromiso coinciden para TODA fila devuelta, y no se duplica ni se pierde ninguna", async () => {
    const [h, p] = await Promise.all([vista("paraHoy", "&pageSize=100"), vista("programados", "&pageSize=100")]);
    for (const x of h.pedidos) expect(["hoy", "arrastrado"]).toContain(clasificarCompromiso({ fechaEntrega: x.fechaEntrega ?? null, estadoEntrega: x.estadoEntrega }, HOY));
    for (const x of p.pedidos) expect(clasificarCompromiso({ fechaEntrega: x.fechaEntrega ?? null, estadoEntrega: x.estadoEntrega }, HOY)).toBe("programado");
    const union = [...h.pedidos, ...p.pedidos].map((x) => x.id);
    expect(new Set(union).size).toBe(union.length);
    expect(h.total + p.total).toBe(union.length);
  });

  it("A15: con pageSize chico el total es el real y la paginación no pierde ni repite filas", async () => {
    const todo = await vista("paraHoy", "&pageSize=100");
    const paginas: string[] = [];
    for (let page = 1; page <= Math.ceil(todo.total / 2); page++)
      paginas.push(...(await vista("paraHoy", `&pageSize=2&page=${page}`)).pedidos.map((x) => x.id));
    expect(paginas).toHaveLength(todo.total);
    expect(new Set(paginas)).toEqual(new Set(todo.pedidos.map((x) => x.id)));
  });

  it("las vistas por compromiso no agregan «arrastrados» ni «entregas anteriores» de la vista por fecha de pedido", async () => {
    const r = await vista("paraHoy");
    expect(r.arrastrados).toBeUndefined();
    expect(r.destacadas).toBeUndefined();
  });

  it("la consulta sin foco sigue igual: por fecha de pedido, el creado hace 3 días no aparece en «hoy»", async () => {
    const r = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams("pageSize=100")), "ADMIN");
    expect(r.pedidos.map((p) => p.id)).not.toContain(ids.hoyCreadoAntes);
  });
});
