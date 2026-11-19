// @tests #861: el formulario de Negocio muestra el texto del error del API (409 «modificado por otro
// admin») en el aviso rojo, sin romper la pantalla, y sigue abierto para reintentar.
import { PrismaClient } from "@prisma/client";
import { test, expect, loginAs, createCliente, createNegocio, goto, resetTestDatabase } from "./fixtures";

const db = new PrismaClient();

test.describe("#861 — error del API en el formulario de Negocio", () => {
  test.setTimeout(120000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  for (const [nombre, viewport] of [
    ["escritorio", { width: 1280, height: 850 }],
    ["móvil", { width: 390, height: 844 }],
  ] as const) {
    test(`${nombre}: un 409 muestra el mensaje y el formulario sigue abierto`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, "admin");
      const { cliente } = await createCliente(page, { nombre: "Cliente 861", telefono: "3009990861" });
      const { negocio } = await createNegocio(page, { clienteId: cliente.id, nombre: "Tienda 861", tipoNegocio: "Tienda" });
      // updatedAt con microsegundos: el guardado condicional por updatedAt no coincide → 409 real.
      await db.$executeRaw`UPDATE "Negocio" SET "updatedAt" = '2026-11-01 10:00:00.123456' WHERE id = ${negocio.id}`;

      await goto(page, `/clientes?openCliente=${cliente.id}`);
      await page.getByRole("button", { name: `Ver detalle de ${negocio.nombre}` }).hover();
      await page.getByTitle("Editar negocio").click();
      await expect(page.getByTestId("negocio-horario-editor")).toBeVisible();

      await page.getByRole("button", { name: "Actualizar" }).click();
      await expect(page.getByText("El negocio fue modificado por otro admin. Recarga y vuelve a intentar.")).toBeVisible();
      await expect(page.getByText(/Objects are not valid as a React child/)).toHaveCount(0);
      // el formulario sigue ahí para reintentar y conserva lo escrito
      await expect(page.getByRole("button", { name: "Actualizar" })).toBeVisible();
      await expect(page.getByDisplayValue("Tienda 861")).toBeVisible();
    });
  }
});
