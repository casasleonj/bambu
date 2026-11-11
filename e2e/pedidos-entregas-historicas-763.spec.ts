// @tests #763: la consulta del día debe mostrar hechos físicos de pedidos anteriores
// sin convertir las entregas parciales en pedidos/ventas independientes.
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  test, expect, loginAs, goto, appMain, resetTestDatabase,
} from "./fixtures";

const db = new PrismaClient();
const hoyBogota = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
function ayerBogota() {
  const [a, m, d] = hoyBogota().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}
function fechaDe(dia: string, hora: string) {
  return new Date(dia + "T" + hora + "-05:00");
}

/** Un único pedido creado ayer, con 3 pacas ayer y las restantes 3 hoy. */
async function casoParcialEntreDias() {
  const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
  const cliente = await db.cliente.create({
    data: { nombre: "Histórico 763 " + randomUUID().slice(0, 8), telefono: randomUUID() },
  });
  const repartidor = await db.trabajador.create({
    data: { nombre: "Repartidor 763", rol: "REPARTIDOR", activo: true, usaMoto: true },
  });
  const diaAyer = ayerBogota(), diaHoy = hoyBogota();
  const pedido = await db.pedido.create({
    data: {
      clienteId: cliente.id, createdById: admin.id,
      canal: "DOMICILIO", origen: "PEDIDO",
      fecha: fechaDe(diaAyer, "09:45:00"),
      createdAt: fechaDe(diaAyer, "09:45:00"),
      entregadoAt: fechaDe(diaHoy, "15:49:25"),
      estado: "ENTREGADO", estadoEntrega: "ENTREGADO",
      estadoPago: "PENDIENTE", total: 13800, totalPagado: 0, saldo: 13800,
      items: { create: {
        producto: "PACA_AGUA", cantPedido: 6, cantEntrega: 6,
        precio: 2300, subtotal: 13800,
      } },
    },
  });
  const movimientos = [
    { dia: diaAyer, hora: "09:52:00", cantidad: 3 },
    { dia: diaHoy, hora: "15:49:25", cantidad: 3 },
  ];
  for (const e of movimientos) {
    await db.historial.create({
      data: {
        entidad: "Pedido", registroId: pedido.id, accion: "UPDATE",
        fecha: fechaDe(e.dia, e.hora),
        datos: JSON.stringify({
          accion: "ENTREGA_OFICINA",
          consultaEntrega: {
            version: 1, precisionFecha: "INSTANTE",
            fecha: fechaDe(e.dia, e.hora).toISOString(),
            repartidorId: repartidor.id,
            cantidades: [{ producto: "PACA_AGUA", cantidad: e.cantidad }],
          },
        }),
      },
    });
  }
  return { pedido, cliente, diaAyer, diaHoy };
}

test.describe("#763 — Pedidos y entregas efectivas de otros días", () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== "true", "requiere Hub V2 activo");
  test.setTimeout(90000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  for (const [nombre, viewport] of [
    ["escritorio", { width: 1280, height: 850 }],
    ["móvil", { width: 390, height: 844 }],
  ] as const) {
    test(nombre + ": al consultar hoy, se ve la entrega final de pedido de ayer sin duplicar ventas", async ({ page }) => {
      await page.setViewportSize(viewport);
      const { pedido, cliente, diaAyer, diaHoy } = await casoParcialEntreDias();
      await loginAs(page, "admin");
      await goto(page, "/pedidos?clienteId=" + cliente.id);
      const app = appMain(page);
      const bloque = app.getByTestId("entregas-historicas-763");
      const tarjeta = bloque.getByTestId("entrega-historica-" + pedido.numero);
      await expect(bloque).toBeVisible();
      await expect(tarjeta).toContainText("Completado tras parcial");
      await expect(tarjeta).toContainText("3 pacas de agua");
      await expect(tarjeta).toContainText("6 pacas de agua");
      await expect(tarjeta).toContainText("Completado el");
      // El mismo pedido NO se creó hoy: la lista por fecha de pedido queda vacía.
      await expect(app.locator('[data-testid^="operacion-row-"]')).toHaveCount(0);
      // Los dos eventos tienen fechas distintas, pero solamente una identidad.
      await expect(bloque.locator('[data-testid^="entrega-historica-"]')).toHaveCount(1);
      // Se puede abrir el pedido original sin crear un hijo.
      await tarjeta.getByRole("button", { name: "Ver pedido " + pedido.numero }).click();
      await expect(page.getByText("Pedido #" + pedido.numero).first()).toBeVisible();
      // La consulta histórica no se reetiqueta retrospectivamente como completada.
      await goto(page, "/pedidos?clienteId=" + cliente.id + "&desde=" + diaAyer + "&hasta=" + diaAyer);
      const anterior = appMain(page).getByTestId("entrega-historica-" + pedido.numero);
      await expect(anterior).toContainText("Parcial en la fecha");
      await expect(anterior).toContainText("Completado posteriormente:");
      await expect(anterior).toContainText("3 pacas de agua");
      expect(diaAyer).not.toBe(diaHoy);
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= innerWidth + 1,
      )).toBe(true);
    });
  }
});