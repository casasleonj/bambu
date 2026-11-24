// #853 Fase 3 · dinero de lo entregado HOY contra PostgreSQL real, en AMBOS modos de la proyección de
// fiados (FIADO_ENTREGA_PARCIAL encendida y apagada), con casos adversariales y conciliación con los
// consumidores reales (Dashboard, Cierre). Solo lectura sobre el sistema: nada se recalcula ni se escribe.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { todayStringBogota } from "@/lib/dates";
import { calcularEstadoPago } from "@/modules/pedidos/domain/services/pagos-calculator.service";
import { leerVentasEntregadasDia } from "@/modules/dashboard/infrastructure/ventas-entregadas.repository";
import { unidadesEntregadasDelDia } from "@/lib/unidades-entregadas-dia";
import { construirResumenCierre } from "@/lib/cierre-resumen";
import { calcularComisionRepartidor } from "@/lib/comision-repartidor";
import { tarifasRepartidor } from "@/lib/comision-repartidor-calculo";

const dia = todayStringBogota();
const fecha = (d: string, hh: string) => new Date(`${d}T${hh}:00-05:00`);
const ayer = new Date(+fecha(dia, "12:00") - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const rango = { start: fecha(dia, "00:00"), end: new Date(+fecha(dia, "00:00") + 86_400_000) };
const PRECIO = 1000;
let adminId: string;

const economia = async () => {
  const f = leerFiltrosConsulta(new URLSearchParams({ desde: dia, hasta: dia, resumen: "1" }), dia);
  return (await consultarPedidos(f, "ADMIN", testPrisma)).resumen!;
};

interface Pedido {
  nombre: string; dia: string; demanda: number; entregado: number; pagado: number;
  pagoDia?: string; estado?: "ENTREGADO" | "PENDIENTE" | "ANULADO"; conHechoExigible?: boolean;
  /** Sin eventos de entrega: simula un pedido antiguo sin desglose por día («aproximado»). */
  sinEventos?: boolean; entregadoAtNulo?: boolean;
}
async function crear(o: Pedido) {
  const cliente = await testPrisma.cliente.create({ data: { nombre: `853e ${o.nombre} ${randomUUID()}`, telefono: randomUUID() } });
  const total = PRECIO * o.demanda;
  const estadoEntrega = o.estado ?? (o.entregado >= o.demanda ? "ENTREGADO" : "PENDIENTE");
  const anulado = estadoEntrega === "ANULADO";
  const p = await testPrisma.pedido.create({
    data: {
      clienteId: cliente.id, createdById: adminId, canal: "DOMICILIO", origen: "PEDIDO",
      fecha: fecha(o.dia, "09:00"), createdAt: fecha(o.dia, "09:00"),
      estado: estadoEntrega === "ENTREGADO" ? "ENTREGADO" : "PENDIENTE", estadoEntrega,
      estadoPago: anulado ? "ANULADO" : calcularEstadoPago(total, o.pagado, estadoEntrega === "ENTREGADO" ? "ENTREGADO" : "PENDIENTE"),
      ...(o.entregadoAtNulo ? {} : estadoEntrega === "ENTREGADO" ? { entregadoAt: fecha(dia, "12:00") } : {}),
      total: anulado ? 0 : total, totalPagado: anulado ? 0 : o.pagado, saldo: anulado ? 0 : total - o.pagado,
      items: { create: { producto: "PACA_AGUA", cantPedido: o.demanda, cantEntrega: o.entregado, precio: PRECIO, subtotal: total } },
    },
  });
  if (o.pagado > 0 && !anulado) {
    await testPrisma.pago.create({
      data: { pedidoId: p.id, metodo: "EFECTIVO", monto: o.pagado, createdAt: fecha(o.pagoDia ?? dia, "10:30"), ocurridoAt: fecha(o.pagoDia ?? dia, "10:30") },
    });
  }
  return p;
}
async function evento(id: string, d: string, hh: string, cantidad: number, repartidorId: string | null = null) {
  await testPrisma.historial.create({
    data: {
      entidad: "Pedido", registroId: id, accion: "UPDATE", fecha: fecha(d, hh),
      datos: JSON.stringify({ accion: "ENTREGA_OFICINA", consultaEntrega: { version: 1, fecha: fecha(d, hh).toISOString(), repartidorId, eventoEntregaId: null, cantidades: [{ producto: "PACA_AGUA", cantidad }] } }),
    },
  });
}
async function hecho(id: string, hh: string, unidades: number) {
  await testPrisma.entregaExigible.create({
    data: { pedidoId: id, entregadoAt: fecha(dia, hh), valorEntregado: PRECIO * unidades, lineas: [{ producto: "PACA_AGUA", cantidad: unidades, precioCents: PRECIO * 100 }], eventoId: randomUUID() },
  });
}

/** Casos sembrados. Los importes esperados están calculados a mano en cada comentario. */
async function sembrar() {
  // A: pedido de hoy, 50 entregadas hoy, pagado completo → 50.000 entregado, 50.000 pagado.
  const A = await crear({ nombre: "A", dia, demanda: 50, entregado: 50, pagado: 50_000 });
  await evento(A.id, dia, "08:30", 50);
  // F: fiado del mismo día: 20 entregadas hoy sin pago → 20.000 por cobrar.
  const F = await crear({ nombre: "F", dia, demanda: 20, entregado: 20, pagado: 0 });
  await evento(F.id, dia, "09:15", 20);
  // B: pedido de AYER de 40: 30 ayer y 10 hoy; pagó 20.000 el día anterior → saldo 20.000.
  //    Los pagos cubren primero lo de ayer (FIFO): hoy 10.000 entregados, 0 pagados, 10.000 por cobrar.
  const B = await crear({ nombre: "B", dia: ayer, demanda: 40, entregado: 40, pagado: 20_000, pagoDia: ayer });
  await evento(B.id, ayer, "15:00", 30);
  await evento(B.id, dia, "09:00", 10);
  // Q: anticipo: 30 entregadas hoy, ya pagadas por adelantado → 30.000 pagados.
  const Q = await crear({ nombre: "Q", dia, demanda: 30, entregado: 30, pagado: 30_000, pagoDia: ayer });
  await evento(Q.id, dia, "11:00", 30);
  // C: parcial de hoy CON hecho de entrega: 60 de 100, sin pago → exigible 60.000 (proyección activa).
  const C = await crear({ nombre: "C", dia, demanda: 100, entregado: 60, pagado: 0 });
  await evento(C.id, dia, "10:00", 60);
  await hecho(C.id, "10:00", 60);
  // P: parcial de hoy SIN hecho de entrega: 12 entregadas → 12.000 por conciliar siempre.
  const P = await crear({ nombre: "P", dia, demanda: 30, entregado: 12, pagado: 0 });
  await evento(P.id, dia, "10:30", 12);
  // L: pedido antiguo «aproximado» (entregado sin fecha ni eventos): cuenta como entregado hoy pero se concilia.
  await crear({ nombre: "L", dia, demanda: 7, entregado: 7, pagado: 7_000, sinEventos: true, entregadoAtNulo: true });
  // X: entregado hoy y ANULADO hoy: no cuenta en ninguna cifra.
  const X = await crear({ nombre: "X", dia, demanda: 25, entregado: 25, pagado: 0, estado: "ANULADO" });
  await evento(X.id, dia, "12:30", 25);
  // Y: deuda ANTERIOR cobrada hoy (15.000): entra en «Cobros recibidos hoy», no en las cifras de lo entregado hoy.
  await crear({ nombre: "Y", dia: ayer, demanda: 40, entregado: 40, pagado: 15_000, pagoDia: dia });
}

const sumaIdentidad = (e: { entregadoHoy: number; pagadoDeEso: number; porCobrarDeEso: number; porConciliar: { valor: number } }) =>
  Math.round((e.pagadoDeEso + e.porCobrarDeEso + e.porConciliar.valor) * 100) === Math.round(e.entregadoHoy * 100);

describe("#853 Fase 3 · dinero de lo entregado hoy (PostgreSQL)", () => {
  beforeAll(async () => {
    await resetAndSeed();
    adminId = (await getAdminUser()).id;
    await sembrar();
  }, 120000);
  afterAll(async () => { vi.unstubAllEnvs(); await disconnect(); });

  it("proyección de fiados ENCENDIDA: reparto exacto y la identidad se cumple", async () => {
    vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
    const r = (await economia()).economiaHoy!;
    expect(r).toBeDefined();
    // Entregado: A 50 + F 20 + B 10 + Q 30 + C 60 + P 12 + L 7 = 189.000 (X anulado no cuenta).
    expect(r.entregadoHoy).toBe(189_000);
    // Pagado de eso: A 50.000 + Q 30.000 = 80.000 (B 0 por FIFO; L va a conciliar).
    expect(r.pagadoDeEso).toBe(80_000);
    // Por cobrar de eso: F 20.000 + B 10.000 + C 60.000 = 90.000.
    expect(r.porCobrarDeEso).toBe(90_000);
    // Por conciliar: P 12.000 (sin hecho) + L 7.000 (aproximado) = 19.000 en 2 pedidos.
    expect(r.porConciliar).toEqual({ pedidos: 2, valor: 19_000 });
    expect(sumaIdentidad(r)).toBe(true);
    // Cobros que ENTRARON hoy: A 50.000 + Y 15.000 (deuda anterior) + L 7.000 = 72.000; Q y B pagaron ayer.
    // Es OTRA magnitud: no es «pagado de eso» (80.000) y no se compara con ella.
    expect(r.cobrosHoy.neto).toBe(72_000);
    expect(r.cobrosHoy.neto).not.toBe(r.pagadoDeEso);
  }, 120000);

  it("proyección de fiados APAGADA: un parcial deja de repartirse y pasa a por conciliar, el resto igual", async () => {
    vi.stubEnv("FIADO_ENTREGA_PARCIAL", "false");
    const r = (await economia()).economiaHoy!;
    expect(r.entregadoHoy).toBe(189_000);
    expect(r.pagadoDeEso).toBe(80_000);
    // C (60.000) ya no tiene exigible afirmable → sale de «por cobrar» y entra a conciliar.
    expect(r.porCobrarDeEso).toBe(30_000);
    expect(r.porConciliar).toEqual({ pedidos: 3, valor: 79_000 });
    expect(sumaIdentidad(r)).toBe(true);
  }, 120000);

  it("es un componente aparte: se oculta con filtros adicionales y en días pasados", async () => {
    vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
    const filtrado = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams({ desde: dia, hasta: dia, resumen: "1", canal: "PUNTO" }), dia), "ADMIN", testPrisma);
    expect(filtrado.resumen!.economiaHoy).toBeUndefined();
    const pasado = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams({ desde: ayer, hasta: ayer, resumen: "1" }), dia), "ADMIN", testPrisma);
    expect(pasado.resumen!.economiaHoy).toBeUndefined();
  }, 60000);

  it("idempotente: leer dos veces no cambia nada", async () => {
    vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
    expect((await economia()).economiaHoy).toEqual((await economia()).economiaHoy);
  }, 60000);

  describe("conciliación con los consumidores reales (XMOD)", () => {
    it("Dashboard «Ventas»: MISMA métrica y contexto → igualdad exacta", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const ventas = await leerVentasEntregadasDia(testPrisma, rango);
      expect((await economia()).economiaHoy!.entregadoHoy).toBe(ventas.total);
    }, 60000);

    it("unidades físicas: balance (Fase 1), entregas del día y Dashboard/Producción/Cierre coinciden", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const u = await unidadesEntregadasDelDia(testPrisma, { desde: rango.start, hasta: rango.end });
      const r = await economia();
      const agua = r.balanceOperativo!.productos.find((p) => p.producto === "PACA_AGUA")!;
      expect(agua.total.entregadasHoy).toBe(u.agua);
      expect(r.operacionDia!.total).toBe(u.agua + u.hielo + u.botellon + u.bolsaAgua + u.bolsaHielo);
    }, 60000);

    it("Cierre: métricas RELACIONADAS (no iguales) con puente exacto", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const { cierre } = await construirResumenCierre(testPrisma, dia);
      const ventas = await leerVentasEntregadasDia(testPrisma, rango);
      // El Cierre suma el valor entregado de los pedidos CREADOS hoy (por fecha del pedido); el Dashboard
      // valora lo ENTREGADO hoy, sea de pedidos de hoy o anteriores. Puente: la diferencia es exactamente
      // lo entregado hoy de pedidos anteriores (B: 10.000), siempre que lo de hoy se entregue hoy.
      // (X anulado y las notas de crédito de pedidos anteriores no entran en ninguno.)
      const entregadoHoyDeAnteriores = 10_000;
      expect(Math.round((ventas.total - cierre.totalVentas) * 100)).toBe(entregadoHoyDeAnteriores * 100);
    }, 120000);

    it("Cierre, dinero que ENTRÓ hoy (por fecha del pago): MISMA métrica que «Cobros recibidos hoy»", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const { cierre } = await construirResumenCierre(testPrisma, dia);
      const cajaHoy = cierre.cobroVentasHoy + cierre.cobroCartera;
      expect(Math.round(cajaHoy * 100)).toBe(Math.round((await economia()).economiaHoy!.cobrosHoy.neto * 100));
    }, 120000);

    it("Cierre «cobrado»: métrica de COHORTE, distinta; puente exacto con el dinero que entró hoy", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const { cierre } = await construirResumenCierre(testPrisma, dia);
      const r = (await economia()).economiaHoy!;
      // `cobrado` = lo pagado (acumulado) por los pedidos CREADOS hoy: A 50.000 + Q 30.000 + L 7.000 = 87.000.
      expect(cierre.cobrado).toBe(87_000);
      // Puente: dinero que entró hoy = cobrado − pagos de pedidos de hoy hechos ANTES de hoy (Q 30.000)
      //                               + pagos de hoy a pedidos ANTERIORES (Y 15.000) = 72.000.
      expect(Math.round((cierre.cobrado - 30_000 + 15_000) * 100)).toBe(Math.round(r.cobrosHoy.neto * 100));
      expect(cierre.cobrado).not.toBe(r.cobrosHoy.neto);
    }, 120000);
  });

  describe("ronda adversarial 2 (cada caso se mide contra la lectura anterior)", () => {
    const leer = async () => (await economia()).economiaHoy!;
    const delta = (a: Awaited<ReturnType<typeof leer>>, b: Awaited<ReturnType<typeof leer>>) => ({
      entregado: Math.round((b.entregadoHoy - a.entregadoHoy) * 100) / 100,
      pagado: Math.round((b.pagadoDeEso - a.pagadoDeEso) * 100) / 100,
      porCobrar: Math.round((b.porCobrarDeEso - a.porCobrarDeEso) * 100) / 100,
      conciliar: Math.round((b.porConciliar.valor - a.porConciliar.valor) * 100) / 100,
      cobros: Math.round((b.cobrosHoy.neto - a.cobrosHoy.neto) * 100) / 100,
    });
    const sinEspera = (hh: string, d = dia) => fecha(d, hh);

    it("frontera de medianoche (Bogotá): 00:00:00 de hoy y 23:59:30 cuentan; 00:00:00 de mañana no", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const antes = await leer();
      const manana = new Date(+fecha(dia, "12:00") + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      // Pedido de ayer entregado en 3 tandas de 3 unidades: hoy 00:00:00, hoy 23:59:30 y mañana 00:00:00.
      const p = await crear({ nombre: "frontera", dia: ayer, demanda: 9, entregado: 9, pagado: 0 });
      for (const [d, hh] of [[dia, "00:00"], [dia, "23:59"], [manana, "00:00"]] as const) await evento(p.id, d, hh, 3);
      const despues = await leer();
      // 6 unidades de hoy × 1.000; las 3 de mañana no entran. Pedido ENTREGADO con saldo 9.000: por cobrar hoy = min(9.000, 6.000).
      expect(delta(antes, despues)).toMatchObject({ entregado: 6_000, pagado: 0, porCobrar: 6_000, conciliar: 0 });
      void sinEspera;
    }, 120000);

    it("regalos: se entregan 12 (10 + 2 gratis) pero el valor y lo pagado son de las 10 con precio", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const antes = await leer();
      const cliente = await testPrisma.cliente.create({ data: { nombre: `853e regalo ${randomUUID()}`, telefono: randomUUID() } });
      const p = await testPrisma.pedido.create({
        data: {
          clienteId: cliente.id, createdById: adminId, canal: "DOMICILIO", origen: "PEDIDO", fecha: fecha(dia, "09:00"), createdAt: fecha(dia, "09:00"),
          estado: "ENTREGADO", estadoEntrega: "ENTREGADO", estadoPago: "PAGADO", entregadoAt: fecha(dia, "13:00"),
          total: 10_000, totalPagado: 10_000, saldo: 0,
          items: { create: { producto: "PACA_AGUA", cantPedido: 10, cantEntrega: 10, precio: PRECIO, subtotal: 10_000, cantRegaloPedido: 2, cantRegaloEntrega: 2, regaloAutorizadoPorId: adminId, regaloAutorizadoEn: fecha(dia, "09:00"), regaloMotivo: "prueba 853" } },
        },
      });
      await testPrisma.pago.create({ data: { pedidoId: p.id, metodo: "EFECTIVO", monto: 10_000, createdAt: fecha(dia, "13:05"), ocurridoAt: fecha(dia, "13:05") } });
      await testPrisma.historial.create({
        data: {
          entidad: "Pedido", registroId: p.id, accion: "UPDATE", fecha: fecha(dia, "13:00"),
          datos: JSON.stringify({ accion: "ENTREGA_OFICINA", consultaEntrega: { version: 1, fecha: fecha(dia, "13:00").toISOString(), repartidorId: null, eventoEntregaId: null, cantidades: [{ producto: "PACA_AGUA", cantidad: 12, cantidadRegalo: 2 }] } }),
        },
      });
      const despues = await leer();
      expect(delta(antes, despues)).toMatchObject({ entregado: 10_000, pagado: 10_000, porCobrar: 0, conciliar: 0, cobros: 10_000 });
    }, 120000);

    it("precio decimal: 3 unidades a 1.666,67 = 5.000,01 y la identidad conserva los centavos", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const antes = await leer();
      const cliente = await testPrisma.cliente.create({ data: { nombre: `853e decimal ${randomUUID()}`, telefono: randomUUID() } });
      const p = await testPrisma.pedido.create({
        data: {
          clienteId: cliente.id, createdById: adminId, canal: "DOMICILIO", origen: "PEDIDO", fecha: fecha(dia, "09:00"), createdAt: fecha(dia, "09:00"),
          estado: "ENTREGADO", estadoEntrega: "ENTREGADO", estadoPago: "PENDIENTE", entregadoAt: fecha(dia, "14:00"),
          total: 5000.01, totalPagado: 0, saldo: 5000.01,
          items: { create: { producto: "PACA_AGUA", cantPedido: 3, cantEntrega: 3, precio: 1666.67, subtotal: 5000.01 } },
        },
      });
      await evento(p.id, dia, "14:00", 3);
      const despues = await leer();
      expect(delta(antes, despues)).toMatchObject({ entregado: 5000.01, pagado: 0, porCobrar: 5000.01, conciliar: 0 });
      expect(sumaIdentidad(despues)).toBe(true);
    }, 120000);

    it("pago REPORTADO (por confirmar) cuenta como pagado, igual que «Pagado registrado» (ADR de pagos reportados)", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const antes = await leer();
      const p = await crear({ nombre: "reportado", dia, demanda: 8, entregado: 8, pagado: 0 });
      await evento(p.id, dia, "15:00", 8);
      await testPrisma.pedido.update({ where: { id: p.id }, data: { totalPagado: 8_000, saldo: 0, estadoPago: "PAGADO" } });
      await testPrisma.pago.create({ data: { pedidoId: p.id, metodo: "TRANSFERENCIA", monto: 8_000, confirmacion: "REPORTADO", createdAt: fecha(dia, "15:10"), ocurridoAt: fecha(dia, "15:10") } });
      const despues = await leer();
      expect(delta(antes, despues)).toMatchObject({ entregado: 8_000, pagado: 8_000, porCobrar: 0 });
    }, 120000);

    it("pago con crédito (BONO): cuenta como pagado del pedido pero NO como dinero que entró hoy", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const antes = await leer();
      const p = await crear({ nombre: "bono", dia, demanda: 6, entregado: 6, pagado: 0 });
      await evento(p.id, dia, "15:30", 6);
      await testPrisma.pedido.update({ where: { id: p.id }, data: { totalPagado: 6_000, saldo: 0, estadoPago: "PAGADO" } });
      await testPrisma.pago.create({ data: { pedidoId: p.id, metodo: "BONO", monto: 6_000, createdAt: fecha(dia, "15:35"), ocurridoAt: fecha(dia, "15:35") } });
      const despues = await leer();
      expect(delta(antes, despues)).toMatchObject({ entregado: 6_000, pagado: 6_000, porCobrar: 0, cobros: 0 });
    }, 120000);
  });

  describe("Nómina / comisiones (XMOD): relacionadas por repartidor efectivo y fecha REAL de entrega", () => {
    it("un pedido de ayer entregado hoy comisiona hoy; lo entregado ayer no; lo de otro repartidor no", async () => {
      vi.stubEnv("FIADO_ENTREGA_PARCIAL", "true");
      const R = await testPrisma.trabajador.findFirstOrThrow({ where: { rol: "REPARTIDOR" } });
      const otro = await testPrisma.trabajador.findFirstOrThrow({ where: { rol: { not: "REPARTIDOR" } } });
      const tarifas = tarifasRepartidor(R);
      const antes = await calcularComisionRepartidor(testPrisma, R.id, rango.start, new Date(+rango.end - 1), tarifas);

      const A = await crear({ nombre: "com A", dia, demanda: 50, entregado: 50, pagado: 0 });
      await evento(A.id, dia, "08:00", 50, R.id);
      // B: pedido de AYER; 30 entregadas ayer y 10 hoy por R. Solo las 10 de hoy comisionan hoy.
      const B = await crear({ nombre: "com B", dia: ayer, demanda: 40, entregado: 40, pagado: 0 });
      await evento(B.id, ayer, "15:00", 30, R.id);
      await evento(B.id, dia, "09:30", 10, R.id);
      // C: 20 entregadas hoy por OTRO trabajador: no comisionan a R.
      const C = await crear({ nombre: "com C", dia, demanda: 20, entregado: 20, pagado: 0 });
      await evento(C.id, dia, "10:00", 20, otro.id);

      const despues = await calcularComisionRepartidor(testPrisma, R.id, rango.start, new Date(+rango.end - 1), tarifas);
      expect(despues.entregasAgua - antes.entregasAgua).toBe(60);
      expect(Math.round((despues.comAgua - antes.comAgua) * 100) / 100).toBe(60 * tarifas.agua);
      // Fecha REAL del hecho: el día de AYER de esa misma persona solo trae las 30 de B, no las 60 de hoy.
      const ayerCom = await calcularComisionRepartidor(testPrisma, R.id, fecha(ayer, "00:00"), new Date(+fecha(ayer, "00:00") + 86_400_000 - 1), tarifas);
      expect(ayerCom.entregasAgua).toBe(30);
      // Puente con las unidades físicas de hoy (Dashboard/Cierre/Producción): las comisionables de R son un SUBCONJUNTO.
      const u = await unidadesEntregadasDelDia(testPrisma, { desde: rango.start, hasta: rango.end });
      expect(despues.entregasAgua).toBeLessThanOrEqual(u.agua);
      // y no se pierde nada: lo de R (60) + lo de otro (20) está dentro del total físico de hoy.
      expect(u.agua).toBeGreaterThanOrEqual(60 + 20);
    }, 120000);
  });
});
