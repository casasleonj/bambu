// @tests #836 F1: vistas por FECHA PROMETIDA («Entrega prevista hoy o atrasada» y «Programados»),
// etiqueta de compromiso en cada fila y cambio de fecha con historial. Matriz A01–A05, A21, A23.
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  test, expect, loginAs, goto, resetTestDatabase,
} from "./fixtures";

const db = new PrismaClient();
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const dia = (n: number) => {
  const [a, m, d] = hoyBogota().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
const en = (d: string, h = "10:00:00") => new Date(`${d}T${h}-05:00`);

async function pedido(nombre: string, o: { prometido: Date | null; estado?: "PENDIENTE" | "ENTREGADO" }) {
  const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
  const cliente = await db.cliente.create({ data: { nombre: `${nombre} ${randomUUID().slice(0, 6)}`, telefono: randomUUID() } });
  const estado = o.estado ?? "PENDIENTE";
  const creado = en(dia(-3));
  return db.pedido.create({
    data: {
      clienteId: cliente.id, createdById: admin.id, canal: "DOMICILIO", origen: "PEDIDO",
      fecha: creado, createdAt: creado, fechaEntrega: o.prometido,
      estado, estadoEntrega: estado, estadoPago: "PENDIENTE", total: 5000, totalPagado: 0, saldo: 5000,
    },
  });
}
const compromiso = (id: string) => `[data-testid="operacion-compromiso-${id}"]`;
const fila = (id: string) => `[data-testid="operacion-row-${id}"]`;

test.describe("#836 F1 — fecha prometida", () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== "true", "requiere Hub V2 activo");
  test.setTimeout(90000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  for (const [nombre, viewport] of [
    ["escritorio", { width: 1280, height: 850 }],
    ["móvil", { width: 390, height: 844 }],
  ] as const) {
    test(`${nombre}: «hoy» incluye el creado antes y el atrasado; «programados» solo futuros; anulados fuera`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const hoy = await pedido("Hoy836", { prometido: en(dia(0), "16:00:00") }); // A02
      const ayer = await pedido("Ayer836", { prometido: en(dia(-1)) }); // A03
      const futuro = await pedido("Futuro836", { prometido: en(dia(2)) }); // A01
      const entregado = await pedido("Entregado836", { prometido: en(dia(-1)), estado: "ENTREGADO" }); // A23
      await loginAs(page, "admin");

      await goto(page, "/pedidos?foco=paraHoy&pageSize=100");
      await expect(page.locator(compromiso(hoy.id))).toHaveText(/Para hoy/);
      await expect(page.locator(compromiso(ayer.id))).toHaveText(/Arrastrado · previsto/);
      await expect(page.locator(fila(futuro.id))).toHaveCount(0);
      await expect(page.locator(fila(entregado.id))).toHaveCount(0);

      await goto(page, "/pedidos?foco=programados&pageSize=100");
      await expect(page.locator(compromiso(futuro.id))).toHaveText(/Programado ·/);
      await expect(page.locator(fila(hoy.id))).toHaveCount(0);
      await expect(page.locator(fila(ayer.id))).toHaveCount(0);
    });
  }

  test("cambiar la fecha de un atrasado: avisa, guarda historial, lo mueve a «Programados» y no toca creación ni entrega", async ({ page }) => {
    const p = await pedido("Atrasado836", { prometido: en(dia(-1)) });
    await loginAs(page, "admin");
    await goto(page, "/pedidos?foco=paraHoy&pageSize=100");
    await page.locator(fila(p.id)).click();
    await page.getByTestId("reprogramar-abrir").click();
    await expect(page.getByTestId("reprogramar-vencido")).toContainText("incumplimiento queda en el historial");

    await page.getByTestId("reprogramar-confirmar").click();
    await expect(page.getByTestId("reprogramar-error")).toContainText("Elige la nueva fecha");

    await page.getByTestId("reprogramar-fecha").fill(dia(3));
    await page.getByTestId("reprogramar-motivo").fill("El cliente pidió esperar");
    await page.getByTestId("reprogramar-confirmar").click();
    await expect(page.getByTestId("reprogramar-form")).toHaveCount(0);

    const h = await db.pedidoReprogramacion.findMany({ where: { pedidoId: p.id } });
    expect(h).toHaveLength(1);
    expect(h[0].vencidaAlReprogramar).toBe(true);
    expect(h[0].motivo).toBe("El cliente pidió esperar");
    const despues = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect(despues.createdAt.getTime()).toBe(p.createdAt.getTime());
    expect(despues.entregadoAt).toBeNull();

    await goto(page, "/pedidos?foco=paraHoy&pageSize=100");
    await expect(page.locator(fila(p.id))).toHaveCount(0);
    await goto(page, "/pedidos?foco=programados&pageSize=100");
    await expect(page.locator(compromiso(p.id))).toHaveText(/Programado ·/);
  });

  test("adversarial: si otra persona cambió la fecha, avisa del conflicto y no pisa ni crea historial (A21)", async ({ page }) => {
    const p = await pedido("Conflicto836", { prometido: en(dia(1)) });
    await loginAs(page, "admin");
    await goto(page, "/pedidos?foco=programados&pageSize=100");
    await page.locator(fila(p.id)).click();
    await page.getByTestId("reprogramar-abrir").click();
    await db.pedido.update({ where: { id: p.id }, data: { fechaEntrega: en(dia(2)) } });
    await page.getByTestId("reprogramar-fecha").fill(dia(5));
    await page.getByTestId("reprogramar-confirmar").click();
    await expect(page.getByTestId("reprogramar-error")).toContainText("Otra persona cambió la fecha");
    await expect(page.getByTestId("reprogramar-ver-actual")).toBeVisible();
    expect(await db.pedidoReprogramacion.count({ where: { pedidoId: p.id } })).toBe(0);
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).fechaEntrega?.getTime()).toBe(en(dia(2)).getTime());
  });

  test("un pedido entregado no ofrece cambiar la fecha prometida (A23)", async ({ page }) => {
    const p = await pedido("Entregado836b", { prometido: en(dia(-1)), estado: "ENTREGADO" });
    await loginAs(page, "admin");
    await goto(page, "/pedidos?all=true&estadoEntrega=ENTREGADO&pageSize=100");
    await page.locator(fila(p.id)).click();
    await expect(page.getByTestId("peek-relaciones")).toBeVisible();
    await expect(page.getByTestId("reprogramar-abrir")).toHaveCount(0);
  });
});
