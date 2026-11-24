import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { calcularComisionRepartidor } from "@/lib/comision-repartidor";
import { endOfDayBogota, startOfDayBogota, todayStringBogota } from "@/lib/dates";

/**
 * #989 · «Entrega por conciliar» falso: venta en ruta (Domicilio) entregada al vender y entregas
 * completas anteriores a #516 con un único registro. Postgres real; mira la fila que ve el usuario
 * y comprueba que la comisión del repartidor no cambia ni se bloquea.
 */
const HOY = todayStringBogota();
const TARIFA = { agua: 400, hielo: 400, botellon: 400 };
let adminId: string;
let repartidorId: string;

const filtros = (s = "") => leerFiltrosConsulta(new URLSearchParams(`desde=${HOY}&hasta=${HOY}&${s}`));
async function crear(opts: {
  origen: "VENTA_RAPIDA" | "PEDIDO" | "VENTA_LIBRE";
  canal?: "PUNTO" | "DOMICILIO";
  cantEntrega?: number;
  responsable?: boolean;
  /** milisegundos entre `fecha` y `entregadoAt` */
  desfase?: number;
  repartidor?: string;
}) {
  const c = await testPrisma.cliente.create({ data: { nombre: `989 ${randomUUID()}`, telefono: randomUUID() } });
  const fecha = new Date();
  const p = await testPrisma.pedido.create({
    data: {
      clienteId: c.id, createdById: adminId, canal: opts.canal ?? "DOMICILIO", origen: opts.origen,
      fecha, createdAt: fecha, estado: "ENTREGADO", estadoEntrega: "ENTREGADO", estadoPago: "PAGADO",
      entregadoAt: new Date(+fecha + (opts.desfase ?? 1)),
      entregadoPorId: opts.responsable === false ? null : (opts.repartidor ?? repartidorId),
      total: 40000, totalPagado: 40000, saldo: 0,
      cPacaAguaPed: 8, cPacaAguaEnt: opts.cantEntrega ?? 8, // columnas legadas, como en los pedidos reales
      items: { create: { producto: "PACA_AGUA", cantPedido: 8, cantEntrega: opts.cantEntrega ?? 8, precio: 5000, subtotal: 40000 } },
    },
  });
  return { c, p };
}
const auditoriaLegada = (pedidoId: string, parcial: boolean, n: number) =>
  testPrisma.historial.create({
    data: {
      entidad: "Pedido", registroId: pedidoId, accion: "UPDATE", fecha: new Date(Date.now() + n),
      datos: JSON.stringify({
        accion: "ENTREGA_OFICINA", estadoEntrega: parcial ? "PENDIENTE" : "ENTREGADO", parcial,
        repartidorId, fechaEntrega: new Date().toISOString(),
      }),
    },
  });
const fila = async (clienteId: string, id: string) =>
  (await consultarPedidos(filtros(`clienteId=${clienteId}`), "ADMIN", testPrisma)).pedidos.find((x) => x.id === id);

