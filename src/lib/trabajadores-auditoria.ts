import type { Trabajador } from '@prisma/client'

/** Configuración de pago verificable, sin teléfonos ni datos de terceros. */
export function datosPagoTrabajador(t: Trabajador) {
  return {
    nombre: t.nombre, rol: t.rol, tipoPago: t.tipoPago, usaMoto: t.usaMoto, capacidadKg: t.capacidadKg,
    comPacaAgua: Number(t.comPacaAgua), comPacaHielo: Number(t.comPacaHielo), comBotellon: Number(t.comBotellon),
    comRepartAgua: Number(t.comRepartAgua), comRepartHielo: Number(t.comRepartHielo), comRepartBotellon: Number(t.comRepartBotellon),
    salarioFijo: Number(t.salarioFijo), frecuenciaPago: t.frecuenciaPago, diasPago: [...t.diasPago],
    frecuenciaDesde: t.frecuenciaDesde?.toISOString() ?? null, pagoFueraDeCaja: t.pagoFueraDeCaja,
  }
}
