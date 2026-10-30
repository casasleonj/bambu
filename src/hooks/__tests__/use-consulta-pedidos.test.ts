import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConsultaPedidos } from "../use-consulta-pedidos";
import {
  leerFiltrosConsulta,
  parametrosConsulta,
  type ResultadoConsultaPedidos,
} from "@/lib/pedidos-consulta";
const filtros = (search = "") =>
  leerFiltrosConsulta(
    new URLSearchParams(search ? "search=" + search : ""),
    "2026-10-30",
  );
const lectura = (f = filtros(), total = 2): ResultadoConsultaPedidos => ({
  consultaKey: parametrosConsulta(f).toString(),
  pedidos: [],
  total,
  page: 1,
  pageSize: 25,
  leidoAt: "2026-10-30T12:00:00Z",
  resumen: null,
  repartidores: [],
});
const response = (data: ResultadoConsultaPedidos, status = 200) =>
  new Response(JSON.stringify({ success: true, ...data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("#516 — lista y resumen conservan la identidad de la lectura", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());
  it("muestra el snapshot SSR mientras revalida sin vaciar las cifras", async () => {
    const f = filtros(),
      initial = lectura(f);
    fetchMock.mockResolvedValueOnce(response(lectura(f, 3)));
    const h = renderHook(() => useConsultaPedidos(f, 0, true, initial));
    expect(h.result.current.lectura?.datos.total).toBe(2);
    await waitFor(() => expect(h.result.current.lectura?.datos.total).toBe(3));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("un fallo de actualización mantiene datos, filtros y hora de la lectura anterior", async () => {
    const f = filtros();
    fetchMock.mockResolvedValueOnce(response(lectura(f)));
    const h = renderHook(() => useConsultaPedidos(f, 0));
    await waitFor(() => expect(h.result.current.lectura).not.toBeNull());
    fetchMock.mockRejectedValueOnce(new Error("Sin conexión"));
    await act(async () => {
      await h.result.current.refetch();
    });
    expect(h.result.current.lectura?.datos.total).toBe(2);
    expect(h.result.current.lectura?.datos.leidoAt).toBe(
      "2026-10-30T12:00:00Z",
    );
    expect(h.result.current.error).toBe("Sin conexión");
  });
  it("una respuesta tardía de otro filtro no reemplaza la consulta nueva", async () => {
    let resolver!: (r: Response) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((r) => {
            resolver = r;
          }),
      )
      .mockResolvedValueOnce(response(lectura(filtros("nuevo"), 5)));
    const h = renderHook(({ f }) => useConsultaPedidos(f, 0), {
      initialProps: { f: filtros("anterior") },
    });
    h.rerender({ f: filtros("nuevo") });
    await waitFor(() => expect(h.result.current.lectura?.datos.total).toBe(5));
    await act(async () => {
      resolver(response(lectura(filtros("anterior"), 99)));
    });
    expect(h.result.current.lectura?.datos.total).toBe(5);
    expect(h.result.current.lectura?.filtros.search).toBe("nuevo");
  });
  it("rechaza una respuesta asociada a otra consulta aunque sea un HTTP 200", async () => {
    fetchMock.mockResolvedValueOnce(response(lectura(filtros("otro"))));
    const h = renderHook(() => useConsultaPedidos(filtros(), 0));
    await waitFor(() => expect(h.result.current.error).toBeTruthy());
    expect(h.result.current.lectura).toBeNull();
  });
  it("al perder autorización borra la lectura privada anterior", async () => {
    const f = filtros();
    fetchMock.mockResolvedValueOnce(response(lectura(f)));
    const h = renderHook(() => useConsultaPedidos(f, 0));
    await waitFor(() => expect(h.result.current.lectura).not.toBeNull());
    fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));
    await act(async () => {
      await h.result.current.refetch();
    });
    expect(h.result.current.lectura).toBeNull();
    expect(h.result.current.error).toMatch(/perfil/);
  });
});
