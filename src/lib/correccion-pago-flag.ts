/** ADR-CORRECCION-MONETARIA-002: corregir un Pago sin Abono. Apagada por defecto; se activa solo después de la migración y de
 *  desplegar los lectores tolerantes (fase 2a). Apagarla detiene la creación de correcciones ancladas a un pago; las ya creadas
 *  quedan y siguen siendo legibles. */
export const correccionPagoActiva = (): boolean => process.env.CORRECCION_PAGO_SIN_ABONO === 'true'
