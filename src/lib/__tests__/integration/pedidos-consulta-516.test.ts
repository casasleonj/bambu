import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { leerEntregasConsulta } from "@/lib/entregas-consulta";
const dia = "2026-10-28";
const hora = (h: string) => new Date(`${dia}T${h}-05:00`);
const filtros = (s = "") =>
  leerFiltrosConsulta(new URLSearchParams(`desde=${dia}&hasta=${dia}&${s}`));
let adminId: string;
async function crear(
  opts: {
    nombre?: string;
    canal?: "PUNTO" | "DOMICILIO";
    entregado?: boolean;
    pagado?: number;
    negocio?: boolean;
  } = {},
) {
  const c = await testPrisma.cliente.create({
    data: {
      nombre: opts.nombre ?? `516 ${randomUUID()}`,
      telefono: randomUUID(),
    },
  });
  const n = opts.negocio
    ? await testPrisma.negocio.create({
        data: { clienteId: c.id, nombre: `Tienda específica ${randomUUID()}` },
      })
    : null;
  const p = await testPrisma.pedido.create({
    data: {
      clienteId: c.id,
      negocioId: n?.id,
      createdById: adminId,
      canal: opts.canal ?? "DOMICILIO",
      fecha: hora("10:20:00"),
      createdAt: hora("09:00:00"),
      estado: opts.entregado ? "ENTREGADO" : "PENDIENTE",
      estadoEntrega: opts.entregado ? "ENTREGADO" : "PENDIENTE",
      estadoPago:
        opts.pagado === 20000
          ? "PAGADO"
          : opts.pagado
            ? "PARCIAL"
            : "PENDIENTE",
      total: 20000,
      totalPagado: opts.pagado ?? 0,
      saldo: 20000 - (opts.pagado ?? 0),
      items: {
        create: {
          producto: "PACA_HIELO",
          cantPedido: 4,
          cantEntrega: opts.entregado ? 4 : 0,
          precio: 5000,
          subtotal: 20000,
        },
      },
    },
  });
  const factura = await testPrisma.factura.create({
    data: {
      numero: `F516-${randomUUID()}`,
      pedidoId: p.id,
      clienteId: c.id,
      total: 20000,
      subtotal: 20000,
      saldo: 20000 - (opts.pagado ?? 0),
    },
  });
  return { p, c, n, factura };
}
async function entrega(
  pedidoId: string,
  hh: string,
  repartidorId: string | null,
  cantidad: number,
  eventoEntregaId: string | null = null,
) {
  return testPrisma.historial.create({
    data: {
      entidad: "Pedido",
      registroId: pedidoId,
      accion: "UPDATE",
      fecha: hora("16:00:00"),
      datos: JSON.stringify({
        accion: "ENTREGA_OFICINA",
        consultaEntrega: {
          version: 1,
          fecha: hora(hh).toISOString(),
          repartidorId,
          eventoEntregaId,
          cantidades: [{ producto: "PACA_HIELO", cantidad }],
        },
      }),
    },
  });
}
describe("#516 — consulta completa en PostgreSQL", () => {
  beforeAll(async () => {
    await resetAndSeed();
    adminId = (await getAdminUser()).id;
  }, 60000);
  afterAll(disconnect);
  it("más de 200 pedidos: filtra antes de paginar; totales/productos no son solo la página", async () => {
    const { c } = await crear({ nombre: "Conjunto grande 516" });
    await testPrisma.pedido.createMany({
      data: Array.from({ length: 205 }, () => ({
        clienteId: c.id,
        fecha: hora("10:05:00"),
        estado: "ENTREGADO",
        estadoEntrega: "ENTREGADO" as const,
        total: 1000,
        totalPagado: 400,
        saldo: 600,
        estadoPago: "PARCIAL" as const,
        canal: "PUNTO",
        cPacaAguaPed: 1,
        cPacaAguaEnt: 1,
      })),
    });
    const f = filtros(`clienteId=${c.id}&canal=PUNTO&pageSize=25&page=2`),
      r = await consultarPedidos(f, "ADMIN", testPrisma);
    expect(r.total).toBe(205);
    expect(r.pedidos).toHaveLength(25);
    expect(r.resumen).toMatchObject({
      importe: 205000,
      pagado: 82000,
      saldo: 123000,
      fiado: 123000,
      pendienteEntrega: 0,
    });
    expect(r.resumen?.productos).toContainEqual({
      producto: "PACA_AGUA",
      pedidas: 205,
      entregadas: 205,
    });
    const fin = await consultarPedidos({ ...f, page: 9 }, "ADMIN", testPrisma);
    expect(fin.pedidos).toHaveLength(5);
    expect(fin.resumen).toEqual(r.resumen);
  });
  it("busca negocio y creador, diferencia fecha de pedido de creación y respeta factura por perfil", async () => {
    const { p, n, factura } = await crear({ negocio: true }),
      f = filtros(`search=${encodeURIComponent(n!.nombre)}`);
    const r = await consultarPedidos(f, "ADMIN", testPrisma);
    expect(r.pedidos.map((p) => p.id)).toEqual([p.id]);
    expect(r.pedidos[0]).toMatchObject({
      factura: { id: factura.id },
      createdAt: hora("09:00:00").toISOString(),
    });
    // #556: el ASISTENTE también lee facturas (decisión del PO); el REPARTIDOR no.
    const asistente = await consultarPedidos(f, "ASISTENTE", testPrisma);
    expect(asistente.pedidos[0].factura).toMatchObject({ id: factura.id });
    const sinPermiso = await consultarPedidos(f, "REPARTIDOR", testPrisma);
    expect(sinPermiso.pedidos[0].factura).toBeFalsy();
    const admin = await testPrisma.user.findUniqueOrThrow({
      where: { id: adminId },
    });
    expect(
      (
        await consultarPedidos(
          filtros(`search=${encodeURIComponent(admin.nombre)}`),
          "ADMIN",
          testPrisma,
        )
      ).pedidos.some((x) => x.id === p.id),
    ).toBe(true);
  });
  it("un pedido parcial en dos horarios y dos repartidores no atribuye el acumulado al último ni duplica el pedido", async () => {
    const { p } = await crear(),
      r1 = await testPrisma.trabajador.create({
        data: { nombre: "Juan 516", rol: "REPARTIDOR" },
      }),
      r2 = await testPrisma.trabajador.create({
        data: { nombre: "Pedro 516", rol: "REPARTIDOR" },
      });
    await entrega(p.id, "10:20:00", r1.id, 1);
    await entrega(p.id, "11:30:00", r2.id, 1);
    await testPrisma.pedidoItem.updateMany({
      where: { pedidoId: p.id },
      data: { cantEntrega: 2 },
    });
    const f = filtros(
      `clienteId=${p.clienteId}&fechaBase=entrega&desdeHora=10:20&hastaHora=10:20&repartidorId=${r1.id}`,
    );
    const r = await consultarPedidos(f, "ADMIN", testPrisma);
    expect(r.total).toBe(1);
    expect(r.resumen?.productos).toEqual([
      { producto: "PACA_HIELO", pedidas: 0, entregadas: 1 },
    ]);
    expect(r.pedidos[0].items[0].cantEntrega).toBe(2);
    const ambos = await consultarPedidos(
      filtros(
        `clienteId=${p.clienteId}&fechaBase=entrega&repartidorId=${r1.id}&repartidorId=${r2.id}`,
      ),
      "ADMIN",
      testPrisma,
    );
    expect(ambos.total).toBe(1);
    expect(ambos.resumen?.productos[0].entregadas).toBe(2);
  });
  it("un acumulado histórico con fecha pero sin eventos se avisa, nunca se convierte en cantidades del intervalo", async () => {
    const { p } = await crear({ entregado: true });
    await testPrisma.pedido.update({
      where: { id: p.id },
      data: { entregadoAt: hora("10:25:00") },
    });
    const r = await consultarPedidos(
      filtros(`clienteId=${p.clienteId}&fechaBase=entrega`),
      "ADMIN",
      testPrisma,
    );
    expect(r.total).toBe(1);
    expect(r.resumen?.productos).toEqual([]);
    expect(r.resumen?.entregasPorConciliar).toBe(1);
  });
  it("importe=pagado+saldo; fiado es parte del saldo, no otro sumando", async () => {
    const { c, p } = await crear({ entregado: true, pagado: 5000 });
    await testPrisma.pedido.create({
      data: {
        clienteId: c.id,
        fecha: hora("10:21:00"),
        total: 10000,
        saldo: 10000,
        estado: "PENDIENTE",
      },
    });
    const r = await consultarPedidos(
      filtros(`clienteId=${c.id}`),
      "ADMIN",
      testPrisma,
    );
    expect(r.resumen).toMatchObject({
      importe: 30000,
      pagado: 5000,
      saldo: 25000,
      fiado: 15000,
      pendienteEntrega: 10000,
      importesPorConciliar: false,
    });
    expect(r.pedidos.some((x) => x.id === p.id)).toBe(true);
  });
  it("cobrar hoy una deuda anterior incluye el pedido por el cobro; BONO y espejo no duplican dinero nuevo", async () => {
    const { p, c, factura } = await crear({ entregado: true, pagado: 10000 });
    await testPrisma.pedido.update({
      where: { id: p.id },
      data: { fecha: new Date("2026-10-25T10:00:00-05:00") },
    });
    const pago = await testPrisma.pago.create({
      data: {
        pedidoId: p.id,
        monto: 10000,
        metodo: "EFECTIVO",
        createdAt: hora("10:40:00"),
        confirmacion: "CONFIRMADO",
      },
    });
    await testPrisma.abono.create({
      data: {
        numero: `A516-${randomUUID()}`,
        facturaId: factura.id,
        clienteId: c.id,
        pedidoId: p.id,
        pagoOrigenId: pago.id,
        origenCobro: "ESPEJO_PAGO",
        monto: 10000,
        metodoPago: "EFECTIVO",
        fecha: hora("10:40:00"),
      },
    });
    await testPrisma.pago.create({
      data: {
        pedidoId: p.id,
        monto: 1000,
        metodo: "BONO",
        createdAt: hora("10:40:00"),
        confirmacion: "CONFIRMADO",
      },
    });
    const r = await consultarPedidos(
      filtros(
        `clienteId=${c.id}&fechaBase=cobro&desdeHora=10:40&hastaHora=10:40`,
      ),
      "ADMIN",
      testPrisma,
    );
    expect(r.total).toBe(1);
    expect(r.resumen?.cobros?.subtotalRegistrado).toBe(10000);
    expect(r.resumen?.cobros?.creditoAplicado).toBe(1000);
    expect(r.resumen?.cobros?.medios.map((m) => m.metodo)).toEqual([
      "EFECTIVO",
    ]);
  });
  it("Activos/Todos/Anulados conserva la consulta y no suma una anulación como venta", async () => {
    const { p, c } = await crear();
    await testPrisma.pedido.update({
      where: { id: p.id },
      data: {
        estado: "ANULADO",
        estadoEntrega: "ANULADO",
        estadoPago: "ANULADO",
        total: 0,
        totalPagado: 0,
        saldo: 0,
      },
    });
    expect(
      (
        await consultarPedidos(
          filtros(`clienteId=${c.id}`),
          "ADMIN",
          testPrisma,
        )
      ).total,
    ).toBe(0);
    const r = await consultarPedidos(
      filtros(`clienteId=${c.id}&registro=anulados`),
      "ADMIN",
      testPrisma,
    );
    expect(r.total).toBe(1);
    expect(r.resumen?.importe).toBe(0);
  });
  it("sin selección explícita el resumen no existe", async () => {
    const f = leerFiltrosConsulta(new URLSearchParams(), dia);
    expect((await consultarPedidos(f, "ADMIN", testPrisma)).resumen).toBeNull();
  });
  it("busca porcentajes y guiones bajos como texto, no como comodines SQL", async () => {
    const { p } = await crear({ nombre: "Literal 50%_516" });
    await crear({ nombre: "Literal 50X516" });
    const r = await consultarPedidos(
      filtros("search=50%25_516"),
      "ADMIN",
      testPrisma,
    );
    expect(r.pedidos.map((x) => x.id)).toEqual([p.id]);
  });
  it("una fecha de día conocido no se transforma en entregas al mediodía; sí cuenta en el día completo", async () => {
    const { p, c } = await crear({ entregado: true });
    await testPrisma.historial.create({
      data: {
        entidad: "Pedido",
        registroId: p.id,
        accion: "UPDATE",
        fecha: hora("18:00:00"),
        datos: JSON.stringify({
          accion: "ENTREGA_OFICINA",
          consultaEntrega: {
            version: 1,
            fecha: hora("12:00:00").toISOString(),
            precisionFecha: "DIA",
            repartidorId: null,
            cantidades: [{ producto: "PACA_HIELO", cantidad: 4 }],
          },
        }),
      },
    });
    const r = await consultarPedidos(
      filtros(
        `clienteId=${c.id}&fechaBase=entrega&desdeHora=23:50&hastaHora=23:59`,
      ),
      "ADMIN",
      testPrisma,
    );
    expect(r.total).toBe(1);
    expect(r.resumen?.productos).toEqual([]);
    expect(r.resumen?.entregasPorConciliar).toBe(1);
    expect(r.pedidos[0].entregaHoraVerificable).toBe(false);
    const completo = await consultarPedidos(
      filtros(`clienteId=${c.id}&fechaBase=entrega`),
      "ADMIN",
      testPrisma,
    );
    expect(completo.resumen?.productos).toEqual([
      { producto: "PACA_HIELO", pedidas: 0, entregadas: 4 },
    ]);
    expect(completo.resumen?.entregasPorConciliar).toBe(0);
  });
  it("un acumulado superior a los eventos disponibles se señala sin reconstruir el faltante", async () => {
    const { p, c } = await crear({ entregado: true });
    await entrega(p.id, "10:20:00", null, 2);
    const r = await consultarPedidos(
      filtros(`clienteId=${c.id}&fechaBase=entrega`),
      "ADMIN",
      testPrisma,
    );
    expect(r.resumen?.productos[0].entregadas).toBe(2);
    expect(r.resumen?.entregasPorConciliar).toBe(1);
  });
  it("eventos contradictorios que exceden al acumulado no se muestran como cantidades verificadas", async () => {
    const { p, c } = await crear({ entregado: true });
    await entrega(p.id, "10:20:00", null, 10);
    const r = await consultarPedidos(
      filtros(`clienteId=${c.id}&fechaBase=entrega`),
      "ADMIN",
      testPrisma,
    );
    expect(r.resumen?.productos).toEqual([]);
    expect(r.resumen?.entregasPorConciliar).toBe(1);
  });
  it("la asignación actual no identifica al repartidor que entregó", async () => {
    const { p, c } = await crear({ entregado: true }),
      r = await testPrisma.trabajador.create({
        data: { nombre: "Solo asignado 516", rol: "REPARTIDOR" },
      });
    const e = await testPrisma.embarque.create({
      data: {
        trabajadorId: r.id,
        fecha: hora("09:00:00"),
        numero: 900001,
        numeroDia: 9901,
      },
    });
    await testPrisma.pedido.update({
      where: { id: p.id },
      data: { embarqueId: e.id, entregadoAt: hora("10:30:00") },
    });
    expect(
      (
        await consultarPedidos(
          filtros(`clienteId=${c.id}&repartidorId=${r.id}`),
          "ADMIN",
          testPrisma,
        )
      ).total,
    ).toBe(0);
  });
  it("fecha real de un evento offline gana a la fecha de registro del espejo físico", async () => {
    const { p } = await crear({ entregado: true }),
      r = await testPrisma.trabajador.create({
        data: { nombre: "Offline 516", rol: "REPARTIDOR" },
      });
    const e = await testPrisma.embarque.create({
      data: {
        trabajadorId: r.id,
        fecha: hora("09:00:00"),
        numero: 900002,
        numeroDia: 9902,
      },
    });
    const evento = randomUUID();
    await entrega(p.id, "10:20:00", r.id, 2, evento);
    await testPrisma.embarqueMovimiento.create({
      data: {
        embarqueId: e.id,
        tipo: "ENTREGA",
        producto: "PACA_HIELO",
        cantidad: 2,
        createdAt: hora("12:00:00"),
        metadata: {
          captura: "ENTREGA_PEDIDO",
          pedidoId: p.id,
          eventoEntregaId: evento,
        },
      },
    });
    const primera = await leerEntregasConsulta(testPrisma, {
      rango: { desde: hora("10:00:00"), hasta: hora("11:00:00") },
    });
    expect(
      primera
        .filter((x) => x.pedidoId === p.id)
        .flatMap((x) => x.cantidades ?? []),
    ).toEqual([{ producto: "PACA_HIELO", cantidad: 2 }]);
    const otra = await leerEntregasConsulta(testPrisma, {
      rango: { desde: hora("12:00:00"), hasta: hora("13:00:00") },
    });
    expect(otra.filter((x) => x.pedidoId === p.id)).toEqual([]);
  });
});
