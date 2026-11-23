// #853 · De extremo a extremo: los casos de uso REALES (crear, editar, cancelar) dejan evidencia
// de su cambio de demanda y el balance de Hoy la consume. Sin esto, el balance dependería de que
// alguien recuerde el formato del audit.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

import { testPrisma, resetAndSeed, disconnect, getAdminUser, uniqueId } from "./setup";
import { CrearPedidoUseCase } from "@/modules/pedidos/application/use-cases/CrearPedidoUseCase";
import { ActualizarPedidoUseCase } from "@/modules/pedidos/application/use-cases/ActualizarPedidoUseCase";
import { CancelarPedidoUseCase } from "@/modules/pedidos/application/use-cases/CancelarPedidoUseCase";
import { GetFiadoStatusUseCase } from "@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase";
import { PrismaPedidoRepository } from "@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository";
import { PrismaFacturaRepository } from "@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository";
import { PrismaPagoRepository } from "@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository";
import { PrismaClienteRepository } from "@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository";
import { PrismaNotaCreditoRepository } from "@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository";
import { PrismaPricingAdapter } from "@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter";
import { PrismaTransactionManager } from "@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager";
import { resolverCoordsDeLink } from "@/lib/geo/resolver-coords-de-link";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { todayStringBogota } from "@/lib/dates";

const dia = todayStringBogota();
const ayer = new Date(Date.parse(`${dia}T12:00:00-05:00`) - 86400000);
const PRODUCTO = "PACA_HIELO" as const;

const pedidoRepo = new PrismaPedidoRepository();
const clienteRepo = new PrismaClienteRepository();
const crear = () => new CrearPedidoUseCase(
  pedidoRepo, new PrismaFacturaRepository(), new PrismaPagoRepository(), clienteRepo,
  new PrismaPricingAdapter(), new PrismaTransactionManager(), resolverCoordsDeLink,
  new GetFiadoStatusUseCase(pedidoRepo, clienteRepo),
);
const actualizar = () => new ActualizarPedidoUseCase(
  pedidoRepo, new PrismaFacturaRepository(), clienteRepo,
  new PrismaPricingAdapter(), new PrismaTransactionManager(), resolverCoordsDeLink,
);
const cancelar = () => new CancelarPedidoUseCase(
  pedidoRepo, new PrismaFacturaRepository(), new PrismaNotaCreditoRepository(), new PrismaTransactionManager(),
);

let adminId: string;
let clienteId: string;

async function nuevoPedido(cantidad: number, anterior: boolean) {
  const { pedido } = await crear().execute({
    clienteId, canal: "DOMICILIO", origen: "PEDIDO", items: [{ producto: PRODUCTO, cantidad }], pagos: [],
    direccionEntrega: "Cra 9 # 80-10", createdById: adminId, createdByRole: "ADMIN", offlineId: uniqueId("853-demanda"),
  });
  if (anterior) {
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: { fecha: ayer, createdAt: ayer } });
  }
  return pedido.id;
}
const balance = async () => (await consultarPedidos(
  leerFiltrosConsulta(new URLSearchParams({ desde: dia, hasta: dia, resumen: "1" }), dia), "ADMIN", testPrisma,
)).resumen!.balanceOperativo!;
const total = (b: Awaited<ReturnType<typeof balance>>) =>
  b.productos.find((p) => p.producto === PRODUCTO)?.total ?? { porGestionar: 0, ajustes: 0, entregadasHoy: 0, faltan: 0 };
const grupo = (b: Awaited<ReturnType<typeof balance>>, g: "pedidosHoy" | "pendientesAnteriores") =>
  b.productos.find((p) => p.producto === PRODUCTO)?.grupos[g] ?? { porGestionar: 0, ajustes: 0, entregadasHoy: 0, faltan: 0 };
const dif = (a: ReturnType<typeof total>, b: ReturnType<typeof total>) => ({
  porGestionar: a.porGestionar - b.porGestionar, ajustes: a.ajustes - b.ajustes,
  entregadasHoy: a.entregadasHoy - b.entregadasHoy, faltan: a.faltan - b.faltan,
});

