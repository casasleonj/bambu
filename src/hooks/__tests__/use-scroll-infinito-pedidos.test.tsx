import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  leerFiltrosConsulta,
  parametrosConsulta,
  type FiltrosConsultaPedidos,
  type ResultadoConsultaPedidos,
} from "@/lib/pedidos-consulta";
import type { Pedido } from "@/app/(app)/pedidos/pedido-hub/types";
import { useScrollInfinitoPedidos } from "../use-scroll-infinito-pedidos";

const filtros = leerFiltrosConsulta(new URLSearchParams("agrupar=barrio&pageSize=25"), "2026-11-27");
const filas = (desde: number, cantidad: number): Pedido[] =>
  Array.from({ length: cantidad }, (_, indice) => ({
    id: "p-" + (desde + indice),
  })) as Pedido[];

const primera = (f: FiltrosConsultaPedidos, total = 51, sello = "2026-11-27T20:00:00.000Z"): ResultadoConsultaPedidos =>
  ({
    consultaKey: parametrosConsulta(f).toString(),
    pedidos: filas(1, 25), total, page: 1, pageSize: f.pageSize, leidoAt: sello,
    grupos: [], resumen: null,
  }) as ResultadoConsultaPedidos;

const respuesta = (f: FiltrosConsultaPedidos, page: number, total: number, pedidos: Pedido[]) => ({
  ok: true, status: 200,
  json: async () => ({
    success: true, consultaKey: parametrosConsulta({ ...f, page }).toString(),
    pedidos, total, page, pageSize: f.pageSize, leidoAt: "2026-11-27T20:01:00.000Z",
  }),
}) as Response;

afterEach(() => vi.unstubAllGlobals());

describe("#1046 scroll infinito en Recorrido / Cercanía", () => {
  it("carga páginas incrementales sin tocar URL, orden o totales globales", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respuesta(filtros, 2, 51, filas(26, 25)))
      .mockResolvedValueOnce(respuesta(filtros, 3, 51, filas(51, 1)));
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/pedidos?agrupar=barrio&pageSize=25");
    const base = primera(filtros);
    const { result } = renderHook(() => useScrollInfinitoPedidos({
      activo: true, base, filtros, pendienteBase: false, cambiando: false,
    }));
    expect(result.current.datos?.pedidos).toHaveLength(25);
    await act(async () => { await result.current.cargarMas(); });
    expect(result.current.datos?.pedidos).toHaveLength(50);
    expect(result.current.hayMas).toBe(true);
    await act(async () => { await result.current.cargarMas(); });
    expect(result.current.datos?.pedidos).toHaveLength(51);
    expect(result.current.datos?.total).toBe(51);
    expect(result.current.datos?.pedidos.map(p => p.id)).toEqual(filas(1, 51).map(p => p.id));
    expect(result.current.hayMas).toBe(false);
    expect(window.location.search).toBe("?agrupar=barrio&pageSize=25");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("page=2");
    expect(String(fetchMock.mock.calls[1][0])).toContain("page=3");
  });

  it("no dispara dos peticiones en paralelo por doble clic", async () => {
    let responder!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { responder = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const base = primera(filtros);
    const { result } = renderHook(() => useScrollInfinitoPedidos({
      activo: true, base, filtros, pendienteBase: false, cambiando: false,
    }));
    let pendiente!: Promise<void>;
    await act(async () => {
      pendiente = result.current.cargarMas();
      void result.current.cargarMas();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      responder(respuesta(filtros, 2, 51, filas(26, 25)));
      await pendiente;
    });
    expect(result.current.datos?.pedidos).toHaveLength(50);
  });

  it("si cambia el universo o se duplica un ID, bloquea la mezcla y permite reintento", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respuesta(filtros, 2, 52, filas(26, 25)))
      .mockResolvedValueOnce(respuesta(filtros, 2, 51, [filas(1, 1)[0], ...filas(27, 24)]))
      .mockResolvedValueOnce(respuesta(filtros, 2, 51, filas(26, 25)));
    vi.stubGlobal("fetch", fetchMock);
    const base = primera(filtros);
    const { result } = renderHook(() => useScrollInfinitoPedidos({
      activo: true, base, filtros, pendienteBase: false, cambiando: false,
    }));
    await act(async () => { await result.current.cargarMas(); });
    expect(result.current.errorMas).toMatch(/cambiaron/);
    expect(result.current.datos?.pedidos).toHaveLength(25);
    await act(async () => { await result.current.cargarMas(); });
    expect(result.current.errorMas).toMatch(/cambiaron/);
    await act(async () => { await result.current.cargarMas(); });
    expect(result.current.errorMas).toBeNull();
    expect(result.current.datos?.pedidos).toHaveLength(50);
  });

  it("no filtra páginas de un modo o fecha anteriores hacia otra consulta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(filtros, 2, 51, filas(26, 25)));
    vi.stubGlobal("fetch", fetchMock);
    const base = primera(filtros);
    const nuevosFiltros = leerFiltrosConsulta(
      new URLSearchParams("agrupar=barrio&pageSize=25&search=Juan"), "2026-11-27");
    const nuevaBase = primera(nuevosFiltros, 25, "2026-11-27T20:05:00.000Z");
    const { result, rerender } = renderHook(
      ({ f, b, activo }: { f: FiltrosConsultaPedidos; b: ResultadoConsultaPedidos; activo: boolean }) =>
        useScrollInfinitoPedidos({ activo, base: b, filtros: f, cambiando: false, pendienteBase: false }),
      { initialProps: { f: filtros, b: base, activo: true } },
    );
    await act(async () => { await result.current.cargarMas(); });
    expect(result.current.datos?.pedidos).toHaveLength(50);
    rerender({ f: nuevosFiltros, b: nuevaBase, activo: true });
    expect(result.current.datos?.pedidos).toHaveLength(25);
    expect(result.current.hayMas).toBe(false);
    rerender({ f: nuevosFiltros, b: nuevaBase, activo: false });
    expect(result.current.datos).toBeNull();
  });

  it("un resultado previo aún en vuelo no contamina una consulta posterior", async () => {
    let responder!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { responder = resolve; })));
    const base = primera(filtros);
    const otroFiltro = leerFiltrosConsulta(new URLSearchParams("pageSize=25&search=Pedro"), "2026-11-27");
    const otraBase = primera(otroFiltro, 25, "2026-11-27T21:00:00Z");
    const { result, rerender } = renderHook(
      ({ f, b }: { f: FiltrosConsultaPedidos; b: ResultadoConsultaPedidos }) =>
        useScrollInfinitoPedidos({ activo: true, base: b, filtros: f, cambiando: false, pendienteBase: false }),
      { initialProps: { f: filtros, b: base } },
    );
    let pendiente!: Promise<void>;
    await act(async () => { pendiente = result.current.cargarMas(); });
    rerender({ f: otroFiltro, b: otraBase });
    await act(async () => { responder(respuesta(filtros, 2, 51, filas(26, 25))); await pendiente; });
    expect(result.current.datos?.consultaKey).toBe(otraBase.consultaKey);
    expect(result.current.datos?.pedidos).toHaveLength(25);
  });
});
