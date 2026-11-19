// #797: los pendientes de días anteriores aparecen como lectura aparte en «Hoy»,
// sin cambiar la lista principal, el resumen ni la fecha de ningún pedido.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";

// La consulta calcula «hoy» con el reloj real (Bogotá); las fechas se derivan de él.
const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const antes = (dias: number) => {
  const [a, m, d] = HOY.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
};
const AYER = antes(1);
const ANTEAYER = antes(2);
const en = (dia: string, h: string) => new Date(`${dia}T${h}-05:00`);
const hoy = (s = "") =>
  leerFiltrosConsulta(new URLSearchParams(s), HOY);
let adminId: string;

async function crear(
  dia: string,
  opts: {
    estadoEntrega?: "PENDIENTE" | "EN_RUTA" | "NO_ENTREGADO" | "ENTREGADO" | "ANULADO" | "CANCELADO";
    nombre?: string;
    telefono?: string;
    canal?: "PUNTO" | "DOMICILIO";
    hora?: string;
  } = {},
) {
  const estadoEntrega = opts.estadoEntrega ?? "PENDIENTE";
  const cliente = await testPrisma.cliente.create({
    data: { nombre: opts.nombre ?? `797 ${randomUUID()}`, telefono: opts.telefono ?? randomUUID() },
  });
  return testPrisma.pedido.create({
    data: {
      clienteId: cliente.id,
      createdById: adminId,
      canal: opts.canal ?? "DOMICILIO",
      fecha: en(dia, opts.hora ?? "17:40:00"),
      createdAt: en(dia, opts.hora ?? "17:40:00"),
      estado: estadoEntrega === "ENTREGADO" ? "ENTREGADO" : estadoEntrega === "ANULADO" ? "ANULADO" : estadoEntrega === "CANCELADO" ? "CANCELADO" : "PENDIENTE",
      estadoEntrega,
      // La restricción de la base exige estadoPago ANULADO en pedidos anulados o cancelados.
      estadoPago: estadoEntrega === "ANULADO" || estadoEntrega === "CANCELADO" ? "ANULADO" : "PENDIENTE",
      total: 6900,
      totalPagado: 0,
      saldo: 6900,
      items: {
        create: {
          producto: "PACA_AGUA",
          cantPedido: 3,
          cantEntrega: estadoEntrega === "ENTREGADO" ? 3 : 0,
          precio: 2300,
          subtotal: 6900,
        },
      },
    },
  });
}

