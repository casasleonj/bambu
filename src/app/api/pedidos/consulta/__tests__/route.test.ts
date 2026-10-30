import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  permiso: vi.fn(),
  consulta: vi.fn(),
}));
vi.mock("@/lib/auth-check", () => ({
  requireAuth: mocks.auth,
  requirePermission: mocks.permiso,
}));
vi.mock("@/lib/pedidos-consulta.repository", () => ({
  consultarPedidos: mocks.consulta,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { GET } from "../route";
describe("#516 — permisos y fallos de consulta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "actor", role: "ASISTENTE" } });
    mocks.permiso.mockResolvedValue(null);
    mocks.consulta.mockResolvedValue({ pedidos: [], total: 0, resumen: null });
  });
  it("autentica antes de leer filtros o acceder a datos", async () => {
    mocks.auth.mockResolvedValue(new Response("Sin sesión", { status: 401 }));
    expect(
      (await GET(new NextRequest("http://localhost/api/pedidos/consulta")))
        .status,
    ).toBe(401);
    expect(mocks.consulta).not.toHaveBeenCalled();
    expect(mocks.permiso).not.toHaveBeenCalled();
  });
  it("view:pedidos se exige sin ampliar roles ni permitir precios a REPARTIDOR/SELLADOR", async () => {
    mocks.permiso.mockResolvedValue(
      new Response("Sin permiso", { status: 403 }),
    );
    expect(
      (await GET(new NextRequest("http://localhost/api/pedidos/consulta")))
        .status,
    ).toBe(403);
    expect(mocks.permiso).toHaveBeenCalledWith(
      "view:pedidos",
      expect.anything(),
    );
    expect(mocks.consulta).not.toHaveBeenCalled();
  });
  it("entrada inválida devuelve 400 y no consulta otra fecha", async () => {
    expect(
      (
        await GET(
          new NextRequest(
            "http://localhost/api/pedidos/consulta?desde=2026-02-30",
          ),
        )
      ).status,
    ).toBe(400);
    expect(mocks.consulta).not.toHaveBeenCalled();
  });
  it("no transforma un fallo de la fuente en cero pedidos o cero dinero", async () => {
    mocks.consulta.mockRejectedValue(new Error("DB no disponible"));
    const r = await GET(
      new NextRequest("http://localhost/api/pedidos/consulta"),
    );
    expect(r.status).toBe(503);
    expect(await r.json()).not.toHaveProperty("pedidos");
  });
  it("la respuesta no se comparte entre usuarios ni se cachea", async () => {
    const r = await GET(
      new NextRequest("http://localhost/api/pedidos/consulta?canal=PUNTO"),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.consulta).toHaveBeenCalledWith(
      expect.objectContaining({ canal: ["PUNTO"] }),
      "ASISTENTE",
    );
  });
});
