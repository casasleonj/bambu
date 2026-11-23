import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResumenConsulta } from "../resumen-consulta";
import type {
  FiltrosConsultaPedidos,
  ResumenConsultaPedidos,
} from "@/lib/pedidos-consulta";

const resumen = {
  importe: 95500,
  pagado: 20000,
  saldo: 75500,
  fiado: 0,
  pendienteEntrega: 0,
  productos: [],
  entregasPorConciliar: 0,
  cobros: null,
} as unknown as ResumenConsultaPedidos;
const filtros = {
  all: true,
  canal: ["PUNTO", "DOMICILIO"],
  repartidorId: [],
  fechaBase: "pedido",
} as unknown as FiltrosConsultaPedidos;

function movil(esMovil: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (q: string) => ({
      matches: esMovil && q.includes("max-width"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

describe("ResumenConsulta colapsable", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("en móvil empieza cerrado, con la línea corta", () => {
    movil(true);
    render(<ResumenConsulta resumen={resumen} filtros={filtros} />);
    const boton = screen.getByTestId("consulta-resumen-alternar");
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("consulta-resumen-linea")).toHaveTextContent("Por cobrar de lo entregado");
    expect(document.getElementById("consulta-resumen-detalle")).toHaveAttribute("hidden");
  });

  it("en escritorio empieza abierto", () => {
    movil(false);
    render(<ResumenConsulta resumen={resumen} filtros={filtros} />);
    expect(screen.getByTestId("consulta-resumen-alternar")).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("consulta-resumen-linea")).toBeNull();
  });

  it("al abrirlo en móvil se recuerda en este dispositivo", () => {
    movil(true);
    const { unmount } = render(<ResumenConsulta resumen={resumen} filtros={filtros} />);
    fireEvent.click(screen.getByTestId("consulta-resumen-alternar"));
    expect(screen.getByTestId("consulta-resumen-alternar")).toHaveAttribute("aria-expanded", "true");
    unmount();
    render(<ResumenConsulta resumen={resumen} filtros={filtros} />);
    expect(screen.getByTestId("consulta-resumen-alternar")).toHaveAttribute("aria-expanded", "true");
  });
  it("muestra 581 entregadas hoy y explica por qué no son las 571 de pedidos fechados hoy", () => {
    movil(true);
    const conOperacion = {
      ...resumen,
      productos: [{ producto: "PACA_AGUA", pedidas: 571, entregadas: 571 }],
      operacionDia: {
        total: 581,
        productos: [{
          producto: "PACA_AGUA",
          entregadasHoy: 581,
          dePedidosFecha: 571,
          dePedidosAnteriores: 10,
          porConciliarOrigen: 0,
        }],
      },
    };
    const historicos = { ...filtros, all: false, desde: "2026-11-21", hasta: "2026-11-21", canal: [] } as FiltrosConsultaPedidos;
    render(<ResumenConsulta resumen={conOperacion} filtros={historicos} />);
    expect(screen.getByTestId("consulta-total-fisico-hoy")).toHaveTextContent("581");
    fireEvent.click(screen.getByTestId("consulta-resumen-alternar"));
    expect(screen.getByTestId("consulta-resumen-operacion-hoy")).toHaveTextContent("2026-11-21: 581 productos");
    expect(screen.getByTestId("consulta-resumen-operacion-hoy")).toHaveTextContent("571 de pedidos fechados ese día");
    expect(screen.getByTestId("consulta-resumen-operacion-hoy")).toHaveTextContent("10 de pedidos anteriores");
    // #853 Fase 2: los acumulados de pedidos fechados ese día ya no se muestran en esta vista.
    expect(screen.queryByTestId("consulta-cohorte-fecha-pedido")).toBeNull();
    expect(screen.queryByTestId("consulta-productos-resumen")).toBeNull();
    expect(screen.queryByText(/Ver acumulados de pedidos fechados/)).toBeNull();
    expect(screen.queryByText(/571 pedidas/)).toBeNull();
  });

  it("nunca muestra un origen en cero: «0 de pedidos anteriores» no aparece", () => {
    movil(true);
    const conOperacion = {
      ...resumen,
      operacionDia: {
        total: 581,
        productos: [
          { producto: "BOTELLON", entregadasHoy: 1, dePedidosFecha: 1, dePedidosAnteriores: 0, porConciliarOrigen: 0 },
          { producto: "PACA_AGUA", entregadasHoy: 578, dePedidosFecha: 568, dePedidosAnteriores: 10, porConciliarOrigen: 0 },
          { producto: "PACA_HIELO", entregadasHoy: 2, dePedidosFecha: 2, dePedidosAnteriores: 0, porConciliarOrigen: 0 },
        ],
      },
    };
    const historicos = { ...filtros, all: false, desde: "2026-11-21", hasta: "2026-11-21", canal: [] } as FiltrosConsultaPedidos;
    render(<ResumenConsulta resumen={conOperacion} filtros={historicos} />);
    fireEvent.click(screen.getByTestId("consulta-resumen-alternar"));
    const bloque = screen.getByTestId("consulta-resumen-operacion-hoy");
    expect(bloque).not.toHaveTextContent(/\b0 de /);
    expect(bloque.querySelector('[data-producto-hoy="BOTELLON"]')).toHaveTextContent("1 de pedidos fechados ese día");
    expect(bloque.querySelector('[data-producto-hoy="PACA_HIELO"]')).toHaveTextContent("2 de pedidos fechados ese día");
    expect(bloque.querySelector('[data-producto-hoy="PACA_AGUA"]')).toHaveTextContent(
      "568 de pedidos fechados ese día · 10 de pedidos anteriores",
    );
    // Un día pasado no muestra «por gestionar» ni «faltan».
    expect(bloque).not.toHaveTextContent(/faltan|por gestionar/);
  });

  it("cuando falla la lectura física no muestra un cero ficticio", () => {
    movil(true);
    render(<ResumenConsulta resumen={{ ...resumen, operacionDiaError: true }} filtros={filtros} />);
    expect(screen.getByText("Entregas de la fecha consultada por conciliar")).toBeInTheDocument();
    expect(screen.queryByTestId("consulta-total-fisico-hoy")).toBeNull();
  });

});

describe("ResumenConsulta · Operación de hoy (#853 Fase 2)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());
  const dia = { ...filtros, all: false, desde: "2026-11-22", hasta: "2026-11-22", canal: [] } as FiltrosConsultaPedidos;
  const c = (porGestionar: number, ajustes: number, entregadasHoy: number, faltan: number) => ({ porGestionar, ajustes, entregadasHoy, faltan });
  const balance = {
    productos: [
      {
        producto: "PACA_AGUA",
        grupos: { pedidosHoy: c(410, 0, 262, 148), pendientesAnteriores: c(50, 0, 40, 10), parcialesAnteriores: c(20, 0, 15, 5) },
        total: c(480, 0, 317, 163),
      },
      {
        producto: "PACA_HIELO",
        grupos: { pedidosHoy: c(24, 0, 22, 2), pendientesAnteriores: c(0, 0, 0, 0), parcialesAnteriores: c(0, 0, 0, 0) },
        total: c(24, 0, 22, 2),
      },
      {
        producto: "BOTELLON",
        grupos: { pedidosHoy: c(1, 0, 1, 0), pendientesAnteriores: c(0, 0, 0, 0), parcialesAnteriores: c(0, 0, 0, 0) },
        total: c(1, 0, 1, 0),
      },
    ],
    pedidosUnicos: { pedidosHoy: 120, pendientesAnteriores: 6, parcialesAnteriores: 3, total: 129 },
    porConciliar: { pedidosSinDesglose: 1, pedidosInconsistentes: 0, edicionesSinCantidades: 1 },
  };
  const conBalance = (extra: Partial<ResumenConsultaPedidos> = {}) =>
    ({
      ...resumen,
      operacionDia: { total: 340, productos: [] },
      balanceOperativo: balance,
      ...extra,
    }) as unknown as ResumenConsultaPedidos;
  const abrir = () => {
    movil(false);
    render(<ResumenConsulta resumen={conBalance()} filtros={dia} />);
  };

  it("por producto: entregadas, por gestionar y faltan, con los pedidos únicos en el título", () => {
    abrir();
    const bloque = screen.getByTestId("consulta-resumen-operacion-hoy");
    expect(bloque).toHaveTextContent("Operación de hoy: 129 pedidos");
    const agua = bloque.querySelector('[data-producto-hoy="PACA_AGUA"]')!;
    expect(agua).toHaveTextContent("317 entregadas");
    expect(agua).toHaveTextContent("de 480 por gestionar");
    expect(screen.getByTestId("faltan-PACA_AGUA")).toHaveTextContent("faltan 163");
    expect(agua).toHaveTextContent("262 de pedidos de hoy · 40 de pendientes anteriores · 15 de parciales anteriores");
    expect(screen.getByTestId("faltan-BOTELLON")).toHaveTextContent("faltan 0");
    expect(bloque.querySelector('[data-producto-hoy="BOTELLON"]')).toHaveTextContent("1 entregada");
  });

  it("un origen sin entregas no aparece en la línea y nunca hay «0 de …»", () => {
    abrir();
    const hielo = screen.getByTestId("consulta-resumen-operacion-hoy").querySelector('[data-producto-hoy="PACA_HIELO"]')!;
    expect(hielo).toHaveTextContent("22 de pedidos de hoy");
    expect(hielo).not.toHaveTextContent(/pendientes anteriores|parciales anteriores/);
    expect(screen.getByTestId("consulta-resumen-operacion-hoy")).not.toHaveTextContent(/\b0 de /);
  });

  it("«Ver por origen» muestra los tres grupos con su total y sin filas en ceros", () => {
    abrir();
    const agua = screen.getByTestId("consulta-resumen-operacion-hoy").querySelector('[data-producto-hoy="PACA_AGUA"]')!;
    expect(agua.querySelectorAll("tr[data-grupo]")).toHaveLength(3);
    expect(agua.querySelector("tfoot, tbody tr:last-child")).toHaveTextContent("480");
    const hielo = screen.getByTestId("consulta-resumen-operacion-hoy").querySelector('[data-producto-hoy="PACA_HIELO"]')!;
    expect(hielo.querySelectorAll("tr[data-grupo]")).toHaveLength(1);
    expect(agua).not.toHaveTextContent("Ajus.");
  });

  it("los ajustes aparecen solo si existen y la demanda del día los incluye", () => {
    movil(false);
    const conAjuste = {
      ...balance,
      productos: [
        {
          producto: "PACA_HIELO",
          grupos: { pedidosHoy: c(26, -2, 22, 2), pendientesAnteriores: c(8, 0, 8, 0), parcialesAnteriores: c(4, 0, 2, 2) },
          total: c(38, -2, 32, 4),
        },
      ],
    };
    render(<ResumenConsulta resumen={conBalance({ balanceOperativo: conAjuste } as Partial<ResumenConsultaPedidos>)} filtros={dia} />);
    const fila = screen.getByTestId("consulta-resumen-operacion-hoy").querySelector('[data-producto-hoy="PACA_HIELO"]')!;
    expect(fila).toHaveTextContent("de 36 por gestionar · 2 cancelados o reducidos");
    expect(fila).toHaveTextContent("Ajus.");
    expect(screen.getByTestId("faltan-PACA_HIELO")).toHaveTextContent("faltan 4");
    // Sin ajuste en el grupo: «–», no un «0» (regla del PO de no mostrar ceros).
    const celdaAjuste = (g: string) => fila.querySelector(`tr[data-grupo="${g}"]`)!.querySelectorAll("td")[2];
    expect(celdaAjuste("pendientesAnteriores")).toHaveTextContent("–");
    expect(celdaAjuste("parcialesAnteriores")).toHaveTextContent("–");
    expect(celdaAjuste("pedidosHoy")).toHaveTextContent("-2");
  });

  it("avisa los pedidos por conciliar sin asignarles pendiente inicial", () => {
    abrir();
    expect(screen.getByTestId("operacion-hoy-por-conciliar")).toHaveTextContent("2 pedidos por conciliar");
  });

  it("sin nada por gestionar ni entregas: mensaje claro, sin ceros inventados", () => {
    movil(false);
    const vacio = { productos: [], pedidosUnicos: { pedidosHoy: 0, pendientesAnteriores: 0, parcialesAnteriores: 0, total: 0 }, porConciliar: { pedidosSinDesglose: 0, pedidosInconsistentes: 0, edicionesSinCantidades: 0 } };
    render(<ResumenConsulta resumen={conBalance({ balanceOperativo: vacio } as Partial<ResumenConsultaPedidos>)} filtros={dia} />);
    expect(screen.getByTestId("operacion-hoy-vacia")).toHaveTextContent("Hoy no hay pedidos por gestionar ni entregas registradas.");
    expect(screen.queryByTestId("operacion-hoy-por-conciliar")).toBeNull();
  });

  it("si falla el balance: error con «Reintentar», sin cifras inventadas", () => {
    movil(false);
    const reintentar = vi.fn();
    render(
      <ResumenConsulta
        resumen={{ ...resumen, operacionDia: { total: 340, productos: [] }, balanceOperativoError: true } as unknown as ResumenConsultaPedidos}
        filtros={dia}
        onReintentar={reintentar}
      />,
    );
    expect(screen.getByTestId("operacion-hoy-error")).toHaveTextContent("No se pudo calcular el balance de hoy");
    expect(screen.queryByText(/faltan \d+/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledTimes(1);
  });

  it("no muestra los acumulados de pedidos fechados ese día ni «Entregas físicas» cuando hay balance", () => {
    abrir();
    expect(screen.queryByTestId("consulta-cohorte-fecha-pedido")).toBeNull();
    expect(screen.queryByText(/Entregas físicas del/)).toBeNull();
  });
});