describe("#989 — falso «Entrega por conciliar» (Postgres real)", () => {
  beforeAll(async () => {
    await resetAndSeed();
    adminId = (await getAdminUser()).id;
    repartidorId = (
      await testPrisma.trabajador.create({
        data: { nombre: "Repartidor 989", rol: "REPARTIDOR", usaMoto: true, tipoPago: "COMISION", comRepartAgua: 400, comRepartHielo: 400 },
      })
    ).id;
  });
  afterAll(disconnect);

  it("venta en ruta a Domicilio con responsable: «Entregado hoy» con sus unidades", async () => {
    const { c, p } = await crear({ origen: "VENTA_RAPIDA" });
    const f = await fila(c.id, p.id);
    expect(f?.entregaEnPeriodo).toEqual({ porConciliar: false, unidades: 8 });
    const r = await consultarPedidos(filtros(`clienteId=${c.id}&resumen=1&canal=DOMICILIO&estadoEntrega=ENTREGADO`), "ADMIN", testPrisma);
    expect(r.resumen?.entregasPorConciliar).toBe(0);
  });
  it("el caso real de 1 ms de diferencia se resuelve igual que el de 0 ms", async () => {
    const a = await crear({ origen: "VENTA_RAPIDA", desfase: 0 });
    const b = await crear({ origen: "VENTA_RAPIDA", desfase: 1 });
    expect((await fila(a.c.id, a.p.id))?.entregaEnPeriodo?.porConciliar).toBe(false);
    expect((await fila(b.c.id, b.p.id))?.entregaEnPeriodo?.porConciliar).toBe(false);
  });
  it("adversarial: entrega registrada 23 minutos después, entrega parcial o con reducción siguen por conciliar", async () => {
    const tarde = await crear({ origen: "VENTA_RAPIDA", desfase: 23 * 60000 });
    expect((await fila(tarde.c.id, tarde.p.id))?.entregaEnPeriodo?.porConciliar).toBe(true);
    const parcial = await crear({ origen: "VENTA_RAPIDA", cantEntrega: 5 });
    expect((await fila(parcial.c.id, parcial.p.id))?.entregaEnPeriodo?.porConciliar).toBe(true);
    const ajustada = await crear({ origen: "VENTA_RAPIDA" });
    await testPrisma.pedidoCantidadAjuste.create({
      data: {
        pedidoId: ajustada.p.id, producto: "PACA_AGUA", cantidadOriginal: 8, cantidadNueva: 8, delta: 0,
        motivo: "prueba #989", autorizadoPorId: adminId,
      },
    });
    expect((await fila(ajustada.c.id, ajustada.p.id))?.entregaEnPeriodo?.porConciliar).toBe(true);
  });
  it("un pedido normal a Domicilio sin ninguna evidencia sigue por conciliar", async () => {
    const { c, p } = await crear({ origen: "PEDIDO" });
    expect((await fila(c.id, p.id))?.entregaEnPeriodo?.porConciliar).toBe(true);
  });
  it("venta libre en ruta: verificable pero con hora sin verificar", async () => {
    const { c, p } = await crear({ origen: "VENTA_LIBRE", responsable: false, desfase: 0 });
    const f = await fila(c.id, p.id);
    expect(f?.entregaEnPeriodo).toEqual({ porConciliar: false, unidades: 8 });
    expect(f?.entregaHoraVerificable).toBe(false);
  });

  describe("entregas completas anteriores a #516 (los 66 de octubre)", () => {
    it("un solo registro de entrega completa: ya no queda por conciliar", async () => {
      const { c, p } = await crear({ origen: "PEDIDO", desfase: 0 });
      await auditoriaLegada(p.id, false, 1);
      const f = await fila(c.id, p.id);
      expect(f?.entregaEnPeriodo).toEqual({ porConciliar: false, unidades: 8 });
      expect(f?.entregaHoraVerificable).toBe(false); // la oficina registra el día: «hora sin verificar»
    });
    it("parcial y luego completo: sigue por conciliar (falta evidencia real)", async () => {
      const { c, p } = await crear({ origen: "PEDIDO", desfase: 0 });
      await auditoriaLegada(p.id, true, 1);
      await auditoriaLegada(p.id, false, 2);
      expect((await fila(c.id, p.id))?.entregaEnPeriodo?.porConciliar).toBe(true);
    });
  });

  describe("comisión del repartidor: no cambia ni se bloquea", () => {
    it("la venta en ruta cuenta sus 8 pacas y no genera revisiones", async () => {
      const solo = (
        await testPrisma.trabajador.create({
          data: { nombre: "Repartidor aislado 989", rol: "REPARTIDOR", usaMoto: true, tipoPago: "COMISION", comRepartAgua: 400, comRepartHielo: 400 },
        })
      ).id;
      await crear({ origen: "VENTA_RAPIDA", repartidor: solo });
      const com = await calcularComisionRepartidor(testPrisma, solo, startOfDayBogota(HOY), endOfDayBogota(HOY), TARIFA);
      expect(com.revisiones).toEqual([]);
      expect(com.entregasAgua).toBe(8);
      expect(com.total).toBe(8 * 400);
      expect(com.porOrigen).toEqual({ embarque: 0, sinEmbarque: 8 * 400 }); // idéntico al código anterior a #989
    });
  });
});
