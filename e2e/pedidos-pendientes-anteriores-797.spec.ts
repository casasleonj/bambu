// @tests #797: los pendientes de días anteriores se ven en «Hoy» sin duplicar
// pedidos ni mezclarse con los creados hoy; al entregarlos salen de la sección.
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
    test(nombre + ": ADMIN ve el pendiente de ayer con su fecha original, aparte de los de hoy", async ({ page }) => {
      await page.setViewportSize(viewport);
      const ayer = await pedido(ayerBogota(), "17:40:00", "Ayer797");
      const deHoy = await pedido(hoyBogota(), "00:05:00", "Hoy797");
      await loginAs(page, "admin");
      await goto(page, "/pedidos");
      const app = appMain(page);
      const seccion = app.getByTestId("pendientes-anteriores");
      await expect(seccion).toBeVisible();
      await expect(seccion).toContainText("Pendientes de días anteriores (1)");
      await expect(seccion).toContainText("No cuentan como pedidos creados hoy");
      // Fecha original y antigüedad, sin tocar la fecha del pedido.
      await expect(seccion.getByTestId("operacion-arrastre-" + ayer.p.id)).toContainText("hace 1 día");
      await expect(seccion.getByTestId("operacion-row-" + ayer.p.id)).toBeVisible();
      // El de hoy NO está en la sección y sí en la lista principal.
      await expect(seccion.getByTestId("operacion-row-" + deHoy.p.id)).toHaveCount(0);
      await expect(app.getByTestId("operacion-row-" + deHoy.p.id)).toBeVisible();
      // El título de la lista principal aparece una sola vez (QA: se duplicó al mover el encabezado).
      await expect(app.getByRole("heading", { name: "Pedidos de hoy", level: 2 })).toHaveCount(1);
      // Una sola fila por pedido en toda la pantalla: no se duplica.
      await expect(app.getByTestId("operacion-row-" + ayer.p.id)).toHaveCount(1);
      // La fecha del pedido sigue siendo la de ayer.
      const db797 = await db.pedido.findUniqueOrThrow({ where: { id: ayer.p.id } });
      expect(db797.fecha.toISOString()).toBe(fechaDe(ayerBogota(), "17:40:00").toISOString());
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= innerWidth + 1,
      )).toBe(true);
    });

    test(nombre + ": tras entregarlo desaparece de pendientes y no queda duplicado", async ({ page }) => {
      await page.setViewportSize(viewport);
      const ayer = await pedido(ayerBogota(), "21:17:00", "Entrega797");
      await loginAs(page, "admin");
      await goto(page, "/pedidos");
      const seccion = appMain(page).getByTestId("pendientes-anteriores");
      await expect(seccion).toContainText("Pendientes de días anteriores (1)");
      // Se entrega fuera de la pantalla (como lo haría el flujo existente) y se recarga.
      await db.pedido.update({
        where: { id: ayer.p.id },
        data: { estadoEntrega: "ENTREGADO", estado: "ENTREGADO", entregadoAt: new Date() },
      });
      await page.reload();
      await expect(appMain(page).getByTestId("pendientes-anteriores")).toHaveCount(0);
      await expect(appMain(page).getByTestId("operacion-row-" + ayer.p.id)).toHaveCount(0);
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
    const fila = appMain(page).getByTestId("pendientes-anteriores").getByTestId("operacion-row-" + ayer.p.id);
    await expect(fila).toBeVisible();
    await expect(fila.getByRole("button", { name: "Registrar entrega" })).toHaveCount(0);
  });
});
