// @tests #515 #516 — interfaz V6, consulta completa y proceso real sin embarque.
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
const hora = (hh: string) => new Date(`${hoy()}T${hh}-05:00`);
async function preparar() {
  const admin = await db.user.findUniqueOrThrow({
    where: { username: "admin" },
  });
  const c = await db.cliente.create({
    data: {
      nombre: `Consulta 516 ${randomUUID().slice(0, 6)}`,
      telefono: randomUUID(),
    },
  });
  const r1 = await db.trabajador.create({
      data: {
        nombre: "Juan Consulta516",
        rol: "REPARTIDOR",
        usaMoto: true,
        activo: true,
      },
    }),
    r2 = await db.trabajador.create({
      data: {
        nombre: "Pedro Consulta516",
        rol: "REPARTIDOR",
        usaMoto: true,
        activo: true,
      },
    });
  await db.config.upsert({
    where: { clave: "GESTION_ADMIN_SIN_EMBARQUE" },
    create: { clave: "GESTION_ADMIN_SIN_EMBARQUE", valor: "true" },
    update: { valor: "true" },
  });
  const crear = async (
    canal: "PUNTO" | "DOMICILIO",
    cantidad: number,
    pagado = 0,
    entregadas = 0,
  ) => {
    const total = cantidad * 5000,
      p = await db.pedido.create({
        data: {
          clienteId: c.id,
          createdById: admin.id,
          canal,
          fecha: hora("10:20:00"),
          createdAt: hora("09:20:00"),
          estado: entregadas === cantidad ? "ENTREGADO" : "PENDIENTE",
          estadoEntrega: entregadas === cantidad ? "ENTREGADO" : "PENDIENTE",
          estadoPago:
            pagado === total ? "PAGADO" : pagado ? "PARCIAL" : "PENDIENTE",
          total,
          totalPagado: pagado,
          saldo: total - pagado,
          items: {
            create: {
              producto: "PACA_HIELO",
              cantPedido: cantidad,
              cantEntrega: entregadas,
              precio: 5000,
              subtotal: total,
            },
          },
        },
      });
    const factura = await db.factura.create({
      data: {
        numero: `F516-${randomUUID().slice(0, 6)}`,
        clienteId: c.id,
        pedidoId: p.id,
        total,
        subtotal: total,
        montoPagado: pagado,
        saldo: total - pagado,
      },
    });
    return { p, factura };
  };
  return { c, r1, r2, crear };
}
test.describe("Consulta V6 de Pedidos (#516)", () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== "true", "requiere Hub ON");
  test.setTimeout(60000);
  test.beforeEach(() => resetTestDatabase());
  test.afterAll(() => db.$disconnect());

  test("sin ruido inicial; canal y rango suman la consulta, muestran producto/cantidad y conservan filtros al volver", async ({
    page,
  }, info) => {
    const { c, crear } = await preparar();
    await crear("PUNTO", 4, 10000);
    await crear("DOMICILIO", 2);
    await loginAs(page, "admin");
    await goto(page, "/pedidos");
    const app = appMain(page);
    await expect(
      app.getByRole("heading", { level: 1, name: /Pedidos de hoy/i }),
    ).toBeVisible();
    await expect(app.getByTestId("consulta-resumen")).toHaveCount(0);
    await app
      .getByLabel("Canal de venta", { exact: true })
      .selectOption("PUNTO");
    await app.getByPlaceholder("Nombre, teléfono o #pedido").fill(c.nombre);
    await app.getByRole("button", { name: "Más filtros", exact: true }).click();
    await app.getByLabel("Desde la hora", { exact: true }).fill("10:00");
    await app.getByLabel("Hasta la hora", { exact: true }).fill("11:00");
    await app
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click();
    const resumen = app.getByTestId("consulta-resumen");
    await expect(resumen).toContainText(/\$\s*20\.000/);
    await expect(resumen).toContainText(/\$\s*10\.000/);
    await expect(resumen).toContainText("Por entregar:");
    await expect(app.locator('[data-testid^="operacion-row-"]')).toHaveCount(1);
    await expect(app.getByTestId("consulta-productos-resumen")).toContainText(
      "4 pedidas",
    );
    await expect(app.getByText(/Creado por/).first()).toBeVisible();
    await app.getByRole("button", { name: "Más filtros", exact: true }).click();
    await page.screenshot({
      path: info.outputPath("consulta-v6.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const viewport = page.viewportSize()!;
    for (const width of info.project.name.includes("mobile")
      ? [320]
      : [1366, 1440]) {
      await page.setViewportSize({ width, height: viewport.height });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`consulta-v6-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize(viewport);
    await app
      .getByRole("button", { name: "Limpiar filtros", exact: true })
      .click();
    await expect(app.getByTestId("consulta-resumen")).toHaveCount(0);
    await page.goBack();
    await expect(resumen).toContainText(/\$\s*20\.000/);
    await expect(app.getByLabel("Canal de venta", { exact: true })).toHaveValue(
      "PUNTO",
    );
  });

  test("varios repartidores y horario de entrega suman deltas, no el acumulado ni pedidos duplicados", async ({
    page,
  }) => {
    const { c, r1, r2, crear } = await preparar(),
      { p } = await crear("DOMICILIO", 4, 10000, 2);
    for (const [hh, repartidorId] of [
      ["10:20:00", r1.id],
      ["11:30:00", r2.id],
    ])
      await db.historial.create({
        data: {
          entidad: "Pedido",
          registroId: p.id,
          accion: "UPDATE",
          datos: JSON.stringify({
            accion: "ENTREGA_OFICINA",
            consultaEntrega: {
              version: 1,
              precisionFecha: "INSTANTE",
              fecha: hora(hh).toISOString(),
              repartidorId,
              cantidades: [{ producto: "PACA_HIELO", cantidad: 1 }],
            },
          }),
        },
      });
    await loginAs(page, "admin");
    await goto(page, `/pedidos?clienteId=${c.id}`);
    const app = appMain(page);
    await app.getByRole("button", { name: "Más filtros", exact: true }).click();
    await app
      .getByLabel("Usar la fecha y hora de", { exact: true })
      .selectOption("entrega");
    await app.getByLabel("Desde la hora", { exact: true }).fill("10:20");
    await app.getByLabel("Hasta la hora", { exact: true }).fill("10:20");
    await app.getByTestId("consulta-repartidores").click();
    await app.getByLabel(r1.nombre, { exact: true }).check();
    await app.getByLabel(r2.nombre, { exact: true }).check();
    const respuesta = page.waitForResponse(
      (r) =>
        r.url().includes("/api/pedidos/consulta?") &&
        r.url().includes("fechaBase=entrega"),
    );
    await app
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click();
    expect((await respuesta).status()).toBe(200);
    await expect(app.getByTestId("consulta-productos-resumen")).toContainText(
      "1 entregadas en el rango",
    );
    await expect(app.locator('[data-testid^="operacion-row-"]')).toHaveCount(1);
    await expect(app.getByTestId(`operacion-row-${p.id}`)).toContainText(
      "4 pedidas · 2 entregadas · 2 por entregar",
    );
  });

  test("Planificar permanece secundario, abrirlo no asigna; entrega directa registra parciales en la base y audita deltas", async ({
    page,
  }) => {
    const { c, r1, crear } = await preparar(),
      { p } = await crear("DOMICILIO", 4);
    await db.pedido.update({
      where: { id: p.id },
      data: { createdAt: new Date(Date.now() - 60000) },
    });
    await loginAs(page, "admin");
    await goto(page, `/pedidos?clienteId=${c.id}`);
    const row = appMain(page).getByTestId(`operacion-row-${p.id}`);
    await row.getByRole("button", { name: /Planificar en embarque/ }).click();
    const plan = page
      .getByRole("dialog")
      .filter({
        has: page.getByRole("heading", {
          name: "Asignar a Embarque",
          exact: true,
        }),
      });
    await expect(plan).toBeVisible();
    expect(
      (await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).embarqueId,
    ).toBeNull();
    await page.keyboard.press("Escape");
    await expect(plan).toHaveCount(0);
    await row
      .getByRole("button", { name: "Registrar entrega", exact: true })
      .click();
    const dialog = page.getByTestId("registrar-entrega");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("alcance-menos").check();
    await dialog
      .getByLabel("Cantidad entregada de Paca Hielo", { exact: true })
      .fill("2");
    await dialog.getByLabel(/¿Quién lo entregó/).selectOption(r1.id);
    await dialog.getByTestId("re-revisar").click();
    const actualizada = page.waitForResponse(async r => {
      if (!r.url().includes('/api/pedidos/consulta?') || !r.ok()) return false;
      const data = await r.json().catch(()=>null);
      return data?.pedidos?.some((pedido: {id:string;items:Array<{cantEntrega:number}>})=>pedido.id===p.id && pedido.items.some(i=>i.cantEntrega===2)) ?? false;
    });
    await dialog.getByTestId("re-guardar").click();
    await expect(dialog).toHaveCount(0);
    const saved = await db.pedido.findUniqueOrThrow({
      where: { id: p.id },
      include: { items: true },
    });
    expect(saved.embarqueId).toBeNull();
    expect(saved.entregadoPorId).toBe(r1.id);
    expect(saved.items[0].cantEntrega).toBe(2);
    expect(Number(saved.saldo)).toBe(20000);
    const eventos = await db.historial.findMany({
      where: {
        entidad: "Pedido",
        registroId: p.id,
        datos: { contains: "consultaEntrega" },
      },
    });
    expect(eventos).toHaveLength(1);
    expect(JSON.parse(eventos[0].datos).consultaEntrega).toMatchObject({
      precisionFecha: "INSTANTE",
      repartidorId: r1.id,
      cantidades: [{ producto: "PACA_HIELO", cantidad: 2 }],
    });
    await actualizada;
    await expect(row).toContainText(
      "4 pedidas · 2 entregadas · 2 por entregar",
    );
    await page.reload();
    await expect(
      appMain(page).getByTestId(`operacion-row-${p.id}`),
    ).toContainText("Entrega parcial");
  });

  test("factura exacta, regreso al mismo pedido y consulta; el enlace en otra pestaña conserva el rango", async ({
    page,
  }) => {
    const { c, crear } = await preparar(),
      { p, factura } = await crear("DOMICILIO", 4, 10000, 4);
    await loginAs(page, "admin");
    const path = `/pedidos?clienteId=${c.id}&desde=${hoy()}&hasta=${hoy()}&desdeHora=10:00&hastaHora=11:00`;
    await goto(page, path);
    const row = appMain(page).getByTestId(`operacion-row-${p.id}`);
    const href = await row
      .getByRole("link", { name: `Ver pedido #${p.numero}`, exact: true })
      .getAttribute("href");
    const otra = await page.context().newPage();
    await goto(otra, href!);
    await expect(
      otra.getByRole("dialog", { name: `Pedido #${p.numero}`, exact: true }),
    ).toBeVisible();
    expect(new URL(otra.url()).searchParams.get("desdeHora")).toBe("10:00");
    await otra.close();
    await row
      .getByRole("link", { name: `Ver factura ${factura.numero}`, exact: true })
      .click();
    const modal = page.getByTestId("factura-consulta-modal");
    await expect(modal).toContainText(factura.numero);
    await modal
      .getByRole("button", {
        name: `Volver al pedido #${p.numero}`,
        exact: true,
      })
      .click();
    const pedido = page.getByRole("dialog", {
      name: `Pedido #${p.numero}`,
      exact: true,
    });
    await expect(pedido).toBeVisible();
    await pedido
      .getByRole("button", { name: "Volver a Pedidos", exact: true })
      .click();
    await expect(row).toBeVisible();
    expect(new URL(page.url()).searchParams.get("hastaHora")).toBe("11:00");
  });

  test("un fallo de actualización conserva cifras y no convierte el resumen en cero", async ({
    page,
  }) => {
    const { c, crear } = await preparar();
    await crear("PUNTO", 4, 10000, 4);
    await loginAs(page, "admin");
    await goto(page, `/pedidos?clienteId=${c.id}`);
    const app = appMain(page);
    await expect(app.getByTestId("consulta-resumen")).toContainText(
      /\$\s*20\.000/,
    );
    await page.route("**/api/pedidos/consulta?**", (r) =>
      r.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { message: "Fallo simulado de consulta" },
        }),
      }),
    );
    await app
      .getByPlaceholder("Nombre, teléfono o #pedido")
      .fill("consulta nueva");
    await app
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click();
    await expect(app.getByTestId("pedido-hub-error-datos")).toBeVisible();
    await expect(app.getByTestId("consulta-resumen")).toContainText(
      /\$\s*20\.000/,
    );
    await expect(app.locator('[data-testid^="operacion-row-"]')).toHaveCount(1);
  });

  test("apagar gestión directa conserva planificación y no la habilita por defecto", async ({
    page,
  }) => {
    const { c, crear } = await preparar(),
      { p } = await crear("DOMICILIO", 4);
    await db.config.update({
      where: { clave: "GESTION_ADMIN_SIN_EMBARQUE" },
      data: { valor: "false" },
    });
    await loginAs(page, "admin");
    await goto(page, `/pedidos?clienteId=${c.id}`);
    const row = appMain(page).getByTestId(`operacion-row-${p.id}`);
    await expect(
      row.getByRole("button", { name: "Registrar entrega", exact: true }),
    ).toBeDisabled();
    await expect(
      row.getByRole("button", { name: /Planificar en embarque/ }),
    ).toBeEnabled();
    await expect(appMain(page)).toContainText("Gestión directa desactivada");
  });

  test("ASISTENTE consulta con su factura (#556); la API niega datos de Pedidos a REPARTIDOR", async ({
    page,
  }) => {
    const { c, crear } = await preparar(),
      { p } = await crear("DOMICILIO", 4);
    await loginAs(page, "asistente");
    await goto(page, `/pedidos?clienteId=${c.id}`);
    await expect(
      appMain(page).getByTestId(`operacion-row-${p.id}`),
    ).toBeVisible();
    await expect(
      appMain(page).getByRole("link", { name: /Ver factura/ }).first(),
    ).toBeVisible();
    const data = await page.request.get(
      `/api/pedidos/consulta?clienteId=${c.id}`,
    );
    expect(data.status()).toBe(200);
    expect((await data.json()).pedidos[0].factura).toBeDefined();
    await page.context().clearCookies();
    await loginAs(page, "repartidor");
    const denegada = await page.request.get("/api/pedidos/consulta");
    expect(denegada.status()).toBe(403);
    expect(await denegada.json()).not.toHaveProperty("pedidos");
  });
  test("Activos, Todos y Anulados no conservan estados incompatibles ni suman anulaciones", async ({
    page,
  }) => {
    const { c, crear } = await preparar();
    await crear("PUNTO", 4);
    const a = await crear("PUNTO", 4),
      b = await crear("PUNTO", 4);
    await db.pedido.update({
      where: { id: a.p.id },
      data: {
        estado: "ANULADO",
        estadoEntrega: "ANULADO",
        estadoPago: "ANULADO",
      },
    });
    await db.pedido.update({
      where: { id: b.p.id },
      data: {
        estado: "CANCELADO",
        estadoEntrega: "CANCELADO",
        estadoPago: "ANULADO",
      },
    });
    await loginAs(page, "admin");
    await goto(page, `/pedidos?clienteId=${c.id}`);
    const app = appMain(page);
    await expect(app.locator('[data-testid^="operacion-row-"]')).toHaveCount(1);
    await app.getByRole("button", { name: "Más filtros", exact: true }).click();
    await app
      .getByRole("group", { name: "Estado del registro", exact: true })
      .getByRole("button", { name: "Todos", exact: true })
      .click();
    await app
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click();
    await expect(app.locator('[data-testid^="operacion-row-"]')).toHaveCount(3);
    await expect(app.getByTestId("consulta-resumen")).toContainText(
      /\$\s*20\.000/,
    );
    await app.getByLabel("Entrega", { exact: true }).selectOption("PENDIENTE");
    await app.getByRole("button", { name: "Anulados", exact: true }).click();
    await app
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click();
    await expect(app.locator('[data-testid^="operacion-row-"]')).toHaveCount(1);
    await expect(app.getByTestId(`operacion-row-${a.p.id}`)).toBeVisible();
    await expect(app.getByTestId("consulta-resumen")).not.toContainText(
      /\$\s*20\.000/,
    );
  });
});
