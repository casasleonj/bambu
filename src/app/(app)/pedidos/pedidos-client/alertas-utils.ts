/**
 * Shim de backward-compat.
 *
 * La logica del detector de alertas vive en src/lib/alertas-detector.ts
 * (puro, testeable). Este archivo queda como re-export para no romper
 * los imports existentes desde pedidos-client.
 *
 * Commit: feat(api) /alertas/umbrales endpoint + detector movido a /lib
 */
export {
  calcularAlertas,
  calcularAlertasCliente,
  calcularAlertasRepartidor,
  calcularPromedioCliente,
  findPrecioMinimo,
  type AlertaItem,
  type AlertaRow,
  type AlertaRepartidorRow,
  type AlertaTipo,
  type SeveridadAlerta,
  type CalcularAlertasOptions,
  type CalcularAlertasClienteOptions,
  type CalcularAlertasRepartidorOptions,
  type EmbarqueBase,
  type PrecioMinimoRow,
  REGLAS_ALERTAS,
  getGuiaAlerta,
} from '@/lib/alertas-detector'
