/**
 * #854/#602: venta de mostrador entregada al vender. Nace ENTREGADA con `entregadoAt` igual, al
 * milisegundo, a `fecha` (CrearPedidoUseCase; los históricos de Punto se rellenaron con la misma
 * regla). La hora de la entrega es la de la venta y las unidades entregadas son las del pedido.
 * Función pura, sin dependencias de servidor: la usan el lector de entregas y la pantalla.
 */
type Instante = Date | string | null | undefined;

const ms = (v: Instante): number | null => {
  if (v === null || v === undefined) return null;
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isFinite(t) ? t : null;
};

export function esVentaMostradorEntregadaAlVender(p: {
  canal: string;
  estadoEntrega: string;
  fecha: Instante;
  entregadoAt?: Instante;
}): boolean {
  const entrega = ms(p.entregadoAt);
  return (
    p.canal === "PUNTO" &&
    p.estadoEntrega === "ENTREGADO" &&
    entrega !== null &&
    entrega === ms(p.fecha)
  );
}
