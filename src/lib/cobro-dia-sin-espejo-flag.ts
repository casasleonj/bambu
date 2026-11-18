import { correccionPagoActiva } from './correccion-pago-flag'

/** #796 paso 3: el cobro del día de la entrega no es cartera, así que `pagar-fiado` deja de crearle el `Abono` espejo.
 *  Apagada por defecto. Solo tiene efecto si CORRECCION_PAGO_SIN_ABONO también está activa: sin ese camino de
 *  reversión, un pago sin abono no se podría corregir. Apagarla vuelve a crear espejos; los pagos ya registrados sin
 *  espejo quedan y siguen siendo legibles (Cierre, factura, integridad) y corregibles por su ruta propia. */
export const cobroDelDiaSinEspejoSolicitado = (): boolean => process.env.COBRO_DIA_SIN_ESPEJO === 'true'

export const cobroDelDiaSinEspejoActivo = (): boolean => cobroDelDiaSinEspejoSolicitado() && correccionPagoActiva()
