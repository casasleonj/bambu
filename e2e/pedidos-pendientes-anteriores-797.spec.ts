// @tests #927: pendientes y entregas antiguas se ven en Hoy en la misma
// lista, sin duplicación ni alterar la fecha real de creación.
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
const fechaDe = (dia: string, hora: string) => new Date(dia + "T" + hora + "-05:00");

async function pedido(dia: string, hora: string, nombre: string, estadoEntrega: "PENDIENTE" | "ENTREGADO" = "PENDIENTE") {
  const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
  const cliente = await db.cliente.create({
    data: { nombre: nombre + " " + randomUUID().slice(0, 8), telefono: randomUUID() },
  });
  const p = await db.pedido.create({
    data: {
      clienteId: cliente.id, createdById: admin.id,
      canal: "DOMICILIO", origen: "PEDIDO",
      fecha: fechaDe(dia, hora), createdAt: fechaDe(dia, hora),
      estado: estadoEntrega, estadoEntrega,
      estadoPago: "PENDIENTE", total: 6900, totalPagado: 0, saldo: 6900,
      items: { create: {
        producto: "PACA_AGUA", cantPedido: 3, cantEntrega: estadoEntrega === "ENTREGADO" ? 3 : 0,
        precio: 2300, subtotal: 6900,
      } },
    },
  });
  return { p, cliente };
}

test.describe("#797 — Pendientes de días anteriores en Hoy", () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== "true", "requiere Hub V2 activo");
  test.setTimeout(90000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  for (const [nombre, viewport] of [
    ["escritorio", { width: 1280, height: 850 }],
    ["móvil", { width: 390, height: 844 }],
  ] as const) {
    test(nombre + ": ADMIN ve ayer y hoy en la misma lista, con fecha original", async ({ page }) => {
      await page.setViewportSize(viewport);
      const ayer = await pedido(ayerBogota(), "17:40:00", "Ayer797");
      const deHoy = await pedido(hoyBogota(), "00:05:00", "Hoy797");
      await loginAs(page, "admin");
      await goto(page, "/pedidos");
      const app = appMain(page);
      await expect(app.getByTestId("pendientes-anteriores")).toHaveCount(0);
      await expect(app.getByTestId("operacion-row-" + ayer.p.id)).toBeVisible();
      await expect(app.getByTestId("operacion-row-" + deHoy.p.id)).toBeVisible();
      await expect(app.getByTestId("operacion-dia-anterior-" + ayer.p.id)).toContainText("De ayer");
      await expect(app.getByRole("heading", { name: "Pedidos de hoy y anteriores con actividad hoy", level: 2 })).toHaveCount(1);
      // Una sola fila por pedido en toda la pantalla: no se duplica.
      await expect(app.getByTestId("operacion-row-" + ayer.p.id)).toHaveCount(1);
      // La fecha del pedido sigue siendo la de ayer.
      const db797 = await db.pedido.findUniqueOrThrow({ where: { id: ayer.p.id } });
      expect(db797.fecha.toISOString()).toBe(fechaDe(ayerBogota(), "17:40:00").toISOString());
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= innerWidth + 1,
      )).toBe(true);
    });

    test(nombre + ": tras entregarlo hoy conserva una única fila como entregado", async ({ page }) => {
      await page.setViewportSize(viewport);
      const ayer = await pedido(ayerBogota(), "21:17:00", "Entrega797");
      await loginAs(page, "admin");
      await goto(page, "/pedidos");
      await expect(appMain(page).getByTestId("operacion-row-" + ayer.p.id)).toBeVisible();
      // Registrar un hecho físico, no interpretar entregadoAt como prueba suficiente.
      const fecha = new Date();
      await db.pedido.update({
        where: { id: ayer.p.id },
        data: { estadoEntrega: "ENTREGADO", estado: "ENTREGADO", entregadoAt: fecha,
          items: { updateMany: { where: {}, data: { cantEntrega: 3 } } } },
      });
      await db.historial.create({
        data: { entidad: "Pedido", registroId: ayer.p.id, accion: "UPDATE", fecha,
          datos: JSON.stringify({ accion: "ENTREGA_OFICINA", consultaEntrega: {
            version: 1, precisionFecha: "INSTANTE", fecha: fecha.toISOString(),
            repartidorId: null, cantidades: [{ producto: "PACA_AGUA", cantidad: 3 }],
          } }),
        },
      });
      await page.reload();
      const fila = appMain(page).getByTestId("operacion-row-" + ayer.p.id);
      await expect(fila).toBeVisible();
      await expect(appMain(page).getByTestId("operacion-entrega-hoy-" + ayer.p.id)).toContainText("Entregado hoy");
      await expect(fila).toHaveCount(1);
      await expect(appMain(page).getByTestId("pendientes-anteriores")).toHaveCount(0);
    });
  }

  test("sin pendientes de ayer la sección no aparece", async ({ page }) => {
    await pedido(hoyBogota(), "00:05:00", "SoloHoy797");
    await loginAs(page, "admin");
    await goto(page, "/pedidos");
    await expect(appMain(page).getByTestId("consulta-pedidos-hub")).toBeVisible();
    await expect(appMain(page).getByTestId("pendientes-anteriores")).toHaveCount(0);
    await expect(appMain(page).getByTestId("pendientes-anteriores-carga")).toHaveCount(0);
  });

  test("filtrar por una fecha pasada oculta la sección (no es «Hoy»)", async ({ page }) => {
    await pedido(ayerBogota(), "17:40:00", "Pasado797");
    await loginAs(page, "admin");
    await goto(page, `/pedidos?desde=${ayerBogota()}&hasta=${ayerBogota()}`);
    await expect(appMain(page).getByTestId("consulta-pedidos-hub")).toBeVisible();
    await expect(appMain(page).getByTestId("pendientes-anteriores")).toHaveCount(0);
  });

  test("CONTADOR ve el pendiente sin botón de acción", async ({ page }) => {
    const ayer = await pedido(ayerBogota(), "17:40:00", "Contador797");
    await loginAs(page, "contador");
    await goto(page, "/pedidos");
    const fila = appMain(page).getByTestId("operacion-row-" + ayer.p.id);
    await expect(fila).toBeVisible();
    await expect(fila.getByRole("button", { name: "Registrar entrega" })).toHaveCount(0);
  });
});
