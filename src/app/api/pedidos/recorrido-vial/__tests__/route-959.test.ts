import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  exigibles: vi.fn(),
  optimizar: vi.fn(),
  proveedor: vi.fn(),
  permiso: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/entregas-exigibles-db", () => ({
  leerExigibles: mocks.exigibles,
}));
vi.mock("@/lib/auth-check", () => ({
  requireAuth: mocks.auth,
  requirePermission: mocks.permiso,
}));
vi.mock("@/lib/api-response", () => ({
  apiSuccess: (datos: Record<string, unknown>) =>
    Response.json({ success: true, ...datos }),
  apiError: (mensaje: string, status: number) =>
    Response.json({ success: false, error: { message: mensaje } }, { status }),
}));
vi.mock("@/lib/geo/recorrido-vial-proveedor-server", () => ({
  comprobarProveedorRecorridoVial: mocks.proveedor,
  optimizarRecorridoVial: mocks.optimizar,
  ProveedorVialInvalidoError: class ProveedorVialInvalidoError extends Error {},
}));
vi.mock("@/lib/geo/google-route-optimization-server", () => ({
  GoogleRutaNoDisponibleError: class GoogleRutaNoDisponibleError extends Error {},
}));
vi.mock("@/lib/geo/heigit-vroom-server", () => ({
  HeiGitRutaNoDisponibleError: class HeiGitRutaNoDisponibleError extends Error {},
}));

const inicio = {
  id: "pedido-sintetico", clienteId: "cliente-sintetico",
  canal: "DOMICILIO", estadoEntrega: "PENDIENTE",
  fechaEntrega: null, entregaNoAntesDe: null, embarqueId: null,
  entregaLat: 10.0301, entregaLng: -73.2301,
  cliente: { lat: null, lng: null }, negocio: null,
  items: [{
    id: "linea-1", producto: "PACA_AGUA",
    cantPedido: 5, cantEntrega: 2,
    cantRegaloPedido: 0, cantRegaloEntrega: 0,
  }],
  cPacaAguaPed: 0, cPacaAguaEnt: 0,
  cPacaHieloPed: 0, cPacaHieloEnt: 0,
  cBotellonFabPed: 0, cBotellonFabEnt: 0,
  cBotellonDomPed: 0, cBotellonDomEnt: 0,
  cBolsaAguaPed: 0, cBolsaAguaEnt: 0,
  cBolsaHieloPed: 0, cBolsaHieloEnt: 0,
};
type Fila = typeof inicio;

async function solicitar() {
  const req = new Request("http://localhost/api/pedidos/recorrido-vial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pedidoIds: [inicio.id],
      origen: { lat: 10.031, lng: -73.232 },
    }),
  });
  return POST(req as Parameters<typeof POST>[0]);
}

function lecturas(antes: Fila, despues: Fila, deudaAntes = 0, deudaDespues = deudaAntes) {
  let lectura = 0;
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      pedido: {
        findMany: vi.fn(async () => ++lectura === 1 ? [antes] : [despues]),
      },
    }),
  );
  let exigibleLectura = 0;
  mocks.exigibles.mockImplementation(async () =>
    new Map([[inicio.id, ++exigibleLectura === 1 ? deudaAntes : deudaDespues]]),
  );
  return () => lectura;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "usuario-sintetico" });
  mocks.permiso.mockResolvedValue(undefined);
  mocks.optimizar.mockResolvedValue({
    ordenPedidoIds: [inicio.id], totalParadas: 1,
    proveedor: "HEIGIT_VROOM",
  });
});

describe("#959 recorrido vial: segundo corte de lectura adversarial", () => {
  it("ruta sin cambios: una sola optimización y dos verificaciones de PostgreSQL", async () => {
    const cuenta = lecturas(inicio, inicio);
    const response = await solicitar();
    expect(response.status).toBe(200);
    expect(cuenta()).toBe(2);
    expect(mocks.optimizar).toHaveBeenCalledTimes(1);
  });

  it("pedido completado mientras responde el proveedor: descarta la ruta", async () => {
    const final = { ...inicio, estadoEntrega: "ENTREGADO", items: [
      { ...inicio.items[0], cantEntrega: 5 },
    ] };
    const cuenta = lecturas(inicio, final);
    const response = await solicitar();
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/cambiaron/i);
    expect(cuenta()).toBe(2);
    expect(mocks.optimizar).toHaveBeenCalledTimes(1);
  });

  it("cambio de dirección durante cálculo: no devuelve recorrido anterior", async () => {
    lecturas(inicio, { ...inicio, entregaLng: -73.231 });
    const response = await solicitar();
    expect(response.status).toBe(409);
    expect(mocks.optimizar).toHaveBeenCalledTimes(1);
  });

  it("entrega parcial adicional y cambio de deuda invalidan snapshot", async () => {
    lecturas(inicio, { ...inicio, items: [
      { ...inicio.items[0], cantEntrega: 3 },
    ] }, 9000, 0);
    expect((await solicitar()).status).toBe(409);
  });

  it("entregado antes de calcular: rechaza sin gastar solicitud de proveedor", async () => {
    const entregado = { ...inicio, estadoEntrega: "ENTREGADO", items: [
      { ...inicio.items[0], cantEntrega: 5 },
    ] };
    lecturas(entregado, entregado);
    expect((await solicitar()).status).toBe(409);
    expect(mocks.optimizar).not.toHaveBeenCalled();
  });
});
