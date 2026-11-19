// @tests #851: las vistas por fecha prometida no hablan de fecha del pedido (título, chips, etiqueta,
// resumen, panel de filtros), tienen enlace para volver y mensaje propio cuando no hay entregas.
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { test, expect, loginAs, goto, resetTestDatabase } from "./fixtures";

const db = new PrismaClient();
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const dia = (n: number) => {
  const [a, m, d] = hoyBogota().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
const en = (d: string, h = "10:00:00") => new Date(`${d}T${h}-05:00`);

async function pedido(nombre: string, prometido: Date) {
  const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
  const cliente = await db.cliente.create({ data: { nombre: `${nombre} ${randomUUID().slice(0, 6)}`, telefono: randomUUID() } });
  const creado = en(dia(-3));
  return db.pedido.create({
    data: {
      clienteId: cliente.id, createdById: admin.id, canal: "DOMICILIO", origen: "PEDIDO",
      fecha: creado, createdAt: creado, fechaEntrega: prometido,
      estado: "PENDIENTE", estadoEntrega: "PENDIENTE", estadoPago: "PENDIENTE", total: 5000, totalPagado: 0, saldo: 5000,
    },
  });
}

test.describe("#851 — rótulos de las vistas por fecha prometida", () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== "true", "requiere Hub V2 activo");
  test.setTimeout(90000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  for (const [nombre, viewport] of [
    ["escritorio", { width: 1280, height: 850 }],
    ["móvil", { width: 390, height: 844 }],
  ] as const) {
    test(`${nombre}: título propio, sin chips de período ni «Fecha del pedido», y enlace de regreso`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const atrasado = await pedido("Atrasado851", en(dia(-2)));
      await loginAs(page, "admin");

      await goto(page, "/pedidos?foco=paraHoy&pageSize=100");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Entregas previstas hoy o atrasadas");
      await expect(page.getByTestId("encabezado-compromiso")).toContainText("Por fecha prometida de entrega");
      await expect(page.getByTestId("consulta-filtros").getByRole("button", { name: "Hoy", exact: true })).toHaveCount(0);
      await expect(page.getByText("Fecha del pedido", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Pedidos de hoy")).toHaveCount(0);
      await expect(page.locator(`[data-testid="operacion-row-${atrasado.id}"]`)).toBeVisible();

      await page.getByRole("button", { name: /^Filtros/ }).click();
      await expect(page.getByLabel("Usar la fecha y hora de")).toHaveCount(0);

      // el enlace devuelve la pantalla de siempre, con «Hoy» marcado
      await page.getByRole("button", { name: "Ver por fecha del pedido" }).click();
      await expect(page).not.toHaveURL(/foco=paraHoy/);
      await expect(page.getByTestId("consulta-filtros").getByRole("button", { name: "Hoy", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Pedidos de/i);
    });
  }

  test("sin entregas: mensaje propio en ambas vistas; «Programados» con su título", async ({ page }) => {
    await loginAs(page, "admin");
    await goto(page, "/pedidos?foco=paraHoy&pageSize=100");
    await expect(page.getByText("No hay entregas previstas para hoy ni atrasadas")).toBeVisible();

    await goto(page, "/pedidos?foco=programados&pageSize=100");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Entregas programadas");
    await expect(page.getByText("No hay entregas programadas para días futuros")).toBeVisible();
  });
});
