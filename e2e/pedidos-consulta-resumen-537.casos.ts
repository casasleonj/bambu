// @tests #537 (#504) — resumen colapsable de la consulta: cerrado por defecto en móvil,
// abierto en escritorio, y la elección se recuerda por dispositivo.
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  loginAs,
  goto,
  appMain,
  resetTestDatabase,
} from "./fixtures";
const db = new PrismaClient();
const hoy = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

async function pedidoDeHoy() {
  const admin = await db.user.findUniqueOrThrow({
    where: { username: "admin" },
  });
  const c = await db.cliente.create({
    data: {
      nombre: `Resumen 537 ${randomUUID().slice(0, 6)}`,
      telefono: randomUUID(),
    },
  });
  const total = 20000;
  const fecha = new Date(`${hoy()}T10:20:00-05:00`);
  await db.pedido.create({
    data: {
      clienteId: c.id,
      createdById: admin.id,
      canal: "PUNTO",
      fecha,
      createdAt: fecha,
      estado: "PENDIENTE",
      estadoEntrega: "PENDIENTE",
      estadoPago: "PENDIENTE",
      total,
      totalPagado: 0,
      saldo: total,
      items: {
        create: {
          producto: "PACA_HIELO",
          cantPedido: 4,
          cantEntrega: 0,
          precio: 5000,
          subtotal: total,
        },
      },
    },
  });
}

test.describe("Resumen colapsable de la consulta (#537)", () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== "true", "requiere Hub ON");
  test.setTimeout(60000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  test("móvil: cerrado con la línea corta, se abre con «Ver detalle» y se recuerda; escritorio: abierto", async ({
    page,
  }, info) => {
    const movil = info.project.name.includes("mobile");
    await pedidoDeHoy();
    await loginAs(page, "admin");
    await goto(page, "/pedidos?resumen=1");
    const app = appMain(page);
    const boton = app.getByTestId("consulta-resumen-alternar");
    const detalle = app.locator("#consulta-resumen-detalle");
    await expect(app.getByTestId("consulta-resumen")).toBeVisible();

    if (!movil) {
      await expect(boton).toHaveAttribute("aria-expanded", "true");
      await expect(boton).toHaveText("Ocultar detalle");
      await expect(detalle).toBeVisible();
      await expect(app.getByTestId("consulta-resumen-linea")).toHaveCount(0);
      return;
    }

    await expect(boton).toHaveAttribute("aria-expanded", "false");
    await expect(boton).toHaveText("Ver detalle");
    await expect(detalle).toBeHidden();
    await expect(app.getByTestId("consulta-resumen-linea")).toContainText(
      /Importe.*\$\s*20\.000/,
    );
    await expect(app.getByTestId("consulta-resumen-linea")).toContainText(
      "Saldo",
    );

    await boton.click();
    await expect(boton).toHaveAttribute("aria-expanded", "true");
    await expect(detalle).toBeVisible();
    await expect(app.getByTestId("consulta-resumen-linea")).toHaveCount(0);

    // Se recuerda en este dispositivo: tras recargar sigue abierto.
    await page.reload();
    await expect(
      appMain(page).getByTestId("consulta-resumen-alternar"),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(appMain(page).locator("#consulta-resumen-detalle")).toBeVisible();

    // Y si lo cierra, también se recuerda.
    await appMain(page).getByTestId("consulta-resumen-alternar").click();
    await page.reload();
    await expect(
      appMain(page).getByTestId("consulta-resumen-alternar"),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
});