describe("#853 · evidencia de demanda de los casos de uso reales", () => {
  beforeAll(async () => {
    await resetAndSeed();
    adminId = (await getAdminUser()).id;
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: "Demanda 853", telefono: uniqueId("t"), direccion: "Cra 9 # 80-10", activo: true },
    })).id;
  }, 60000);
  afterAll(async () => { await disconnect(); });

  it("editar hoy un pedido anterior de 10 a 6 deja el antes y el después, y el balance muestra ajuste −4", async () => {
    const antes = await balance();
    const id = await nuevoPedido(10, true);
    await actualizar().execute({ pedidoId: id, items: [{ producto: PRODUCTO, cantidad: 6 }], usuarioId: adminId, usuarioRol: "ADMIN" });

    const h = (await testPrisma.historial.findMany({ where: { entidad: "Pedido", registroId: id } }))
      .map((x) => JSON.parse(x.datos) as { consultaDemanda?: { version: number; tipo: string; antes: unknown; despues: unknown } })
      .find((d) => d.consultaDemanda);
    expect(h?.consultaDemanda).toMatchObject({
      version: 1, tipo: "EDICION",
      antes: [{ producto: PRODUCTO, cantidad: 10 }], despues: [{ producto: PRODUCTO, cantidad: 6 }],
    });
    const despues = await balance();
    expect(dif(grupo(despues, "pendientesAnteriores"), grupo(antes, "pendientesAnteriores")))
      .toEqual({ porGestionar: 10, ajustes: -4, entregadasHoy: 0, faltan: 6 });
  }, 60000);

  it("cancelar hoy un pedido anterior pendiente deja evidencia y el balance muestra ajuste −10 y faltan 0", async () => {
    const antes = await balance();
    const id = await nuevoPedido(10, true);
    await cancelar().execute({ pedidoId: id, motivo: "cliente desistió", actorId: adminId });

    const h = (await testPrisma.historial.findMany({ where: { entidad: "Pedido", registroId: id } }))
      .map((x) => JSON.parse(x.datos) as { consultaDemanda?: { tipo: string; antes: unknown; despues: unknown } })
      .find((d) => d.consultaDemanda?.tipo === "CANCELACION");
    expect(h?.consultaDemanda).toMatchObject({
      antes: [{ producto: PRODUCTO, cantidad: 10 }], despues: [{ producto: PRODUCTO, cantidad: 0 }],
    });
    const despues = await balance();
    expect(dif(grupo(despues, "pendientesAnteriores"), grupo(antes, "pendientesAnteriores")))
      .toEqual({ porGestionar: 10, ajustes: -10, entregadasHoy: 0, faltan: 0 });
  }, 60000);

  it("editar y luego cancelar el mismo pedido: se retira lo que había al cancelar, sin contar dos veces", async () => {
    const antes = await balance();
    const id = await nuevoPedido(10, true);
    await actualizar().execute({ pedidoId: id, items: [{ producto: PRODUCTO, cantidad: 6 }], usuarioId: adminId, usuarioRol: "ADMIN" });
    await cancelar().execute({ pedidoId: id, motivo: "cliente desistió", actorId: adminId });
    const despues = await balance();
    // inicio del día = 10; ajustes = −4 (edición) −6 (cancelación) = −10; nada por entregar.
    expect(dif(grupo(despues, "pendientesAnteriores"), grupo(antes, "pendientesAnteriores")))
      .toEqual({ porGestionar: 10, ajustes: -10, entregadasHoy: 0, faltan: 0 });
  }, 60000);

  it("un pedido creado y cancelado hoy conserva su demanda original y la retira como ajuste", async () => {
    const antes = await balance();
    const id = await nuevoPedido(7, false);
    await cancelar().execute({ pedidoId: id, motivo: "error", actorId: adminId });
    const despues = await balance();
    expect(dif(grupo(despues, "pedidosHoy"), grupo(antes, "pedidosHoy")))
      .toEqual({ porGestionar: 7, ajustes: -7, entregadasHoy: 0, faltan: 0 });
    expect(dif(total(despues), total(antes)).faltan).toBe(0);
  }, 60000);
});
