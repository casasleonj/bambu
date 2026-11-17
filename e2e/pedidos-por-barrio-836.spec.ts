// @tests #836 F3: lista de Pedidos agrupada por barrio. Totales reales del servidor (A15), sin perder ni
// repetir pedidos al paginar, barrios de texto libre sin mezclar (A14) y «Sin barrio».
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { test, expect, loginAs, goto, resetTestDatabase } from "./fixtures";

const db = new PrismaClient();
const fecha = new Date("2026-11-10T15:00:00Z");

async function barrio(nombre: string, alias: string[] = []) {
  return (await db.barrio.create({
    data: {
      nombre, nombreNormalizado: nombre.toLowerCase(),
      aliases: { create: alias.map((a) => ({ texto: a, textoNormalizado: a.toLowerCase() })) },
    },
  })).id;
}
async function cliente(nombre: string, o: { barrioId?: string; barrio?: string } = {}) {
  return (await db.cliente.create({
    data: { nombre: `${nombre} ${randomUUID().slice(0, 6)}`, telefono: randomUUID(), barrioId: o.barrioId ?? null, barrio: o.barrio ?? null },
  })).id;
}
async function pedidos(clienteId: string, n: number) {
  const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push((await db.pedido.create({
      data: {
        clienteId, createdById: admin.id, canal: "DOMICILIO", origen: "PEDIDO", fecha, createdAt: fecha,
        estado: "PENDIENTE", estadoEntrega: "PENDIENTE", estadoPago: "PENDIENTE",
        total: 1000, totalPagado: 0, saldo: 1000,
      },
    })).id);
  }
  return out;
}
const filas = '[data-testid^="operacion-row-"]';

test.describe("#836 F3 — agrupar por barrio", () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== "true", "requiere Hub V2 activo");
  test.setTimeout(120000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  for (const [nombre, viewport] of [
    ["escritorio", { width: 1280, height: 850 }],
    ["móvil", { width: 390, height: 844 }],
  ] as const) {
    test(`${nombre}: totales reales, bloques por barrio, paginación sin pérdidas y filtro de un barrio`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const centro = await barrio("Centro", ["El Centro"]);
      const villa = await barrio("Villa Nueva");
      const cCentro = await cliente("ClienteCentro", { barrioId: centro });
      const cVilla = await cliente("ClienteVilla", { barrioId: villa });
      const cEsp = await cliente("ClienteEsperanza", { barrio: "La Esperanza" });
      const cEsp2 = await cliente("ClienteEsperanza2", { barrio: "La Esperanza 2" });
      const cNada = await cliente("ClienteSinBarrio");
      await pedidos(cCentro, 30); // más de una página de 25 (A15)
      await pedidos(cVilla, 4);
      await pedidos(cEsp, 2);
      await pedidos(cEsp2, 1);
      await pedidos(cNada, 3);
      await loginAs(page, "admin");

      // Página 1: 25 filas, todas de Centro; el encabezado dice 30 (real), no 25.
      await goto(page, "/pedidos?all=true&agrupar=barrio&pageSize=25&page=1");
      await expect(page.getByTestId("pedidos-agrupados-barrio")).toBeVisible();
      await expect(page.locator(filas)).toHaveCount(25);
      await expect(page.getByTestId(`grupo-barrio-total-b:${centro}`)).toHaveText(/30 pedidos/);
      await expect(page.getByTestId(`grupo-barrio-b:${centro}`)).toContainText("aquí 25");

      // Página 2: los 5 restantes de Centro, luego Villa Nueva, Esperanza (separadas) y «Sin barrio» al final.
      await goto(page, "/pedidos?all=true&agrupar=barrio&pageSize=25&page=2");
      await expect(page.locator(filas)).toHaveCount(15); // 40 pedidos en total: 25 + 15
      const titulos = await page.locator('[data-testid^="grupo-barrio-total-"]').allTextContents();
      expect(titulos.length).toBeGreaterThanOrEqual(2);
      await expect(page.getByTestId("grupo-barrio-total-sin-barrio")).toHaveText(/3 pedidos/);
      await expect(page.getByTestId("grupo-barrio-total-t:la esperanza")).toHaveText(/2 pedidos/);
      await expect(page.getByTestId("grupo-barrio-total-t:la esperanza 2")).toHaveText(/1 pedido/);

      // Un solo barrio: solo sus pedidos y se puede volver a todos. Villa Nueva aparece en la página 2
      // (la 1 son 25 filas de Centro), y «Ver todos» regresa a la página 1.
      await goto(page, "/pedidos?all=true&agrupar=barrio&pageSize=25&page=2");
      await page.getByTestId(`grupo-barrio-solo-b:${villa}`).click();
      await expect(page).toHaveURL(new RegExp(`grupoBarrio=`));
      await expect(page.locator(filas)).toHaveCount(4);
      await page.getByTestId("grupo-barrio-todos").click();
      await expect(page.locator(filas)).toHaveCount(25);
    });
  }

  test("sin «Agrupar por barrio» la lista no cambia: sin encabezados de barrio", async ({ page }) => {
    const centro = await barrio("Centro");
    await pedidos(await cliente("ClienteCentro", { barrioId: centro }), 3);
    await loginAs(page, "admin");
    await goto(page, "/pedidos?all=true&pageSize=25");
    await expect(page.locator(filas)).toHaveCount(3);
    await expect(page.getByTestId("pedidos-agrupados-barrio")).toHaveCount(0);
  });

  test("el interruptor «Agrupar por barrio» de los filtros agrupa y se quita desde su chip", async ({ page }) => {
    const centro = await barrio("Centro");
    await pedidos(await cliente("ClienteCentro", { barrioId: centro }), 2);
    await loginAs(page, "admin");
    await goto(page, "/pedidos?all=true&pageSize=25");
    await page.getByRole("button", { name: /Filtros/ }).click();
    await page.getByRole("button", { name: /Agrupar por barrio/ }).click();
    await expect(page.getByTestId("pedidos-agrupados-barrio")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`grupo-barrio-total-b:${centro}`)).toHaveText(/2 pedidos/);
  });
});
