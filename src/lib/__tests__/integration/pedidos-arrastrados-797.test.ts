// #927 amplía #797: los pendientes anteriores se integran a la lista Hoy,
// conservando el resumen comercial y las fechas originales.
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
  leerFiltrosConsulta(new URLSearchParams(s ? `${s}&agrupar=` : 'agrupar='), HOY); // #915: contrato sin agrupar (sección aparte)
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

  it("E1/E3: ayer y hoy conviven en una única lista", async () => {
    const ayer = await crear(AYER, { nombre: "Ayer 797 A" });
    const deHoy = await crear(HOY, { nombre: "Hoy 797 A", hora: "09:00:00" });
    const r = await consultarPedidos(hoy(), "ADMIN");
    expect(r.arrastrados).toBeUndefined();
    expect(r.arrastradosIntegrados).toBe(true);
    expect(r.pedidos.map((p) => p.id)).toEqual(expect.arrayContaining([ayer.id, deHoy.id]));
    expect(new Set(r.pedidos.map(p => p.id)).size).toBe(r.pedidos.length);
    expect(r.total).toBe(r.pedidos.length);
  });

  it("no altera la fecha del pedido arrastrado", async () => {
    const ayer = await crear(AYER, { nombre: "Fecha 797" });
    const r = await consultarPedidos(hoy(), "ADMIN");
    const leido = r.pedidos.find((p) => p.id === ayer.id)!;
    expect(new Date(leido.fecha).toISOString()).toBe(en(AYER, "17:40:00").toISOString());
    const db = await testPrisma.pedido.findUniqueOrThrow({ where: { id: ayer.id } });
    expect(db.fecha.toISOString()).toBe(en(AYER, "17:40:00").toISOString());
  });

  it("E10: incluye pendiente, en ruta y no entregado; excluye entregado, anulado y cancelado", async () => {
    // #882: la búsqueda también indexa nombre y teléfono de Cliente.
    // Un UUID aleatorio puede contener "e10" en cualquiera de ambos campos:
    // eso introducía un cuarto pedido en la consulta sin ser regresión ERP.
    // Reproducir los dos caminos con clientes ajenos antes de filtrar estados.
    const telefonoAjeno = `e10${randomUUID()}`;
    const ajeno = await crear(AYER, {
      nombre: `Cliente ajeno a estados ${randomUUID()}`,
      telefono: telefonoAjeno,
    });
    const nombreAjeno = `Cliente con E10 ${randomUUID()}`;
    const ajenoPorNombre = await crear(AYER, { nombre: nombreAjeno });
    const porTelefono = await consultarPedidos({ ...hoy(), search: telefonoAjeno }, "ADMIN");
    const porNombre = await consultarPedidos({ ...hoy(), search: nombreAjeno }, "ADMIN");
    expect(porTelefono.pedidos.map((p) => p.id)).toContain(ajeno.id);
    expect(porNombre.pedidos.map((p) => p.id)).toContain(ajenoPorNombre.id);

    // El marcador incorpora palabras y un UUID; no puede coincidir por azar
    // con un teléfono UUID y aísla esta comprobación de otros fixtures.
    const marcador = `E10 estados ${randomUUID()}`;
    const [pend, ruta, noEnt, entregado, anulado, cancelado] = await Promise.all([
      crear(AYER, { nombre: `${marcador} pend` }),
      crear(AYER, { nombre: `${marcador} ruta`, estadoEntrega: "EN_RUTA" }),
      crear(AYER, { nombre: `${marcador} noent`, estadoEntrega: "NO_ENTREGADO" }),
      crear(AYER, { nombre: `${marcador} entregado`, estadoEntrega: "ENTREGADO" }),
      crear(AYER, { nombre: `${marcador} anulado`, estadoEntrega: "ANULADO" }),
      crear(AYER, { nombre: `${marcador} cancelado`, estadoEntrega: "CANCELADO" }),
    ]);
    const r = await consultarPedidos({ ...hoy(), search: marcador }, "ADMIN");
    const ids = r.pedidos.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([pend.id, ruta.id, noEnt.id]));
    for (const x of [entregado, anulado, cancelado, ajeno, ajenoPorNombre]) expect(ids).not.toContain(x.id);
    expect(r.total).toBe(3);
  });

  it("E2: al entregarlo sale de pendientes y no queda duplicado en ninguna lista de hoy", async () => {
    const p = await crear(AYER, { nombre: "Entrega 797" });
    expect((await consultarPedidos({ ...hoy(), search: "Entrega 797" }, "ADMIN")).total).toBe(1);
    await testPrisma.pedido.update({
      where: { id: p.id },
      data: { estadoEntrega: "ENTREGADO", estado: "ENTREGADO", entregadoAt: en(HOY, "11:54:00") },
    });
    const r = await consultarPedidos({ ...hoy(), search: "Entrega 797" }, "ADMIN");
    expect(r.total).toBe(1);
    // La fecha aproximada conserva visibilidad, PERO no se presenta como entrega verificada.
    const incierta = r.pedidos.find(x => x.id === p.id);
    expect(incierta?.entregaEnPeriodo?.unidades).toBeNull();
    expect(incierta?.entregaEnPeriodo?.porConciliar).toBe(true);
  });

  it("orden: más antiguos primero, sin tope artificial y con total real", async () => {
    for (let i = 0; i < 7; i++)
      await crear(i < 3 ? ANTEAYER : AYER, { nombre: `Tope 797 ${i}`, hora: `0${i + 1}:00:00` });
    const r = await consultarPedidos({ ...hoy(), search: "Tope 797" }, "ADMIN");
    expect(r.total).toBe(7);
    expect(r.arrastrados).toBeUndefined();
    expect(r.pedidos).toHaveLength(7);
    const fechas = r.pedidos.map((p) => +new Date(p.fecha));
    expect(fechas).toEqual([...fechas].sort((a, b) => a - b));
  });

  it("E5/E7: respeta búsqueda y canal de la consulta", async () => {
    const punto = await crear(AYER, { nombre: "Canal 797", canal: "PUNTO" });
    const dom = await crear(AYER, { nombre: "Canal 797", canal: "DOMICILIO" });
    const r = await consultarPedidos({ ...hoy(), search: "Canal 797", canal: ["DOMICILIO"] }, "ADMIN");
    const ids = r.pedidos.map((p) => p.id);
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
    expect(con.total).toBe(sin.total + 1);
  });

  it("repetible: dos lecturas seguidas dan lo mismo", async () => {
    const a = await consultarPedidos(hoy(), "ADMIN");
    const b = await consultarPedidos(hoy(), "ADMIN");
    expect(b.pedidos.map((p) => p.id)).toEqual(a.pedidos.map((p) => p.id));
    expect(b.total).toBe(a.total);
  });
});
