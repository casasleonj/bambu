import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGestionAdmin } from "../use-gestion-admin";
describe("#516 — estado verificable de gestión directa", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());
  it("fallo no se declara configuración apagada; permite reintentar", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Sin red"));
    const h = renderHook(() => useGestionAdmin(true));
    await waitFor(() => expect(h.result.current.estadoConsulta).toBe("error"));
    expect(h.result.current.activa).toBe(false);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        activa: true,
        repartidores: [{ id: "r1", nombre: "Juan" }],
      }),
    });
    act(() => h.result.current.reintentar?.());
    await waitFor(() =>
      expect(h.result.current.estadoConsulta).toBe("verificado"),
    );
    expect(h.result.current.activa).toBe(true);
  });
  it("desactivación explícita sí es un estado verificado", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, activa: false, repartidores: [] }),
    });
    const h = renderHook(() => useGestionAdmin(true));
    await waitFor(() =>
      expect(h.result.current.estadoConsulta).toBe("verificado"),
    );
    expect(h.result.current.activa).toBe(false);
  });
  it("un perfil sin autoridad no consulta ni recibe la acción", () => {
    const h = renderHook(() => useGestionAdmin(false));
    expect(h.result.current.activa).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
