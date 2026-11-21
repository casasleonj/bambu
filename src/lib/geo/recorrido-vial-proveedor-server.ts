import 'server-only'

import type {
  ResultadoRecorridoVial,
  SolicitudRecorridoVial,
} from './google-route-optimization'
import {
  configuracionGoogleRuta,
  optimizarRecorridoGoogle,
} from './google-route-optimization-server'
import {
  configuracionHeiGit,
  optimizarRecorridoHeiGit,
} from './heigit-vroom-server'

export type ProveedorRecorridoVial = 'google' | 'heigit'

export class ProveedorVialInvalidoError extends Error {
  constructor() {
    super('El proveedor vial no está configurado correctamente.')
    this.name = 'ProveedorVialInvalidoError'
  }
}

/** La selección es exclusiva, explícita y nunca se hace por caída de un proveedor. */
export function proveedorRecorridoVial(
  env: Record<string, string | undefined> = process.env,
): ProveedorRecorridoVial {
  const configurado = env.RECORRIDO_VIAL_PROVIDER ?? 'google'
  if (configurado !== 'google' && configurado !== 'heigit')
    throw new ProveedorVialInvalidoError()
  return configurado
}

export function comprobarProveedorRecorridoVial(): ProveedorRecorridoVial {
  const proveedor = proveedorRecorridoVial()
  if (proveedor === 'google') configuracionGoogleRuta()
  else configuracionHeiGit()
  return proveedor
}

export async function optimizarRecorridoVial(
  input: SolicitudRecorridoVial,
): Promise<ResultadoRecorridoVial> {
  const proveedor = comprobarProveedorRecorridoVial()
  return proveedor === 'google'
    ? optimizarRecorridoGoogle(input)
    : optimizarRecorridoHeiGit(input)
}