describe("#797 — pendientes de días anteriores en PostgreSQL", () => {
  beforeAll(async () => {
    await resetAndSeed();
    adminId = (await getAdminUser()).id;
  }, 60000);
  afterAll(disconnect);

  it("E1/E3: el pendiente de ayer va aparte y el de hoy se queda en la lista principal", async () => {
    const ayer = await crear(AYER, { nombre: "Ayer 797 A" });
    const deHoy = await crear(HOY, { nombre: "Hoy 797 A", hora: "09:00:00" });
    const r = await consultarPedidos(hoy(), "ADMIN");
    expect(r.arrastrados?.map((p) => p.id)).toContain(ayer.id);
    expect(r.arrastrados?.map((p) => p.id)).not.toContain(deHoy.id);
    expect(r.pedidos.map((p) => p.id)).toContain(deHoy.id);
    // No contamina la lista principal ni su total (contrato de #763).
    expect(r.pedidos.map((p) => p.id)).not.toContain(ayer.id);
    expect(r.total).toBe(r.pedidos.length);
  });

  it("no altera la fecha del pedido arrastrado", async () => {
    const ayer = await crear(AYER, { nombre: "Fecha 797" });
    const r = await consultarPedidos(hoy(), "ADMIN");
    const leido = r.arrastrados!.find((p) => p.id === ayer.id)!;
    expect(new Date(leido.fecha).toISOString()).toBe(en(AYER, "17:40:00").toISOString());
    const db = await testPrisma.pedido.findUniqueOrThrow({ where: { id: ayer.id } });
    expect(db.fecha.toISOString()).toBe(en(AYER, "17:40:00").toISOString());
  });

  it("E10: incluye pendiente, en ruta y no entregado; excluye entregado, anulado y cancelado", async () => {
    // #882: "E10" también puede estar en el teléfono UUID de otro fixture.
    // Probar la colisión explícitamente, sin cambiar la búsqueda del ERP.
    const ajeno = await crear(AYER, {
      nombre: "Cliente ajeno a estados 797",
      telefono: "00000000-e100-4000-8000-000000000001",
    });
    const porTelefono = await consultarPedidos({ ...hoy(), search: "00000000-e100-4000-8000-000000000001" }, "ADMIN");
    expect(porTelefono.arrastrados!.map((p) => p.id)).toContain(ajeno.id);
    const [pend, ruta, noEnt, entregado, anulado, cancelado] = await Promise.all([
      crear(AYER, { nombre: "E10 estados pend" }),
      crear(AYER, { nombre: "E10 estados ruta", estadoEntrega: "EN_RUTA" }),
      crear(AYER, { nombre: "E10 estados noent", estadoEntrega: "NO_ENTREGADO" }),
      crear(AYER, { nombre: "E10 estados entregado", estadoEntrega: "ENTREGADO" }),
      crear(AYER, { nombre: "E10 estados anulado", estadoEntrega: "ANULADO" }),
      crear(AYER, { nombre: "E10 estados cancelado", estadoEntrega: "CANCELADO" }),
    ]);
    const r = await consultarPedidos({ ...hoy(), search: "E10 estados" }, "ADMIN");
    const ids = r.arrastrados!.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([pend.id, ruta.id, noEnt.id]));
    for (const x of [entregado, anulado, cancelado, ajeno]) expect(ids).not.toContain(x.id);
    expect(r.arrastradosTotal).toBe(3);
  });

  it("E2: al entregarlo sale de pendientes y no queda duplicado en ninguna lista de hoy", async () => {
    const p = await crear(AYER, { nombre: "Entrega 797" });
    expect((await consultarPedidos({ ...hoy(), search: "Entrega 797" }, "ADMIN")).arrastradosTotal).toBe(1);
    await testPrisma.pedido.update({
      where: { id: p.id },
      data: { estadoEntrega: "ENTREGADO", estado: "ENTREGADO", entregadoAt: en(HOY, "11:54:00") },
    });
    const r = await consultarPedidos({ ...hoy(), search: "Entrega 797" }, "ADMIN");
    expect(r.arrastradosTotal).toBe(0);
    expect(r.pedidos.map((x) => x.id)).not.toContain(p.id);
  });

  it("orden: más antiguos primero, con tope de 5 y total real", async () => {
    for (let i = 0; i < 7; i++)
      await crear(i < 3 ? ANTEAYER : AYER, { nombre: `Tope 797 ${i}`, hora: `0${i + 1}:00:00` });
    const r = await consultarPedidos({ ...hoy(), search: "Tope 797" }, "ADMIN");
    expect(r.arrastradosTotal).toBe(7);
    expect(r.arrastrados).toHaveLength(5);
    const fechas = r.arrastrados!.map((p) => +new Date(p.fecha));
    expect(fechas).toEqual([...fechas].sort((a, b) => a - b));
  });

  it("E5/E7: respeta búsqueda y canal de la consulta", async () => {
    const punto = await crear(AYER, { nombre: "Canal 797", canal: "PUNTO" });
    const dom = await crear(AYER, { nombre: "Canal 797", canal: "DOMICILIO" });
    const r = await consultarPedidos({ ...hoy(), search: "Canal 797", canal: ["DOMICILIO"] }, "ADMIN");
    const ids = r.arrastrados!.map((p) => p.id);
    expect(ids).toContain(dom.id);
    expect(ids).not.toContain(punto.id);
  });

  it("no aplica fuera de Hoy: fecha de entrega, un día pasado o todas las fechas", async () => {
    await crear(AYER, { nombre: "Fuera 797" });
    for (const q of ["fechaBase=entrega", `desde=${ANTEAYER}&hasta=${ANTEAYER}`, "all=true"]) {
      const r = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams(q), HOY), "ADMIN");
      expect(r.arrastrados).toBeUndefined();
      expect(r.arrastradosTotal).toBeUndefined();
    }
  });

  it("el resumen del día no cuenta los pendientes de ayer (XMOD)", async () => {
    await crear(AYER, { nombre: "Resumen 797" });
    const sin = await consultarPedidos({ ...hoy(), resumen: true }, "ADMIN");
    const total = sin.resumen!.importe;
    await crear(AYER, { nombre: "Resumen 797 b" });
    const con = await consultarPedidos({ ...hoy(), resumen: true }, "ADMIN");
    expect(con.resumen!.importe).toBe(total);
    expect(con.total).toBe(sin.total);
  });

  it("repetible: dos lecturas seguidas dan lo mismo", async () => {
    const a = await consultarPedidos(hoy(), "ADMIN");
    const b = await consultarPedidos(hoy(), "ADMIN");
    expect(b.arrastrados?.map((p) => p.id)).toEqual(a.arrastrados?.map((p) => p.id));
    expect(b.arrastradosTotal).toBe(a.arrastradosTotal);
  });
});
