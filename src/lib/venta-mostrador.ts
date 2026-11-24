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

/** Máxima diferencia para considerar `fecha` y `entregadoAt` el MISMO instante de creación.
 * Ambas salen de la misma operación, sin esperas entre medias (en producción la mayor diferencia
 * observada fue de 1 ms). Una diferencia mayor es una entrega distinta de la venta: incierta. */
export const TOLERANCIA_MISMA_OPERACION_MS = 1000;

/**
 * #989: venta que nace entregada (venta rápida, incluida la «venta en ruta» a Domicilio,
 * o venta libre en ruta). No depende del canal ni de la igualdad exacta al milisegundo
 * (dos `new Date()` consecutivos podían diferir 1 ms): `entregadoAt` debe ser el instante de
 * la propia venta. El origen la identifica porque estas ventas se crean con la mercancía ya
 * entregada (`cantEntrega = cantPedido`). Quien la use debe verificar además que el pedido
 * esté completo y sin ajustes. La hora es la del registro; en VENTA_LIBRE se declara «sin verificar».
 */
export function esVentaEntregadaAlCrear(p: {
  origen?: string | null;
  estadoEntrega: string;
  fecha: Instante;
  entregadoAt?: Instante;
}): boolean {
  const venta = ms(p.fecha);
  const entrega = ms(p.entregadoAt);
  return (
    (p.origen === "VENTA_RAPIDA" || p.origen === "VENTA_LIBRE") &&
    p.estadoEntrega === "ENTREGADO" &&
    venta !== null &&
    entrega !== null &&
    Math.abs(entrega - venta) <= TOLERANCIA_MISMA_OPERACION_MS
  );
}

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
