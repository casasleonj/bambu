// @tests #841: «Pendientes de días anteriores» va antes que las entregas de pedidos
// anteriores, y estas empiezan plegadas en una línea que se despliega con un toque.
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

async function pedidoDeAyer(nombre: string, estado: "PENDIENTE" | "ENTREGADO") {
  const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
  const cliente = await db.cliente.create({
    data: { nombre: nombre + " " + randomUUID().slice(0, 8), telefono: randomUUID() },
  });
  const entregado = estado === "ENTREGADO";
  const p = await db.pedido.create({
    data: {
      clienteId: cliente.id, createdById: admin.id, canal: "DOMICILIO", origen: "PEDIDO",
      fecha: fechaDe(ayerBogota(), "17:40:00"), createdAt: fechaDe(ayerBogota(), "17:40:00"),
      entregadoAt: entregado ? fechaDe(hoyBogota(), "00:30:00") : null,
      estado, estadoEntrega: estado, estadoPago: "PENDIENTE",
      total: 6900, totalPagado: 0, saldo: 6900,
      items: { create: { producto: "PACA_AGUA", cantPedido: 3, cantEntrega: entregado ? 3 : 0, precio: 2300, subtotal: 6900 } },
    },
  });
  if (entregado) {
    await db.historial.create({
      data: {
        entidad: "Pedido", registroId: p.id, accion: "UPDATE", fecha: fechaDe(hoyBogota(), "00:30:00"),
        datos: JSON.stringify({
          accion: "ENTREGA_OFICINA",
          consultaEntrega: {
            version: 1, precisionFecha: "INSTANTE", fecha: fechaDe(hoyBogota(), "00:30:00").toISOString(),
            repartidorId: null, cantidades: [{ producto: "PACA_AGUA", cantidad: 3 }],
          },
        }),
      },
    });
  }
  return p;
}

test.describe("#841 — pendientes primero, entregas plegadas", () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== "true", "requiere Hub V2 activo");
  test.setTimeout(90000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  for (const [nombre, viewport] of [
    ["escritorio", { width: 1280, height: 850 }],
    ["móvil", { width: 390, height: 844 }],
  ] as const) {
    test(nombre + ": los pendientes van antes; las entregas empiezan plegadas y se despliegan", async ({ page }) => {
      await page.setViewportSize(viewport);
      const pendiente = await pedidoDeAyer("Pend841", "PENDIENTE");
      const entregado = await pedidoDeAyer("Entr841", "ENTREGADO");
      await loginAs(page, "admin");
      await goto(page, "/pedidos");
      const app = appMain(page);
      const pendientes = app.getByTestId("pendientes-anteriores");
      const entregas = app.getByTestId("entregas-historicas-763");
      await expect(pendientes).toBeVisible();
      await expect(entregas).toBeVisible();
      // Orden en pantalla: pendientes, luego entregas, luego la lista de hoy.
      const posicion = (a: string, b: string) =>
        page.evaluate(([x, y]) => {
          const ea = document.querySelector(`[data-testid="${x}"]`);
          const eb = document.querySelector(`[data-testid="${y}"]`);
          return !!ea && !!eb && !!(ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING);
        }, [a, b]);
      expect(await posicion("pendientes-anteriores", "entregas-historicas-763")).toBe(true);
      // Plegada: una línea con el conteo y sin la tarjeta.
      const toggle = entregas.getByTestId("entregas-historicas-toggle");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toContainText("1 pedido anterior con entregas hoy");
      await expect(entregas.getByTestId("entrega-historica-" + entregado.numero)).toHaveCount(0);
      // La acción de lo pendiente sigue a la vista sin tocar nada.
      await expect(pendientes.getByTestId("operacion-row-" + pendiente.id)).toBeVisible();
      // Se despliega con un toque y muestra la tarjeta de siempre.
      await toggle.click();
      await expect(entregas.getByTestId("entregas-historicas-toggle")).toHaveAttribute("aria-expanded", "true");
      await expect(entregas.getByTestId("entrega-historica-" + entregado.numero)).toContainText("3 pacas de agua");
      // Y se vuelve a plegar.
      await entregas.getByTestId("entregas-historicas-toggle").click();
      await expect(entregas.getByTestId("entrega-historica-" + entregado.numero)).toHaveCount(0);
      // Recargar vuelve a empezar plegada (no se recuerda).
      await entregas.getByTestId("entregas-historicas-toggle").click();
      await page.reload();
      await expect(appMain(page).getByTestId("entregas-historicas-toggle")).toHaveAttribute("aria-expanded", "false");
      // La línea plegada es un objetivo táctil suficiente.
      const caja = await appMain(page).getByTestId("entregas-historicas-toggle").boundingBox();
      expect((caja?.height ?? 0) >= 44).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  }

  test("sin entregas de pedidos anteriores no hay línea plegada y los pendientes siguen", async ({ page }) => {
    await pedidoDeAyer("SoloPend841", "PENDIENTE");
    await loginAs(page, "admin");
    await goto(page, "/pedidos");
    await expect(appMain(page).getByTestId("pendientes-anteriores")).toBeVisible();
    await expect(appMain(page).getByTestId("entregas-historicas-763")).toHaveCount(0);
  });

  test("teclado: la línea se despliega con Enter", async ({ page }) => {
    await pedidoDeAyer("Teclado841", "ENTREGADO");
    await loginAs(page, "admin");
    await goto(page, "/pedidos");
    const toggle = appMain(page).getByTestId("entregas-historicas-toggle");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(appMain(page).getByTestId("entregas-historicas-toggle")).toHaveAttribute("aria-expanded", "true");
  });
});
