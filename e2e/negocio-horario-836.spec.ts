// @tests #836 F2a: horario de atención semanal por negocio. Edición con turno partido, validación,
// ficha, y avisos «Negocio cerrado ese día» (lista y cambio de fecha) que nunca bloquean.
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { test, expect, loginAs, createCliente, createNegocio, goto, waitForToast, resetTestDatabase } from "./fixtures";

const db = new PrismaClient();
const lunAVie = [1, 2, 3, 4, 5].flatMap((d) => [
  { diaSemana: d, desde: "06:00", hasta: "12:00" },
  { diaSemana: d, desde: "14:00", hasta: "20:00" },
]);

test.describe("#836 F2a — horario de atención por negocio", () => {
  test.setTimeout(120000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  test("el admin configura un turno partido, se guarda y se ve en la ficha; un horario inválido no guarda", async ({ page }) => {
    await loginAs(page, "admin");
    const { cliente } = await createCliente(page, { nombre: "Cliente Horario", telefono: "3009990001" });
    const { negocio } = await createNegocio(page, { clienteId: cliente.id, nombre: "Tienda La Esquina", tipoNegocio: "Tienda" });
    await goto(page, `/clientes?openCliente=${cliente.id}`);

    await page.getByRole("button", { name: `Ver detalle de ${negocio.nombre}` }).hover();
    await page.getByTitle("Editar negocio").click();
    await expect(page.getByTestId("negocio-horario-editor")).toBeVisible();

    // Lunes: turno partido 06–12 y 14–20.
    await page.getByTestId("horario-agregar-1").click();
    await page.getByTestId("horario-desde-1-0").fill("06:00");
    await page.getByTestId("horario-hasta-1-0").fill("12:00");
    await page.getByTestId("horario-agregar-1").click();
    await page.getByTestId("horario-desde-1-1").fill("14:00");
    await page.getByTestId("horario-hasta-1-1").fill("20:00");

    // Un tramo que termina antes de empezar: se explica y NO se guarda.
    await page.getByTestId("horario-hasta-1-1").fill("13:00");
    await expect(page.getByTestId("horario-errores")).toContainText("termina antes de empezar");
    await page.getByRole("button", { name: /Actualizar/ }).click();
    await expect(page.getByText(/Revisa el horario de atención/)).toBeVisible();
    expect(await db.negocioHorario.count({ where: { negocioId: negocio.id } })).toBe(0);

    // Se corrige, se copia el lunes a toda la semana y se cierra el domingo.
    await page.getByTestId("horario-hasta-1-1").fill("20:00");
    await page.getByTestId("horario-copiar-lunes").click();
    await page.getByRole("button", { name: "Quitar tramo 1 de Domingo" }).click();
    await page.getByRole("button", { name: "Quitar tramo 1 de Domingo" }).click();
    await expect(page.getByTestId("horario-cerrado-0")).toHaveText("Cerrado");
    await page.getByRole("button", { name: /Actualizar/ }).click();
    await waitForToast(page, "Negocio actualizado");

    const filas = await db.negocioHorario.findMany({ where: { negocioId: negocio.id } });
    expect(filas).toHaveLength(12); // lunes a sábado × 2 tramos
    expect(filas.some((f) => f.diaSemana === 0)).toBe(false);

    // Recarga: la ficha muestra el horario agrupado y el domingo cerrado.
    await goto(page, `/clientes?openCliente=${cliente.id}`);
    await page.getByRole("button", { name: `Ver detalle de ${negocio.nombre}` }).click();
    const ficha = page.getByTestId("negocio-horario-ficha");
    await expect(ficha).toContainText("Lun–Sáb 06:00–12:00 y 14:00–20:00");
    await expect(ficha).toContainText("Dom cerrado");
  });

  test("editar otro dato del negocio no toca su horario", async ({ page }) => {
    await loginAs(page, "admin");
    const { cliente } = await createCliente(page, { nombre: "Cliente Sin Tocar", telefono: "3009990002" });
    const { negocio } = await createNegocio(page, { clienteId: cliente.id, nombre: "Panadería Sol", tipoNegocio: "Panadería" });
    await db.negocioHorario.createMany({ data: lunAVie.map((h) => ({ negocioId: negocio.id, ...h })) });
    await goto(page, `/clientes?openCliente=${cliente.id}`);
    await page.getByRole("button", { name: `Ver detalle de ${negocio.nombre}` }).hover();
    await page.getByTitle("Editar negocio").click();
    await page.locator('input[placeholder="Ej: Restaurante El Sabor"]').fill("Panadería Sol Renovada");
    await page.getByRole("button", { name: /Actualizar/ }).click();
    await waitForToast(page, "Negocio actualizado");
    expect(await db.negocioHorario.count({ where: { negocioId: negocio.id } })).toBe(10);
  });

  test.describe("avisos en Pedidos", () => {
    test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== "true", "requiere Hub V2 activo");

    test("un pedido para un día que el negocio no atiende muestra el aviso, sigue visible y se puede reprogramar a un día cerrado", async ({ page }) => {
      const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
      const cliente = await db.cliente.create({ data: { nombre: `ClienteAviso ${randomUUID().slice(0, 6)}`, telefono: randomUUID() } });
      const abre = await db.negocio.create({ data: { clienteId: cliente.id, nombre: "Atiende Todo", horarios: { create: lunAVie } } });
      const sinHorario = await db.negocio.create({ data: { clienteId: cliente.id, nombre: "Sin Horario" } });
      // 2026-11-22 es domingo (Bogotá)
      const domingo = new Date("2026-11-22T17:00:00Z");
      const mk = (negocioId: string) => db.pedido.create({
        data: {
          clienteId: cliente.id, negocioId, createdById: admin.id, canal: "DOMICILIO", origen: "PEDIDO",
          estado: "PENDIENTE", estadoEntrega: "PENDIENTE", estadoPago: "PENDIENTE",
          total: 1000, totalPagado: 0, saldo: 1000, fechaEntrega: domingo,
        },
      });
      const conAviso = await mk(abre.id);
      const sinAviso = await mk(sinHorario.id);
      await loginAs(page, "admin");
      await goto(page, "/pedidos?all=true&pageSize=50");

      await expect(page.getByTestId(`operacion-cierre-${conAviso.id}`)).toHaveText("Negocio cerrado ese día");
      await expect(page.locator(`[data-testid="operacion-row-${conAviso.id}"]`)).toBeVisible(); // nunca se oculta
      await expect(page.getByTestId(`operacion-cierre-${sinAviso.id}`)).toHaveCount(0); // sin horario no se afirma nada

      // Reprogramar a otro domingo: avisa, pero deja confirmar.
      await page.locator(`[data-testid="operacion-row-${conAviso.id}"]`).click();
      await page.getByTestId("reprogramar-abrir").click();
      await page.getByTestId("reprogramar-fecha").fill("2026-11-29");
      await expect(page.getByTestId("reprogramar-negocio-cierra")).toContainText("no atiende los domingos");
      await page.getByTestId("reprogramar-confirmar").click();
      await expect(page.getByTestId("reprogramar-form")).toHaveCount(0);
      expect(await db.pedidoReprogramacion.count({ where: { pedidoId: conAviso.id } })).toBe(1);
    });
  });
});
